// The pure, deterministic game reducer (§5.2, §21). Maps domain events to new game
// state + affinity + effects. NEVER reads the clock or rng — `now` and `newId` are
// injected so cap/threshold/spawn behavior is fully testable.
//
// Combat is now an ACTIVE boss fight: the monster attacks on its own CTB turn, characters have
// per-character HP/MP (GameState.resources; missing entry = full), skills are cast as
// their own event, and gold is earned. Monster-damage + victory resolution is shared
// by todo-completion and skill-cast via resolveMonsterDamage.

import { applyAffinityGain } from '../companion/affinity'
import { unlockedSkills, type SkillDef } from '../companion/skills'
import {
  AFFINITY_JOURNAL_TOTAL,
  AFFINITY_TODO_COMPLETE,
  ENEMY_ATK_MULT,
  ENEMY_DEF_SOAK,
  GOLD_QUEST_CLEAR,
  GOLD_TODO,
  JOURNAL_XP,
  MP_REGEN_TODO,
  OVERDUE_ATK_GROW,
  OVERDUE_HP_GROW,
  OVERDUE_PARTY_DMG,
  PRIORITY_MULT,
  SKILL_ATK_MULT,
  SKILL_BUFF_TURNS,
  SKILL_HEAL_MULT,
  TODO_XP,
  VICTORY_AFFINITY,
  VICTORY_HP_RESTORE_PCT,
  VICTORY_MP_RESTORE_PCT,
  WIPE_MONSTER_HEAL_PCT,
  WIPE_REVIVE_HP_PCT,
} from '../domain/config'
import { localDateKey } from '../domain/dates'
import type { Affinity, CharResource, Character, GameState, ID, Mood, MoodFlag, OwnedEquipment, Priority, Quest, QuestReward, SkillId, Stats } from '../domain/types'
import type { SynergyDef } from '../world/relationships'
import { ctbRound, defeatRewards, monsterFromEncounter, spawnMonster, type CtbUnit } from './combat'
import { effectiveStats, type CombatContext } from './effectiveStats'
import type { DomainEvent } from './events'
import { applyXp } from './leveling'

export interface ReducerInput {
  gameState: GameState
  affinities: Record<ID, Affinity>
  party: Character[]
  now: Date
  newId: () => string
  /** count of open high-priority todos (for next-monster sizing on victory). */
  openHighCount: number
  /** Worldview combat modifiers (default empty → identity, M0 unchanged). */
  ownedEquipment?: OwnedEquipment[]
  activeSynergies?: SynergyDef[]
  /** The active story quest, if any (materialized upstream; reducer only reads it). */
  quest?: Quest
}

function combatCtx(input: ReducerInput): CombatContext {
  return {
    ownedEquipment: input.ownedEquipment ?? [],
    activeSynergies: input.activeSynergies ?? [],
    partyBuffs: input.gameState.partyBuffs, // def/spd/magPct fold into effectiveStats
  }
}

export type GameEffect =
  | { type: 'damage'; amount: number; monsterHpAfter: number; actorId: ID; fromSkill?: boolean }
  | { type: 'monsterGrew'; hpDelta: number; atkDelta: number }
  | { type: 'affinity'; characterId: ID; amount: number; rankedUpTo: string | null }
  | { type: 'charXp'; characterId: ID; amount: number; levelsGained: number }
  | { type: 'victory'; defeatedMonsterId: ID; storyStage: number }
  | { type: 'mood'; characterId: ID; flag: GameState['moodFlags'][string] }
  // Active combat (skills / enemy turn-attacks / resources)
  | { type: 'skillCast'; skillId: SkillId; casterId: ID; skillKind: 'attack' | 'heal' | 'buff' | 'debuff'; amount: number }
  | { type: 'heal'; targetId: ID; amount: number }
  | { type: 'enemyAttack'; targetId: ID; amount: number }
  | { type: 'downed'; characterId: ID }
  | { type: 'partyWiped' }
  // Worldview / storyline (§22)
  | { type: 'encounterCleared'; questId: ID; encounterIndex: number; victoryText?: string; nextEnemy?: string }
  | { type: 'questCompleted'; questId: ID; reward: QuestReward }
  | { type: 'recruited'; companionId: ID }
  | { type: 'equipmentGranted'; defId: string; instanceId: ID }

export interface ReducerResult {
  gameState: GameState
  affinities: Record<ID, Affinity>
  /** Updated stats for any character whose stats changed (e.g. XP/level). */
  characterStats: Record<ID, Stats>
  effects: GameEffect[]
}

// ---------- Shared mutable "turn" context ----------

interface Turn {
  gs: GameState // a mutable copy; resources/partyBuffs are also cloned
  party: Character[]
  combatants: Character[] // player + on-field companions
  input: ReducerInput
  effects: GameEffect[]
  stats: Record<ID, Stats> // characterStats deltas (post-XP)
  aff: Record<ID, Affinity>
}

function newTurn(input: ReducerInput): Turn {
  const gs: GameState = {
    ...input.gameState,
    resources: { ...input.gameState.resources },
    partyBuffs: [...input.gameState.partyBuffs],
  }
  const combatants = input.party.filter((c) => c.kind === 'player' || c.kind === 'companion')
  return { gs, party: input.party, combatants, input, effects: [], stats: {}, aff: { ...input.affinities } }
}

function finishTurn(t: Turn): ReducerResult {
  t.gs.lastResolvedAt = t.input.now.toISOString()
  return { gameState: t.gs, affinities: t.aff, characterStats: t.stats, effects: t.effects }
}

/** Current (possibly leveled-up) stats for a character. */
function sOf(t: Turn, c: Character): Stats {
  return t.stats[c.id] ?? c.stats
}
/** Current HP/MP; missing entry = full (at the character's current max). */
function rOf(t: Turn, c: Character): CharResource {
  const s = sOf(t, c)
  return t.gs.resources[c.id] ?? { hp: s.maxHp, mp: s.maxMp }
}
function setR(t: Turn, c: Character, r: CharResource): void {
  const s = sOf(t, c)
  t.gs.resources[c.id] = {
    hp: Math.max(0, Math.min(s.maxHp, Math.round(r.hp))),
    mp: Math.max(0, Math.min(s.maxMp, Math.round(r.mp))),
  }
}

function grantXp(t: Turn, amount: number): void {
  if (amount <= 0) return
  for (const c of t.combatants) {
    const r = applyXp(sOf(t, c), c.classId, amount)
    t.stats[c.id] = r.stats
    t.effects.push({ type: 'charXp', characterId: c.id, amount, levelsGained: r.levelsGained })
  }
}

function activeCompanion(party: Character[]): Character | undefined {
  return party.find((c) => c.kind === 'companion')
}

/** Apply `amountEach` affinity to EVERY on-field companion (each honoring its own daily cap). */
function applyAffinityToEach(t: Turn, amountEach: number): void {
  if (amountEach <= 0) return
  const today = localDateKey(t.input.now)
  for (const c of t.party) {
    if (c.kind !== 'companion' || !t.aff[c.id]) continue
    const res = applyAffinityGain(t.aff[c.id], amountEach, today)
    t.aff[c.id] = res.affinity
    if (res.applied > 0) {
      t.effects.push({ type: 'affinity', characterId: c.id, amount: res.applied, rankedUpTo: res.rankedUpTo })
    }
  }
}

/** Todo-completion / victory affinity: the WHOLE party bonds with you — each on-field
 *  companion gains the full amount (user: "完成代办、打赢战斗时好感队伍里都增加"). */
function gainAffinity(t: Turn, amount: number): void {
  applyAffinityToEach(t, amount)
}

/** Split a total affinity gain across all present companions (floor(total/N) each), each
 *  honoring its own daily cap. Used by JournalWritten (§7/§21 "+8 split among present"). */
function gainAffinitySplit(t: Turn, total: number): void {
  const present = t.party.filter((c) => c.kind === 'companion' && t.aff[c.id])
  if (present.length === 0) return
  applyAffinityToEach(t, Math.floor(total / present.length))
}

function activeAtkBuff(gs: GameState): number {
  return gs.partyBuffs.reduce((m, b) => (b.kind === 'atkPct' ? m + b.magnitude : m), 0)
}
function decayBuffs(t: Turn): void {
  // Skill buffs decay per completion (turnsLeft); habit buffs/debuffs are untilVictory and
  // are left untouched here (cleared on victory instead).
  t.gs.partyBuffs = t.gs.partyBuffs
    .map((b) => (b.untilVictory ? b : { ...b, turnsLeft: (b.turnsLeft ?? 0) - 1 }))
    .filter((b) => b.untilVictory || (b.turnsLeft ?? 0) > 0)
}

/** Apply HP damage to the on-field character best able to soak it (highest current HP). */
function dealToParty(t: Turn, rawAmount: number): void {
  const alive = t.combatants.filter((c) => rOf(t, c).hp > 0)
  if (alive.length === 0) return
  const target = alive.reduce((a, b) => (rOf(t, a).hp >= rOf(t, b).hp ? a : b))
  const def = effectiveStats(target, combatCtx(t.input)).def
  const dmg = Math.max(1, Math.round(rawAmount - def * ENEMY_DEF_SOAK))
  const r = rOf(t, target)
  const hpAfter = Math.max(0, r.hp - dmg)
  setR(t, target, { ...r, hp: hpAfter })
  t.effects.push({ type: 'enemyAttack', targetId: target.id, amount: dmg })
  if (hpAfter <= 0) t.effects.push({ type: 'downed', characterId: target.id })
}

/** Setback when every on-field member is downed: revive low, the monster recovers some HP. */
function wipeCheck(t: Turn): void {
  if (t.combatants.some((c) => rOf(t, c).hp > 0)) return
  for (const c of t.combatants) {
    setR(t, c, { hp: sOf(t, c).maxHp * WIPE_REVIVE_HP_PCT, mp: rOf(t, c).mp })
  }
  const m = t.gs.monster
  t.gs.monster = { ...m, hp: Math.min(m.maxHp, Math.round(m.hp + m.maxHp * WIPE_MONSTER_HEAL_PCT)) }
  t.effects.push({ type: 'partyWiped' })
}

function healChar(t: Turn, c: Character, amount: number): void {
  const r = rOf(t, c)
  const max = sOf(t, c).maxHp
  if (r.hp >= max) return
  const after = Math.min(max, r.hp + amount)
  setR(t, c, { ...r, hp: after })
  t.effects.push({ type: 'heal', targetId: c.id, amount: after - r.hp })
}

// ---------- Active-turn (CTB) helper ----------

/** The live CTB units (living combatants + the monster) from the current persistent gauges. */
function ctbUnitsOf(t: Turn, ctx: CombatContext): CtbUnit[] {
  const able = t.combatants.filter((c) => rOf(t, c).hp > 0)
  return [
    ...able.map((c) => ({ side: 'party' as const, id: c.id, spd: effectiveStats(c, ctx).spd, charge: t.gs.charge[c.id] ?? 0 })),
    { side: 'enemy' as const, id: t.gs.monster.id, spd: t.gs.monster.spd, charge: t.gs.charge[t.gs.monster.id] ?? 0 },
  ]
}

/** Apply damage to the monster and, if it falls, resolve the full victory (shared by
 *  todo completion and skill kills). Returns true on a fresh victory. */
function resolveMonsterDamage(t: Turn, dmg: number, actorId: ID, fromSkill = false): boolean {
  const m = t.gs.monster
  const monsterId = m.id
  const hpAfter = Math.max(0, m.hp - dmg)
  t.gs.monster = { ...m, hp: hpAfter }
  t.effects.push({ type: 'damage', amount: dmg, monsterHpAfter: hpAfter, actorId, fromSkill })
  if (hpAfter > 0 || t.gs.defeatedMonsterId === monsterId) return false

  // VICTORY — the main payout, scaled to the defeated enemy's strength.
  t.gs.storyStage += 1
  t.gs.defeatedMonsterId = monsterId
  // Habit buffs/debuffs last only until a victory — clear them now (skill buffs keep decaying).
  t.gs.partyBuffs = t.gs.partyBuffs.filter((b) => !b.untilVictory)
  const reward = defeatRewards(m)
  grantXp(t, reward.xp)
  gainAffinity(t, VICTORY_AFFINITY)
  t.gs.gold += reward.gold
  // A breather: restore some HP/MP to the party.
  for (const c of t.combatants) {
    const r = rOf(t, c)
    const s = sOf(t, c)
    setR(t, c, { hp: r.hp + s.maxHp * VICTORY_HP_RESTORE_PCT, mp: r.mp + s.maxMp * VICTORY_MP_RESTORE_PCT })
  }

  const quest = t.input.quest
  const newId = t.input.newId
  if (quest && t.gs.activeQuestId === quest.id) {
    const clearedIdx = t.gs.encounterIndex
    const cleared = quest.encounters[clearedIdx]
    const nextIdx = clearedIdx + 1
    const nextEnc = quest.encounters[nextIdx]
    if (nextEnc) {
      t.gs.encounterIndex = nextIdx
      t.gs.monster = monsterFromEncounter(nextEnc, t.gs.storyStage, t.input.openHighCount, newId)
      t.effects.push({
        type: 'encounterCleared', questId: quest.id, encounterIndex: clearedIdx,
        victoryText: cleared?.narrationVictory, nextEnemy: nextEnc.enemyName,
      })
    } else {
      t.effects.push({ type: 'encounterCleared', questId: quest.id, encounterIndex: clearedIdx, victoryText: cleared?.narrationVictory })
      t.effects.push({ type: 'questCompleted', questId: quest.id, reward: quest.reward })
      for (const id of quest.reward.unlockCompanionIds) {
        if (!t.gs.unlockedCompanionIds.includes(id)) {
          t.gs.unlockedCompanionIds = [...t.gs.unlockedCompanionIds, id]
          t.effects.push({ type: 'recruited', companionId: id })
        }
      }
      for (const defId of quest.reward.equipmentDefIds) {
        const instanceId = newId()
        t.gs.ownedEquipment = [...t.gs.ownedEquipment, { instanceId, defId, acquiredAt: t.input.now.toISOString() }]
        t.effects.push({ type: 'equipmentGranted', defId, instanceId })
      }
      grantXp(t, quest.reward.playerXp ?? 0)
      t.gs.gold += GOLD_QUEST_CLEAR
      t.gs.activeQuestId = undefined
      t.gs.monster = spawnMonster(t.gs.storyStage, t.input.openHighCount, newId)
    }
  } else {
    t.gs.monster = spawnMonster(t.gs.storyStage, t.input.openHighCount, newId)
    t.effects.push({ type: 'victory', defeatedMonsterId: monsterId, storyStage: t.gs.storyStage })
  }
  return true
}

// ---------- Event entry ----------

/** No-op result echoing inputs (for unwired events / invalid casts). */
function noop(input: ReducerInput): ReducerResult {
  return { gameState: input.gameState, affinities: input.affinities, characterStats: {}, effects: [] }
}

export function gameReducer(input: ReducerInput, event: DomainEvent): ReducerResult {
  switch (event.type) {
    case 'TodoCompleted':
      return reduceTodoCompleted(input, event.todo.priority)
    case 'TodoOverdue':
      return reduceTodoOverdue(input)
    case 'JournalWritten':
      return reduceJournalWritten(input, event.entry.mood)
    // Unwired — kept for the extensibility contract.
    case 'CalendarEventAttended':
    case 'FocusStreak':
    case 'DialogueInteraction':
      return noop(input)
  }
}

/** Spend a planned skill's cost and apply its effect (attack/heal/buff/debuff), pushing the
 *  skillCast log line. The caller has already checked the caster is alive and can pay. The attack
 *  damage is tagged `fromSkill` so the log shows only the cast line (the float still counts it).
 *  Returns true iff an attack skill landed the killing blow. */
function applySkillEffect(t: Turn, caster: Character, skill: SkillDef, ctx: CombatContext): boolean {
  const r = rOf(t, caster)
  setR(t, caster, { hp: r.hp - (skill.hpCost ?? 0), mp: r.mp - skill.mpCost })
  const casterId = caster.id
  const eff = effectiveStats(caster, ctx)
  if (skill.kind === 'attack') {
    // Physical skills scale off atk; magic skills (scaling: 'mag') off the caster's magic.
    const scaleStat = skill.scaling === 'mag' ? eff.mag : eff.atk
    const dmg = Math.max(1, Math.round(scaleStat * skill.power * SKILL_ATK_MULT - t.gs.monster.def))
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: dmg })
    return resolveMonsterDamage(t, dmg, casterId, true)
  }
  if (skill.kind === 'heal') {
    const heal = Math.round(eff.mag * skill.power * SKILL_HEAL_MULT)
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'heal', amount: heal })
    if (skill.target === 'allAllies') {
      for (const c of t.combatants) healChar(t, c, heal)
    } else {
      const injured = t.combatants.filter((c) => rOf(t, c).hp < sOf(t, c).maxHp).sort((a, b) => rOf(t, a).hp - rOf(t, b).hp)[0]
      if (injured) healChar(t, injured, heal)
    }
    return false
  }
  if (skill.kind === 'buff') {
    t.gs.partyBuffs = [
      ...t.gs.partyBuffs,
      { id: t.input.newId(), kind: 'atkPct', magnitude: skill.power, turnsLeft: SKILL_BUFF_TURNS, sourceId: casterId },
    ]
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'buff', amount: Math.round(skill.power * 100) })
    return false
  }
  // debuff: lower the current monster's defense.
  const m = t.gs.monster
  t.gs.monster = { ...m, def: Math.max(0, Math.round(m.def * (1 - skill.power))) }
  t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'debuff', amount: Math.round(skill.power * 100) })
  return false
}

function reduceTodoCompleted(input: ReducerInput, priority: Priority): ReducerResult {
  const t = newTurn(input)
  const ctx = combatCtx(input)
  // Each member's hit scales by the todo's priority (the round's "push") and active buffs.
  const mult = PRIORITY_MULT[priority] * (1 + activeAtkBuff(t.gs))

  // 1. One completed task = ONE round (ctbRound): advance the PERSISTENT charge-time timeline by a
  // window wide enough that every living member takes its turn in speed order; a fast member that
  // crosses twice laps (套圈) for a bonus hit, and the enemy attacks when its gauge crosses (its turn).
  // Gauges carry across completions, so lapping accrues over the fight.
  const units = ctbUnitsOf(t, ctx)
  const { order, charges } = ctbRound(units)

  // Each party turn performs that member's PLANNED action (gs.roundPlan): a skill on its FIRST turn
  // this round (if owned, unlocked, alive, affordable), else a basic attack. Laps always basic-attack
  // (one planned skill per member per round). The enemy attacks on its own turns.
  const actedThisRound = new Set<ID>()
  let victory = false
  for (const act of order) {
    if (victory) break // the enemy is down — stop resolving turns
    if (act.side === 'party') {
      const member = t.combatants.find((c) => c.id === act.id)
      if (!member || rOf(t, member).hp <= 0) continue // downed mid-timeline → can't act
      const firstTurn = !actedThisRound.has(member.id)
      actedThisRound.add(member.id)
      const plannedId = firstTurn ? t.gs.roundPlan[member.id] : undefined
      const skill = plannedId ? unlockedSkills(member).find((s) => s.id === plannedId) : undefined
      const r = rOf(t, member)
      if (skill && r.mp >= skill.mpCost && r.hp > (skill.hpCost ?? 0)) {
        victory = applySkillEffect(t, member, skill, ctx) // planned skill fires (spends MP/HP)
      } else {
        const dmg = Math.max(1, Math.round(effectiveStats(member, ctx).atk * mult - t.gs.monster.def))
        victory = resolveMonsterDamage(t, dmg, member.id) // basic attack (priority-scaled)
      }
    } else {
      dealToParty(t, t.gs.monster.atk * ENEMY_ATK_MULT) // the enemy's turn — strike the sturdiest
    }
  }

  // Persist the gauges (current combatants + the current monster; a respawned enemy starts at 0).
  const nextCharge: Record<ID, number> = {}
  for (const c of t.combatants) nextCharge[c.id] = charges[c.id] ?? t.gs.charge[c.id] ?? 0
  nextCharge[t.gs.monster.id] = charges[t.gs.monster.id] ?? 0
  t.gs.charge = nextCharge

  // 2. Rewards are PER TASK, not per turn — extra turns add damage, never extra loot (anti-farm).
  grantXp(t, TODO_XP[priority])
  gainAffinity(t, AFFINITY_TODO_COMPLETE)
  for (const c of t.combatants) {
    const r = rOf(t, c)
    if (r.mp < sOf(t, c).maxMp) setR(t, c, { ...r, mp: r.mp + MP_REGEN_TODO[priority] })
  }
  t.gs.gold += GOLD_TODO[priority]
  decayBuffs(t)
  if (!victory) wipeCheck(t) // all on-field members downed across the round = a setback

  return finishTurn(t)
}

function reduceTodoOverdue(input: ReducerInput): ReducerResult {
  const t = newTurn(input)
  const m = t.gs.monster

  // The 心魔 feeds on procrastination: it grows AND lands a hit on the party.
  t.gs.monster = {
    ...m,
    hp: Math.min(m.maxHp, m.hp + OVERDUE_HP_GROW),
    maxHp: m.maxHp + OVERDUE_HP_GROW,
    atk: m.atk + OVERDUE_ATK_GROW,
  }
  t.effects.push({ type: 'monsterGrew', hpDelta: OVERDUE_HP_GROW, atkDelta: OVERDUE_ATK_GROW })
  dealToParty(t, OVERDUE_PARTY_DMG)
  wipeCheck(t)

  // The active companion becomes worried (biases next greeting/canned line).
  const companion = activeCompanion(t.party)
  if (companion) {
    t.gs.moodFlags = { ...t.gs.moodFlags, [companion.id]: 'worried' }
    t.effects.push({ type: 'mood', characterId: companion.id, flag: 'worried' })
  }
  return finishTurn(t)
}

/** Map a journal mood to the companion mood-flag it evokes (§21). Neutral → no flag. */
function moodToFlag(mood: Mood): MoodFlag | null {
  if (mood === 'great' || mood === 'good') return 'proud'
  if (mood === 'down' || mood === 'bad') return 'concerned'
  return null
}

/** Journaling (§7/§21): a reflective act, NOT a combat action — it never damages the enemy
 *  or draws an enemy attack. Party-wide XP + affinity split among present companions, both granted
 *  once per local day (anti-farm). The journal's mood biases the next companion line. */
function reduceJournalWritten(input: ReducerInput, mood: Mood): ReducerResult {
  const t = newTurn(input)
  const today = localDateKey(t.input.now)
  if (t.gs.lastJournalRewardOn !== today) {
    grantXp(t, JOURNAL_XP)
    gainAffinitySplit(t, AFFINITY_JOURNAL_TOTAL)
    t.gs.lastJournalRewardOn = today
  }
  const flag = moodToFlag(mood)
  const companion = activeCompanion(t.party)
  if (companion && flag) {
    t.gs.moodFlags = { ...t.gs.moodFlags, [companion.id]: flag }
    t.effects.push({ type: 'mood', characterId: companion.id, flag })
  }
  return finishTurn(t)
}
