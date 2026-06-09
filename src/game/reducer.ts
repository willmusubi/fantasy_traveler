// The pure, deterministic game reducer (§5.2, §21). Maps domain events to new game
// state + affinity + effects. NEVER reads the clock or rng — `now` and `newId` are
// injected so cap/threshold/spawn behavior is fully testable.
//
// Combat is an ACTIVE team fight: each enemy in gs.enemies attacks on its own CTB turn, characters
// have per-character HP/MP (GameState.resources; missing entry = full), skills are cast as their
// own event, and gold is earned. Per-enemy damage (damageEnemy) is split from the whole-team
// clear cascade (resolveEncounterClear); both are shared by todo-completion and skill-cast.

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
import type { ActiveRound, Affinity, CharResource, Character, GameEffect, GameState, ID, Mood, MoodFlag, Monster, OwnedEquipment, PartyBuff, Priority, Quest, QuestReward, ScriptChapter, ScriptDef, SkillId, Stats, TurnActor } from '../domain/types'
import type { SynergyDef } from '../world/relationships'
import { autoTargetEnemy, ctbRound, defeatRewards, livingEnemies, primaryEnemy, spawnMonster, teamCleared, teamFromEncounter, type CtbUnit } from './combat'
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
  /** The active branching script (§23), if any (resolved upstream from content; reducer only reads it). */
  script?: ScriptDef
}

function combatCtx(input: ReducerInput): CombatContext {
  return {
    ownedEquipment: input.ownedEquipment ?? [],
    activeSynergies: input.activeSynergies ?? [],
    partyBuffs: input.gameState.partyBuffs, // def/spd/magPct fold into effectiveStats
  }
}

// GameEffect now lives in domain/types.ts (so GameState.activeRound can reference it without a
// domain→game cycle); re-exported here for existing importers (combatLog, etc.).
export type { GameEffect }

export interface ReducerResult {
  gameState: GameState
  affinities: Record<ID, Affinity>
  /** Updated stats for any character whose stats changed (e.g. XP/level). */
  characterStats: Record<ID, Stats>
  effects: GameEffect[]
  /** Present only on the dispatch that FINALIZES an interactive round: the full round's effects +
   *  log context, so the pipeline builds ONE combat-log entry (per-step dispatches skip logging). */
  roundLog?: { effects: GameEffect[]; enemies: Monster[]; goldDelta: number }
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

/** Apply HP damage to the on-field character best able to soak it (highest current HP). The
 *  combat `ctx` is passed in (not recomputed) so a round's enemy turns use the round-start buffs —
 *  keeping the interactive step-through byte-identical to the synchronous path. */
function dealToParty(t: Turn, rawAmount: number, ctx: CombatContext): void {
  const alive = t.combatants.filter((c) => rOf(t, c).hp > 0)
  if (alive.length === 0) return
  const target = alive.reduce((a, b) => (rOf(t, a).hp >= rOf(t, b).hp ? a : b))
  const def = effectiveStats(target, ctx).def
  const dmg = Math.max(1, Math.round(rawAmount - def * ENEMY_DEF_SOAK))
  const r = rOf(t, target)
  const hpAfter = Math.max(0, r.hp - dmg)
  setR(t, target, { ...r, hp: hpAfter })
  t.effects.push({ type: 'enemyAttack', targetId: target.id, amount: dmg })
  if (hpAfter <= 0) t.effects.push({ type: 'downed', characterId: target.id })
}

/** Setback when every on-field member is downed: revive low, the primary enemy recovers some HP. */
function wipeCheck(t: Turn): void {
  if (t.combatants.some((c) => rOf(t, c).hp > 0)) return
  for (const c of t.combatants) {
    setR(t, c, { hp: sOf(t, c).maxHp * WIPE_REVIVE_HP_PCT, mp: rOf(t, c).mp })
  }
  const idx = t.gs.enemies.findIndex((m) => m.hp > 0)
  if (idx < 0) {
    t.effects.push({ type: 'partyWiped' }) // no living enemy to heal — just revive
    return
  }
  const m = t.gs.enemies[idx]
  const hpAfter = Math.min(m.maxHp, Math.round(m.hp + m.maxHp * WIPE_MONSTER_HEAL_PCT))
  const next = [...t.gs.enemies]
  next[idx] = { ...m, hp: hpAfter }
  t.gs.enemies = next
  t.effects.push({ type: 'partyWiped', monsterHealed: hpAfter - m.hp, monsterHpAfter: hpAfter })
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

/** The live CTB units (living combatants + every living enemy) from the current persistent gauges. */
function ctbUnitsOf(t: Turn, ctx: CombatContext): CtbUnit[] {
  const able = t.combatants.filter((c) => rOf(t, c).hp > 0)
  return [
    ...able.map((c) => ({ side: 'party' as const, id: c.id, spd: effectiveStats(c, ctx).spd, charge: t.gs.charge[c.id] ?? 0 })),
    ...livingEnemies(t.gs.enemies).map((m) => ({ side: 'enemy' as const, id: m.id, spd: m.spd, charge: t.gs.charge[m.id] ?? 0 })),
  ]
}

/** Resolve the enemy a single-target action hits: the explicitly chosen LIVING enemy (manual
 *  targeting in the step-through), else the smart auto-target (lowest-HP living). Undefined only
 *  when every enemy is dead. */
function resolveTarget(t: Turn, targetId?: ID): Monster | undefined {
  if (targetId) {
    const chosen = t.gs.enemies.find((m) => m.id === targetId && m.hp > 0)
    if (chosen) return chosen
  }
  return autoTargetEnemy(t.gs.enemies)
}

/** Apply `dmg` to the enemy `enemyId`; push a damage effect carrying `targetId`. If that empties
 *  the LAST living enemy, run the encounter-clear cascade. Returns true on a fresh team-clear.
 *  Shared by todo-completion basic attacks and skill kills. An already-dead enemy is a no-op (an
 *  AoE pass may still name it). */
function damageEnemy(t: Turn, enemyId: ID, dmg: number, actorId: ID, fromSkill = false): boolean {
  const idx = t.gs.enemies.findIndex((m) => m.id === enemyId)
  if (idx < 0) return false
  const m = t.gs.enemies[idx]
  if (m.hp <= 0) return false
  const hpAfter = Math.max(0, m.hp - dmg)
  const next = [...t.gs.enemies]
  next[idx] = { ...m, hp: hpAfter }
  t.gs.enemies = next
  t.effects.push({ type: 'damage', amount: dmg, monsterHpAfter: hpAfter, actorId, targetId: enemyId, fromSkill })
  if (!teamCleared(t.gs.enemies)) return false
  return resolveEncounterClear(t)
}

/** The whole enemy team just fell: book the clear payout ONCE — guarded by `clearedEncounterKey`,
 *  which includes the primary's id so each spawn (endless or quest) is a distinct, re-clearable
 *  encounter — then advance the quest / spawn the next team / spawn the next endless enemy. Reward
 *  sums over the whole team. Returns true. (Was the back half of the old resolveMonsterDamage.) */
function resolveEncounterClear(t: Turn): boolean {
  const primaryId = (primaryEnemy(t.gs.enemies) ?? t.gs.enemies[0])?.id ?? 'none'
  const key = `${t.gs.activeQuestId ?? 'endless'}:${t.gs.encounterIndex}:${primaryId}`
  if (t.gs.clearedEncounterKey === key) return false // already booked this encounter's payout
  t.gs.clearedEncounterKey = key

  // VICTORY — the main payout, scaled to the whole defeated team's strength (sum over all bodies).
  t.gs.storyStage += 1
  // Habit buffs/debuffs last only until a victory — clear them now (skill buffs keep decaying).
  t.gs.partyBuffs = t.gs.partyBuffs.filter((b) => !b.untilVictory)
  const reward = t.gs.enemies.reduce(
    (acc, m) => { const r = defeatRewards(m); return { xp: acc.xp + r.xp, gold: acc.gold + r.gold } },
    { xp: 0, gold: 0 },
  )
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
      t.gs.enemies = teamFromEncounter(nextEnc, t.gs.storyStage, t.input.openHighCount, newId)
      t.effects.push({
        type: 'encounterCleared', questId: quest.id, encounterIndex: clearedIdx,
        victoryText: cleared?.narrationVictory, nextEnemy: nextEnc.enemyName,
      })
    } else {
      // Final encounter of the current quest/chapter cleared. Grant the reward (same as before),
      // then branch: a §23 script-driven chapter transitions per chapter.next (and NEVER falls
      // through to an endless spawn); otherwise the legacy linear path ends the quest and spawns an
      // endless enemy (back-compat — unchanged for non-script worlds + every existing test).
      t.effects.push({ type: 'encounterCleared', questId: quest.id, encounterIndex: clearedIdx, victoryText: cleared?.narrationVictory })
      t.effects.push({ type: 'questCompleted', questId: quest.id, reward: quest.reward })
      grantQuestReward(t, quest.reward)
      t.gs.gold += GOLD_QUEST_CLEAR

      const script = t.input.script
      const chapter = script && t.gs.currentChapterId ? script.chapters[t.gs.currentChapterId] : undefined
      if (script && chapter) {
        applyChapterTransition(t, script, chapter)
      } else {
        t.gs.activeQuestId = undefined
        t.gs.enemies = [spawnMonster(t.gs.storyStage, t.input.openHighCount, newId)]
      }
    }
  } else {
    t.gs.enemies = [spawnMonster(t.gs.storyStage, t.input.openHighCount, newId)]
    t.effects.push({ type: 'victory', defeatedMonsterId: primaryId, storyStage: t.gs.storyStage, nextEnemyHp: t.gs.enemies[0].maxHp })
  }
  return true
}

// ---------- Script (branching campaign, §23) ----------

/** Grant a quest/chapter reward onto the turn: recruit companions, grant equipment, player XP.
 *  Shared by the linear quest-complete path and the §23 script paths (incl. choice options). The
 *  flat GOLD_QUEST_CLEAR clear-bonus is granted by the caller (it's a clear bonus, not part of the
 *  reward), so a follow-up choice option doesn't double-pay it. */
function grantQuestReward(t: Turn, reward: QuestReward): void {
  for (const id of reward.unlockCompanionIds) {
    if (!t.gs.unlockedCompanionIds.includes(id)) {
      t.gs.unlockedCompanionIds = [...t.gs.unlockedCompanionIds, id]
      t.effects.push({ type: 'recruited', companionId: id })
    }
  }
  for (const defId of reward.equipmentDefIds) {
    const instanceId = t.input.newId()
    t.gs.ownedEquipment = [...t.gs.ownedEquipment, { instanceId, defId, acquiredAt: t.input.now.toISOString() }]
    t.effects.push({ type: 'equipmentGranted', defId, instanceId })
  }
  grantXp(t, reward.playerXp ?? 0)
}

/** §23: after a chapter's final boss, transition per chapter.next. Mutates `t`.
 *  - string chapterId → advance (pointer set; the pipeline materializes + spawns the next chapter).
 *  - ScriptChoice → push scriptChoiceOffered and PAUSE (no spawn; the defeated team stays until a pick).
 *  - null → campaign finale: end cleanly with NO endless spawn (this is the "repeats forever" fix). */
function applyChapterTransition(t: Turn, script: ScriptDef, chapter: ScriptChapter): void {
  const next = chapter.next
  if (typeof next === 'string') {
    advanceToChapter(t, script, next)
  } else if (next && typeof next === 'object') {
    t.effects.push({ type: 'scriptChoiceOffered', prompt: next.prompt, options: next.options })
  } else {
    finishScript(t, script)
  }
}

/** §23: point the campaign at `nextId`; the PIPELINE materializes its quest + spawns enemies (the
 *  pure reducer has no quest data for the next chapter, so it never spawns here). Unknown id → finale. */
function advanceToChapter(t: Turn, script: ScriptDef, nextId: string): void {
  const ch = script.chapters[nextId]
  if (!ch) {
    finishScript(t, script)
    return
  }
  t.gs.currentChapterId = nextId
  t.gs.encounterIndex = 0
  t.gs.clearedEncounterKey = undefined
  t.effects.push({ type: 'scriptChapterAdvanced', chapterId: nextId, firstEnemy: ch.encounters[0]?.enemyName })
}

/** §23: end the campaign — push scriptCompleted, clear the script/quest pointers, empty the enemy
 *  team (NO endless spawn). The store offers save-as-副本 / replay / return on this effect. */
function finishScript(t: Turn, script: ScriptDef): void {
  t.effects.push({ type: 'scriptCompleted', scriptId: script.id, flags: t.gs.scriptFlags })
  // §24: remember this campaign as 已通过 so it isn't silently re-entered (replay must be explicit).
  const done = t.gs.completedScriptIds ?? []
  if (!done.includes(script.id)) t.gs.completedScriptIds = [...done, script.id]
  t.gs.activeQuestId = undefined
  t.gs.activeScriptId = undefined
  t.gs.currentChapterId = undefined
  t.gs.enemies = []
}

/** §23: the player picked a post-boss option in the ScriptChoiceModal. Apply its persistent flags +
 *  unlocks + loot, then advance to the next chapter (pointer set; pipeline spawns) or finish the
 *  campaign. Pure. A stale / invalid pick is a no-op that leaves state intact. */
function reduceScriptChoicePicked(input: ReducerInput, optionId: string): ReducerResult {
  const t = newTurn(input)
  const script = t.input.script
  const chapter = script && t.gs.currentChapterId ? script.chapters[t.gs.currentChapterId] : undefined
  const choice = chapter && chapter.next && typeof chapter.next === 'object' ? chapter.next : undefined
  const option = choice?.options.find((o) => o.id === optionId)
  if (!script || !option) return finishTurn(t)

  if (option.setFlags) t.gs.scriptFlags = { ...t.gs.scriptFlags, ...option.setFlags }
  grantQuestReward(t, {
    equipmentDefIds: option.equipmentDefIds ?? [],
    unlockCompanionIds: option.unlockCompanionIds ?? [],
  })
  if (option.nextChapterId) advanceToChapter(t, script, option.nextChapterId)
  else finishScript(t, script)
  return finishTurn(t)
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
    case 'RoundBegan':
      return reduceRoundBegan(input, event.todo.priority, event.todo.id)
    case 'RoundAdvanced':
      return reduceRoundAdvanced(input, event.choice, event.auto, event.targetId)
    case 'ScriptChoicePicked':
      return reduceScriptChoicePicked(input, event.optionId)
    case 'TodoOverdue':
      return reduceTodoOverdue(input)
    case 'TaskTimerExpired':
      return reduceTaskTimerExpired(input)
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
function applySkillEffect(t: Turn, caster: Character, skill: SkillDef, ctx: CombatContext, targetId?: ID): boolean {
  const r = rOf(t, caster)
  setR(t, caster, { hp: r.hp - (skill.hpCost ?? 0), mp: r.mp - skill.mpCost })
  const casterId = caster.id
  const eff = effectiveStats(caster, ctx)
  if (skill.kind === 'attack') {
    // Physical skills scale off atk; magic skills (scaling: 'mag') off the caster's magic.
    const scaleStat = skill.scaling === 'mag' ? eff.mag : eff.atk
    const power = scaleStat * skill.power * SKILL_ATK_MULT
    if (skill.target === 'allEnemies') {
      // AoE: hit every CURRENTLY-living enemy. Snapshot ids first (a clear respawns the array) and
      // stop once a hit clears the team, so we never strike the freshly-spawned next team.
      const ids = livingEnemies(t.gs.enemies).map((m) => m.id)
      const firstDef = t.gs.enemies.find((m) => m.id === ids[0])?.def ?? 0
      t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: Math.max(1, Math.round(power - firstDef)) })
      let cleared = false
      for (const id of ids) {
        if (cleared) break
        const e = t.gs.enemies.find((m) => m.id === id)
        if (!e || e.hp <= 0) continue
        const dmg = Math.max(1, Math.round(power - e.def))
        cleared = damageEnemy(t, id, dmg, casterId, true) || cleared
      }
      return cleared
    }
    // single-target attack: the chosen enemy, else the auto-target.
    const target = resolveTarget(t, targetId)
    if (!target) return false
    const dmg = Math.max(1, Math.round(power - target.def))
    const monsterHpAfter = Math.max(0, target.hp - dmg) // shown in the log so it reconciles with the bar
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: dmg, monsterHpAfter, targetId: target.id })
    return damageEnemy(t, target.id, dmg, casterId, true)
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
  // debuff: lower defense. 'allEnemies' → every living enemy; else the chosen/auto single target.
  const lowerDef = (m: Monster): Monster => ({ ...m, def: Math.max(0, Math.round(m.def * (1 - skill.power))) })
  if (skill.target === 'allEnemies') {
    t.gs.enemies = t.gs.enemies.map((m) => (m.hp > 0 ? lowerDef(m) : m))
  } else {
    const target = resolveTarget(t, targetId)
    if (target) t.gs.enemies = t.gs.enemies.map((m) => (m.id === target.id ? lowerDef(m) : m))
  }
  t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'debuff', amount: Math.round(skill.power * 100) })
  return false
}

// ---------- Round resolution (shared by the synchronous path AND the interactive step-through) ----------
//
// One completed task = ONE round (ctbRound): the PERSISTENT charge-time timeline advances by a
// window wide enough that every living member takes its turn in speed order; a fast member that
// crosses twice laps (套圈) for a bonus hit; the enemy attacks when its gauge crosses. The
// synchronous path resolves the whole round at once (tests + non-stepping completion); the
// interactive path resolves turn-by-turn, pausing at each ally's first turn. Both feed the SAME
// frozen RoundCtx to the SAME per-turn primitive, so they cannot diverge.

/** A round's frozen snapshot. Computed once at round start and reused for every turn, so a
 *  buff/debuff cast mid-round never shifts another turn's math this round. */
interface RoundCtx {
  priority: Priority
  mult: number
  order: TurnActor[]
  charges: Record<ID, number>
  buffsAtStart: PartyBuff[]
}

/** Build a round's frozen snapshot (ctx/mult/order/charges) WITHOUT resolving any turn. */
function buildRoundCtx(input: ReducerInput, priority: Priority): RoundCtx {
  const t = newTurn(input)
  const ctx = combatCtx(input)
  // Each member's basic hit scales by the todo's priority (the round's "push") and active buffs.
  const mult = PRIORITY_MULT[priority] * (1 + activeAtkBuff(t.gs))
  const { order, charges } = ctbRound(ctbUnitsOf(t, ctx))
  return { priority, mult, order, charges, buffsAtStart: [...input.gameState.partyBuffs] }
}

/** The combat context for a round's turns: equipment/synergies from input, partyBuffs FROZEN to the
 *  round-start snapshot (so the interactive path, which re-reads live state each step, matches the
 *  synchronous path exactly). */
function roundCombatCtx(input: ReducerInput, rctx: RoundCtx): CombatContext {
  return {
    ownedEquipment: input.ownedEquipment ?? [],
    activeSynergies: input.activeSynergies ?? [],
    partyBuffs: rctx.buffsAtStart,
  }
}

/** Resolve order[index] against the live Turn `t`, using the frozen round ctx + mult. A party
 *  member casts its action (explicit `choice`, else gs.roundPlan) on its FIRST turn if
 *  owned/unlocked/alive/affordable, else a basic attack; laps always basic-attack. The enemy
 *  strikes the sturdiest. Mutates `t` and `acted`. Returns true on a killing blow. */
function resolveTurnInto(
  t: Turn,
  rctx: RoundCtx,
  ctx: CombatContext,
  index: number,
  acted: Set<ID>,
  choice?: SkillId | 'basic',
  targetId?: ID,
): boolean {
  const act = rctx.order[index]
  if (act.side !== 'party') {
    // The acting enemy's turn — look it up by id. A lap turn of an enemy that died earlier this
    // round is skipped. It strikes the sturdiest member.
    const attacker = t.gs.enemies.find((m) => m.id === act.id)
    if (!attacker || attacker.hp <= 0) return false
    dealToParty(t, attacker.atk * ENEMY_ATK_MULT, ctx)
    return false
  }
  const member = t.combatants.find((c) => c.id === act.id)
  if (!member || rOf(t, member).hp <= 0) return false // downed mid-timeline → can't act
  const firstTurn = !acted.has(member.id)
  acted.add(member.id)
  const plannedId = firstTurn ? (choice !== undefined ? choice : t.gs.roundPlan[member.id]) : undefined
  const skill = plannedId && plannedId !== 'basic' ? unlockedSkills(member).find((s) => s.id === plannedId) : undefined
  const r = rOf(t, member)
  if (skill && r.mp >= skill.mpCost && r.hp > (skill.hpCost ?? 0)) {
    return applySkillEffect(t, member, skill, ctx, targetId) // planned skill fires (spends MP/HP)
  }
  // Basic attack scales off the member's BEST offensive stat: casters (high mag, low atk) swing with
  // magic so they aren't floored to 1 by the enemy's defense; physical units still use atk (atk≥mag).
  // It hits the chosen target (manual step-through), else the auto-target (lowest-HP living enemy).
  const target = resolveTarget(t, targetId)
  if (!target) return false // no living enemy (e.g. a lap after the team already cleared)
  const eff = effectiveStats(member, ctx)
  const dmg = Math.max(1, Math.round(Math.max(eff.atk, eff.mag) * rctx.mult - target.def))
  return damageEnemy(t, target.id, dmg, member.id) // basic attack (priority-scaled)
}

/** True if order[index] is a LIVE party member taking its FIRST turn — the point the interactive
 *  resolver pauses at for the player's choice (enemy turns, laps and downed slots are auto-run). */
function isLiveDecision(t: Turn, order: TurnActor[], index: number, acted: Set<ID>): boolean {
  const a = order[index]
  if (!a || a.side !== 'party' || acted.has(a.id)) return false
  const member = t.combatants.find((c) => c.id === a.id)
  return !!member && rOf(t, member).hp > 0
}

/** Persist the round's CTB gauges (combatants + every current enemy). A respawned next-team enemy
 *  isn't in `charges` and starts cold at 0; a same-encounter dead enemy keeps its (inert) gauge. */
function commitCharges(t: Turn, charges: Record<ID, number>): void {
  const nextCharge: Record<ID, number> = {}
  for (const c of t.combatants) nextCharge[c.id] = charges[c.id] ?? t.gs.charge[c.id] ?? 0
  for (const m of t.gs.enemies) nextCharge[m.id] = charges[m.id] ?? t.gs.charge[m.id] ?? 0
  t.gs.charge = nextCharge
}

/** Per-TASK rewards (not per turn — extra turns add damage, never extra loot). Runs once at the
 *  end of a round, after all turns resolve. */
function applyTaskRewards(t: Turn, priority: Priority, victory: boolean): void {
  grantXp(t, TODO_XP[priority])
  gainAffinity(t, AFFINITY_TODO_COMPLETE)
  for (const c of t.combatants) {
    const r = rOf(t, c)
    if (r.mp < sOf(t, c).maxMp) setR(t, c, { ...r, mp: r.mp + MP_REGEN_TODO[priority] })
  }
  t.gs.gold += GOLD_TODO[priority]
  decayBuffs(t)
  if (!victory) wipeCheck(t) // all on-field members downed across the round = a setback
}

/** Close out a round: commit gauges, grant per-task rewards, clear activeRound, and attach the full
 *  round's effects (`priorEffects` from earlier interactive dispatches + this dispatch's) as
 *  `roundLog` so the pipeline writes ONE combat-log entry. */
function finalizeRoundInto(t: Turn, ar: ActiveRound, victory: boolean, priorEffects: GameEffect[]): ReducerResult {
  commitCharges(t, ar.charges)
  applyTaskRewards(t, ar.priority, victory)
  t.gs.activeRound = undefined
  const result = finishTurn(t)
  result.roundLog = { effects: [...priorEffects, ...t.effects], enemies: ar.enemiesAtStart, goldDelta: t.gs.gold - ar.goldAtStart }
  return result
}

/** Synchronous path (tests + non-stepping completion): resolve the WHOLE round at once using each
 *  member's gs.roundPlan. Behaviour-identical to the original inline loop. */
function reduceTodoCompleted(input: ReducerInput, priority: Priority): ReducerResult {
  const rctx = buildRoundCtx(input, priority)
  const ctx = roundCombatCtx(input, rctx)
  const t = newTurn(input)
  const acted = new Set<ID>()
  let victory = false
  for (let i = 0; i < rctx.order.length && !victory; i++) {
    victory = resolveTurnInto(t, rctx, ctx, i, acted)
  }
  commitCharges(t, rctx.charges)
  applyTaskRewards(t, priority, victory)
  return finishTurn(t)
}

/** Interactive path — BEGIN: set up activeRound, auto-run any leading enemy turns, and pause at the
 *  first live ally decision (or finalize immediately if there is none — e.g. no living allies). */
function reduceRoundBegan(input: ReducerInput, priority: Priority, todoId: ID): ReducerResult {
  const rctx = buildRoundCtx(input, priority)
  const ctx = roundCombatCtx(input, rctx)
  const t = newTurn(input)
  const acted = new Set<ID>()
  let index = 0
  let victory = false
  while (index < rctx.order.length && !victory && !isLiveDecision(t, rctx.order, index, acted)) {
    victory = resolveTurnInto(t, rctx, ctx, index, acted)
    index++
  }
  const ar: ActiveRound = {
    priority,
    mult: rctx.mult,
    order: rctx.order,
    charges: rctx.charges,
    buffsAtStart: rctx.buffsAtStart,
    index,
    actedFirstTurn: [...acted],
    effects: [...t.effects],
    goldAtStart: input.gameState.gold,
    enemiesAtStart: input.gameState.enemies,
    todoId,
  }
  t.gs.activeRound = ar
  if (index >= rctx.order.length || victory) return finalizeRoundInto(t, ar, victory, [])
  return finishTurn(t)
}

/** Interactive path — ADVANCE: resolve the paused ally with `choice` (or, with `auto`, resolve all
 *  remaining turns using gs.roundPlan), then auto-run to the next live decision or finalize. */
function reduceRoundAdvanced(input: ReducerInput, choice?: SkillId | 'basic', auto?: boolean, targetId?: ID): ReducerResult {
  const t = newTurn(input)
  const ar = t.gs.activeRound
  if (!ar) return noop(input)
  const rctx: RoundCtx = { priority: ar.priority, mult: ar.mult, order: ar.order, charges: ar.charges, buffsAtStart: ar.buffsAtStart }
  const ctx = roundCombatCtx(input, rctx)
  const acted = new Set<ID>(ar.actedFirstTurn)
  let index = ar.index
  let victory = false
  if (auto) {
    while (index < rctx.order.length && !victory) {
      victory = resolveTurnInto(t, rctx, ctx, index, acted)
      index++
    }
  } else {
    if (index < rctx.order.length) {
      victory = resolveTurnInto(t, rctx, ctx, index, acted, choice, targetId)
      index++
    }
    while (index < rctx.order.length && !victory && !isLiveDecision(t, rctx.order, index, acted)) {
      victory = resolveTurnInto(t, rctx, ctx, index, acted)
      index++
    }
  }
  if (index >= rctx.order.length || victory) return finalizeRoundInto(t, ar, victory, ar.effects)
  t.gs.activeRound = { ...ar, index, actedFirstTurn: [...acted], effects: [...ar.effects, ...t.effects] }
  return finishTurn(t)
}

function reduceTodoOverdue(input: ReducerInput): ReducerResult {
  const t = newTurn(input)

  // The 心魔 feeds on procrastination: the PRIMARY enemy grows AND lands a hit on the party.
  const prim = primaryEnemy(t.gs.enemies)
  if (prim) {
    const grown: Monster = {
      ...prim,
      hp: Math.min(prim.maxHp, prim.hp + OVERDUE_HP_GROW),
      maxHp: prim.maxHp + OVERDUE_HP_GROW,
      atk: prim.atk + OVERDUE_ATK_GROW,
    }
    t.gs.enemies = t.gs.enemies.map((m) => (m.id === prim.id ? grown : m))
    t.effects.push({ type: 'monsterGrew', hpDelta: OVERDUE_HP_GROW, atkDelta: OVERDUE_ATK_GROW })
  }
  dealToParty(t, OVERDUE_PARTY_DMG, combatCtx(input))
  wipeCheck(t)

  // The active companion becomes worried (biases next greeting/canned line).
  const companion = activeCompanion(t.party)
  if (companion) {
    t.gs.moodFlags = { ...t.gs.moodFlags, [companion.id]: 'worried' }
    t.effects.push({ type: 'mood', characterId: companion.id, flag: 'worried' })
  }
  return finishTurn(t)
}

/** A todo's countdown ran out before completion: the 心魔 lands ONE ordinary attack (a normal
 *  enemy turn — atk × ENEMY_ATK_MULT on the sturdiest member) on the party. Unlike TodoOverdue it
 *  does NOT grow the monster (it didn't feed on a missed deadline; it just got a free swing). Fires
 *  once — the store stamps timerFiredAt so it never repeats. */
function reduceTaskTimerExpired(input: ReducerInput): ReducerResult {
  const t = newTurn(input)
  const prim = primaryEnemy(t.gs.enemies)
  if (prim) dealToParty(t, prim.atk * ENEMY_ATK_MULT, combatCtx(input))
  wipeCheck(t)

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
