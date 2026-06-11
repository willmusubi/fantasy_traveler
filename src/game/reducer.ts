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
  BOSS_HEAVY_POOL_CAP,
  COUNTER_POWER_PCT,
  DUO_POW_SHARE,
  ENEMY_ATK_MULT,
  ENEMY_DEF_SOAK,
  GOLD_QUEST_CLEAR,
  GOLD_TODO,
  GUARD_ACTION,
  GUARD_DAMAGE_REDUCTION,
  JOURNAL_XP,
  MP_DISCOUNT_PCT,
  MP_REGEN_TODO,
  OVERDUE_ATK_GROW,
  OVERDUE_HP_GROW,
  OVERDUE_PARTY_DMG,
  PRIORITY_MULT,
  SKILL_ATK_MULT,
  SKILL_BUFF_TURNS,
  SKILL_HEAL_MULT,
  SMART_GUARD_HP_PCT,
  SMART_HEAL_HP_PCT,
  TALENT_CRIT_BONUS,
  TALENT_POINT_EVERY_LEVELS,
  TAUNT_ACTION,
  TODO_XP,
  VICTORY_AFFINITY,
  VICTORY_HP_RESTORE_PCT,
  VICTORY_MP_RESTORE_PCT,
  WEAPON_CATEGORY,
  WIPE_MONSTER_HEAL_PCT,
  WIPE_REVIVE_HP_PCT,
} from '../domain/config'
import { localDateKey } from '../domain/dates'
import type { ActiveRound, Affinity, CharResource, Character, CombatStatus, Element, GameEffect, GameState, ID, Mood, MoodFlag, Monster, OwnedEquipment, PartyBuff, PhysKind, Priority, Quest, QuestReward, ScriptChapter, ScriptDef, SkillId, Stats, StatusEffectSpec, StatusKind, TurnActor, WeaponKind } from '../domain/types'
import type { SynergyDef } from '../world/relationships'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { autoTargetEnemy, ctbRound, defeatRewards, livingEnemies, primaryEnemy, spawnMonster, teamCleared, teamFromEncounter, type CtbUnit } from './combat'
import { rollDamage } from './damage'
import { effectiveStats, type CombatContext } from './effectiveStats'
import type { DomainEvent } from './events'
import { profileFor } from '../companion/roster'
import { rankIndex } from '../companion/affinity'
import { duoSkillFor, type DuoSkillDef } from '../companion/duoSkills'
import { canLearn, hasTalentPassive, skillPowerMult } from '../companion/talents'
import { applyXp } from './leveling'
import {
  applyStatus, clearAllStatuses, clearStatusKinds, cloneStatusMap, hasStatus,
  incapacitatedBy, slowedSpd, statusesOf, tickDurations, type StatusMap,
} from './status'

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
  /** §25 injected RNG in [0,1) — like newId, keeps the reducer pure. Consumed ONLY at
   *  turn-resolve time (never in buildRoundCtx, so sync/step paths stay byte-identical).
   *  Default = 0.5 → "neutral" determinism: always hits, never crits, exact mid variance —
   *  legacy callers and tests get formula-exact numbers. The pipeline passes Math.random. */
  roll?: () => number
  /** §26 smart auto tactics. 'smart' (Settings.autoTactics → pipeline) lets a member with NO
   *  explicit plan/choice pick a sensible default — cleanse the afflicted, heal the hurt, guard
   *  at low HP, burst a sleeping enemy — so light players never micromanage. Default 'plain'
   *  (basic attack, exactly the pre-§26 behavior) for legacy callers and tests. */
  tactics?: 'plain' | 'smart'
}

function rollOf(input: ReducerInput): () => number {
  return input.roll ?? (() => 0.5)
}

/** The attack identity of a member's basic swing: equipped weapon's kind/element, falling
 *  back to the profile's first weapon (traveler 'all' → sword) and innate element. */
function attackKindOf(member: Character, ctx: CombatContext): { kind: PhysKind; element?: Element } {
  const oe = ctx.ownedEquipment.find(
    (e) => e.equippedBy === member.id && EQUIPMENT_DEFS[e.defId]?.slot === 'weapon',
  )
  const weapon = oe ? EQUIPMENT_DEFS[oe.defId] : undefined
  const profile = profileFor(member)
  const fallback: WeaponKind = profile.weaponKinds === 'all' ? 'sword' : (profile.weaponKinds[0] ?? 'sword')
  return {
    kind: WEAPON_CATEGORY[weapon?.weaponKind ?? fallback],
    element: weapon?.element ?? profile.element,
  }
}

function combatCtx(input: ReducerInput): CombatContext {
  return {
    ownedEquipment: input.ownedEquipment ?? [],
    activeSynergies: input.activeSynergies ?? [],
    partyBuffs: input.gameState.partyBuffs, // def/spd/magPct fold into effectiveStats
    statuses: input.gameState.activeStatuses, // §26 stat folds (slow→spd), input-time view
    learnedTalents: input.gameState.learnedTalents, // §28 talent stat nodes
  }
}

// ---------- §28 talent / affix helpers (Turn-level) ----------

/** A skill's MP cost for this member (mpDiscount passive folds in, rounded up). */
function skillCostOf(t: Turn, member: Character, skill: SkillDef): number {
  const discounted = hasTalentPassive(member, t.gs.learnedTalents, 'mpDiscount')
  return discounted ? Math.ceil(skill.mpCost * (1 - MP_DISCOUNT_PCT)) : skill.mpCost
}

/** Extra crit % for this member: critBonus talent + critBonus equipment affixes. */
function critBonusOf(t: Turn, member: Character): number {
  let pct = hasTalentPassive(member, t.gs.learnedTalents, 'critBonus') ? TALENT_CRIT_BONUS : 0
  for (const oe of t.input.ownedEquipment ?? []) {
    if (oe.equippedBy !== member.id) continue
    for (const a of EQUIPMENT_DEFS[oe.defId]?.affixes ?? []) {
      if (a.kind === 'critBonus') pct += a.pct
    }
  }
  return pct
}

/** §28 onCritHeal affixes: heal the wielder after a landed CRIT. */
function applyCritHeal(t: Turn, member: Character): void {
  let amount = 0
  for (const oe of t.input.ownedEquipment ?? []) {
    if (oe.equippedBy !== member.id) continue
    for (const a of EQUIPMENT_DEFS[oe.defId]?.affixes ?? []) {
      if (a.kind === 'onCritHeal') amount += a.amount
    }
  }
  if (amount > 0) healChar(t, member, amount)
}

/** §28 statusOnHit affixes: a landed BASIC attack tries each on the surviving target. */
function applyOnHitStatuses(t: Turn, member: Character, targetId: ID): void {
  const target = t.gs.enemies.find((m) => m.id === targetId)
  if (!target || target.hp <= 0) return
  for (const oe of t.input.ownedEquipment ?? []) {
    if (oe.equippedBy !== member.id) continue
    for (const a of EQUIPMENT_DEFS[oe.defId]?.affixes ?? []) {
      if (a.kind === 'statusOnHit') inflict(t, targetId, a.status, target.maxHp, member.id)
    }
  }
}

// ---------- §26 status helpers (Turn-level) ----------

/** Live statuses of one combatant on the mutable turn state. */
function stOf(t: Turn, id: ID): CombatStatus[] {
  return statusesOf(t.gs.activeStatuses, id)
}

/** Try to inflict `spec` on `targetId` (party member OR enemy). chance < 1 consumes ONE roll
 *  (specs without chance stay RNG-free, so existing paths keep formula-exact determinism).
 *  Pushes statusApplied on success. */
function inflict(
  t: Turn, targetId: ID, spec: StatusEffectSpec, targetMaxHp: number, sourceId?: ID,
): boolean {
  const chance = spec.chance ?? 1
  if (chance < 1 && rollOf(t.input)() >= chance) return false
  t.gs.activeStatuses = applyStatus(t.gs.activeStatuses, targetId, spec, targetMaxHp, t.input.newId, sourceId)
  t.effects.push({ type: 'statusApplied', targetId, kind: spec.kind, rounds: spec.rounds, sourceId })
  return true
}

/** Death cleanse: a combatant that hits 0 HP sheds every status (revival starts clean). */
function shedStatuses(t: Turn, id: ID): void {
  if (stOf(t, id).length > 0) t.gs.activeStatuses = clearAllStatuses(t.gs.activeStatuses, id)
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
    activeStatuses: cloneStatusMap(input.gameState.activeStatuses), // §26
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
    const before = sOf(t, c).level
    const r = applyXp(sOf(t, c), profileFor(c), amount)
    t.stats[c.id] = r.stats
    t.effects.push({ type: 'charXp', characterId: c.id, amount, levelsGained: r.levelsGained })
    // §28 — 1 talent point per TALENT_POINT_EVERY_LEVELS levels crossed (lv 5, 10, …).
    if (r.levelsGained > 0) {
      const crossings =
        Math.floor(r.stats.level / TALENT_POINT_EVERY_LEVELS) - Math.floor(before / TALENT_POINT_EVERY_LEVELS)
      if (crossings > 0) {
        const cur = t.gs.talentPoints ?? {}
        t.gs.talentPoints = { ...cur, [c.id]: (cur[c.id] ?? 0) + crossings }
      }
    }
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

/** Apply FLAT HP damage to the on-field character best able to soak it (highest current
 *  HP). Used for penalty hits (overdue feeds, timer expiry) — deterministic, always lands
 *  (a punishment that whiffs teaches nothing). Enemy TURN attacks go through enemyStrike. */
function dealToParty(t: Turn, rawAmount: number, ctx: CombatContext): void {
  const alive = t.combatants.filter((c) => rOf(t, c).hp > 0)
  if (alive.length === 0) return
  const target = alive.reduce((a, b) => (rOf(t, a).hp >= rOf(t, b).hp ? a : b))
  const def = effectiveStats(target, ctx).vit
  const dmg = Math.max(1, Math.round(rawAmount - def * ENEMY_DEF_SOAK))
  const r = rOf(t, target)
  const hpAfter = Math.max(0, r.hp - dmg)
  setR(t, target, { ...r, hp: hpAfter })
  t.effects.push({ type: 'enemyAttack', targetId: target.id, amount: dmg })
  if (hpAfter <= 0) {
    shedStatuses(t, target.id) // §26 death cleanse
    t.effects.push({ type: 'downed', characterId: target.id })
  }
}

/** §26: advance an enemy's rotation pointer; warn if the NEXT move is a telegraphed wind-up.
 *  Shared by enemyStrike (after a swing) and the paralysis skip (the wind-up still telegraphs). */
function advanceEnemyPattern(t: Turn, attacker: Monster): void {
  const moves = attacker.pattern && attacker.pattern.length > 0 ? attacker.pattern : [{ kind: 'attack' as const }]
  const nextIdx = ((attacker.patternIdx ?? 0) + 1) % moves.length
  t.gs.enemies = t.gs.enemies.map((m) => (m.id === attacker.id ? { ...m, patternIdx: nextIdx } : m))
  const nextMove = moves[nextIdx]
  if (nextMove.telegraph) t.effects.push({ type: 'enemyTelegraph', enemyId: attacker.id, text: nextMove.telegraph })
}

/** §25 enemy TURN attack: the next move of the enemy's rotation (no MP), resolved through
 *  the unified pipeline (can miss vs the target's eva; never crits). Strikes the sturdiest
 *  member. Caster-type enemies (matk > atk) swing magic vs spr. Boss heavies ≥2× are
 *  capped at BOSS_HEAVY_POOL_CAP of the party's CURRENT pool, and a telegraphed next-move
 *  pushes an enemyTelegraph effect (the HUD warning). Advances patternIdx. */
function enemyStrike(t: Turn, attacker: Monster, ctx: CombatContext): void {
  const alive = t.combatants.filter((c) => rOf(t, c).hp > 0)
  if (alive.length === 0) return
  // §28 嘲讽: a live taunter draws the hit; otherwise the sturdiest member soaks it.
  const taunter = alive.find((c) => hasStatus(t.gs.activeStatuses, c.id, 'taunt'))
  const target = taunter ?? alive.reduce((a, b) => (rOf(t, a).hp >= rOf(t, b).hp ? a : b))
  const eff = effectiveStats(target, ctx)
  const moves = attacker.pattern && attacker.pattern.length > 0 ? attacker.pattern : [{ kind: 'attack' as const }]
  const idx = (attacker.patternIdx ?? 0) % moves.length
  const move = moves[idx]
  const mult = move.mult ?? 1
  const magic = (attacker.matk ?? 0) > attacker.atk
  const out = rollDamage({
    pow: magic ? (attacker.matk ?? attacker.atk) : attacker.atk,
    power: ENEMY_ATK_MULT * mult,
    def: magic ? eff.spr : eff.vit,
    attackerHit: attacker.hit ?? 8 + Math.max(0, attacker.level - 1),
    targetEva: eff.eva,
    roll: rollOf(t.input), // no attackerSkl → enemies never crit (§25)
  })
  let dmg = out.dmg
  if (!out.missed && attacker.archetype === 'boss' && move.kind === 'heavy' && mult >= 2) {
    const pool = alive.reduce((s, c) => s + rOf(t, c).hp, 0)
    dmg = Math.min(dmg, Math.round(pool * BOSS_HEAVY_POOL_CAP)) // §25 death-spiral guard 1
  }
  // §26 防御 stance: a guarding target halves the incoming TURN hit (live status read —
  // a guard taken earlier THIS round protects this round).
  if (!out.missed && hasStatus(t.gs.activeStatuses, target.id, 'guard')) {
    dmg = Math.max(1, Math.round(dmg * (1 - GUARD_DAMAGE_REDUCTION)))
  }
  if (out.missed) {
    t.effects.push({ type: 'enemyAttack', targetId: target.id, amount: 0, missed: true, enemyId: attacker.id })
    // §28 见切反击: a dodger with the counter passive ripostes at COUNTER_POWER_PCT.
    if (hasTalentPassive(target, t.gs.learnedTalents, 'counter')) {
      const wk = attackKindOf(target, ctx)
      const magic = wk.kind === 'arcane' || eff.wis > eff.str
      const riposte = rollDamage({
        pow: magic ? eff.wis : eff.str,
        power: COUNTER_POWER_PCT,
        def: magic ? (attacker.mdef ?? Math.round(attacker.def * 0.8)) : attacker.def,
        attackerHit: 999, // a riposte never whiffs — the opening is already there
        targetEva: 0,
        attackerSkl: eff.skl,
        physKind: magic ? 'arcane' : wk.kind,
        attackerElement: wk.element,
        targetElement: attacker.element,
        targetWeak: attacker.physWeak,
        targetResist: attacker.physResist,
        roll: rollOf(t.input),
      })
      applyEnemyDamageCore(t, attacker.id, riposte.dmg, (hpAfter) => {
        t.effects.push({ type: 'counter', characterId: target.id, targetId: attacker.id, amount: riposte.dmg })
        t.effects.push({
          type: 'damage', amount: riposte.dmg, monsterHpAfter: hpAfter,
          actorId: target.id, targetId: attacker.id, fromSkill: true, crit: riposte.crit || undefined,
        })
      })
    }
  } else {
    const r = rOf(t, target)
    const hpAfter = Math.max(0, r.hp - dmg)
    setR(t, target, { ...r, hp: hpAfter })
    t.effects.push({ type: 'enemyAttack', targetId: target.id, amount: dmg, heavy: move.kind === 'heavy' || undefined, enemyId: attacker.id })
    if (hpAfter <= 0) {
      shedStatuses(t, target.id) // §26 death cleanse
      t.effects.push({ type: 'downed', characterId: target.id })
    } else if (move.inflicts) {
      // §26 — the move tries to stick its status on the struck (still standing) target.
      inflict(t, target.id, move.inflicts, sOf(t, target).maxHp, attacker.id)
    }
  }
  // Advance the rotation; warn if the NEXT move is a telegraphed wind-up. (A counter that
  // cleared the team respawned `enemies`; advancing a missing id is a harmless no-op map.)
  advanceEnemyPattern(t, attacker)
}

/** Setback when every on-field member is downed: revive low, the primary enemy recovers some HP.
 *  §25 death-spiral guard 2: every enemy's rotation resets off its heavy slot (patternIdx 0),
 *  so a freshly-revived party never eats a wind-up it couldn't see. */
function wipeCheck(t: Turn): void {
  if (t.combatants.some((c) => rOf(t, c).hp > 0)) return
  for (const c of t.combatants) {
    setR(t, c, { hp: sOf(t, c).maxHp * WIPE_REVIVE_HP_PCT, mp: rOf(t, c).mp })
  }
  t.gs.enemies = t.gs.enemies.map((m) => ((m.patternIdx ?? 0) !== 0 ? { ...m, patternIdx: 0 } : m))
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

/** The live CTB units (living combatants + every living enemy) from the current persistent gauges.
 *  §26: slow cuts spd on BOTH sides (party via effectiveStats' status fold; enemies here). */
function ctbUnitsOf(t: Turn, ctx: CombatContext): CtbUnit[] {
  const able = t.combatants.filter((c) => rOf(t, c).hp > 0)
  return [
    ...able.map((c) => ({ side: 'party' as const, id: c.id, spd: effectiveStats(c, ctx).spd, charge: t.gs.charge[c.id] ?? 0 })),
    ...livingEnemies(t.gs.enemies).map((m) => ({
      side: 'enemy' as const, id: m.id,
      spd: slowedSpd(m.spd, statusesOf(ctx.statuses, m.id)),
      charge: t.gs.charge[m.id] ?? 0,
    })),
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

/** §26 shared core of every enemy-HP-loss path (basic/skill hits AND round-end DOT): apply
 *  the damage, let the caller push its own effect (so the log reads naturally), then run the
 *  boss-phase check and — if that emptied the LAST living enemy — the encounter-clear cascade.
 *  Returns true on a fresh team-clear. An already-dead/missing enemy is a no-op. */
function applyEnemyDamageCore(
  t: Turn, enemyId: ID, dmg: number, pushEffect: (hpAfter: number) => void,
): boolean {
  const idx = t.gs.enemies.findIndex((m) => m.id === enemyId)
  if (idx < 0) return false
  const m = t.gs.enemies[idx]
  if (m.hp <= 0) return false
  const hpAfter = Math.max(0, m.hp - dmg)
  const next = [...t.gs.enemies]
  next[idx] = { ...m, hp: hpAfter }
  t.gs.enemies = next
  pushEffect(hpAfter)
  if (hpAfter <= 0) shedStatuses(t, enemyId) // §26 death cleanse
  else checkBossPhases(t, enemyId) // §26 phase flip the moment a threshold is crossed
  if (!teamCleared(t.gs.enemies)) return false
  return resolveEncounterClear(t)
}

/** Apply `dmg` to the enemy `enemyId`; push a damage effect carrying `targetId`. If that empties
 *  the LAST living enemy, run the encounter-clear cascade. Returns true on a fresh team-clear.
 *  Shared by todo-completion basic attacks and skill kills. An already-dead enemy is a no-op (an
 *  AoE pass may still name it). */
function damageEnemy(
  t: Turn, enemyId: ID, dmg: number, actorId: ID, fromSkill = false,
  flags?: { crit?: boolean; typeMult?: number },
): boolean {
  return applyEnemyDamageCore(t, enemyId, dmg, (hpAfter) => {
    t.effects.push({
      type: 'damage', amount: dmg, monsterHpAfter: hpAfter, actorId, targetId: enemyId, fromSkill,
      crit: flags?.crit || undefined,
      typeMult: flags?.typeMult !== undefined && flags.typeMult !== 1 ? flags.typeMult : undefined,
    })
  })
}

/** §26 boss phases: fire every authored phase whose threshold the enemy's HP has crossed
 *  (a huge hit can cross several; phases are authored DESCENDING by triggerHpPct). Each flip
 *  can swap the rotation (patternIdx 0 — an opening telegraph warns immediately), boost atk,
 *  and inflict a status on the living party. phaseIdx persists so a flip never re-fires. */
function checkBossPhases(t: Turn, enemyId: ID): void {
  const idx = t.gs.enemies.findIndex((m) => m.id === enemyId)
  if (idx < 0) return
  let m = t.gs.enemies[idx]
  const phases = m.phases
  if (!phases || phases.length === 0 || m.hp <= 0) return
  let fired = m.phaseIdx ?? 0
  let changed = false
  while (fired < phases.length && m.hp / m.maxHp <= phases[fired].triggerHpPct) {
    const ph = phases[fired]
    fired++
    changed = true
    m = {
      ...m,
      phaseIdx: fired,
      atk: m.atk + (ph.atkBoost ?? 0),
      pattern: ph.newPattern ? ph.newPattern.map((mv) => ({ ...mv })) : m.pattern,
      patternIdx: ph.newPattern ? 0 : m.patternIdx,
    }
    t.effects.push({ type: 'bossPhase', enemyId, phaseLabel: ph.phaseLabel, narration: ph.narration })
    if (ph.inflicts) {
      for (const c of t.combatants) {
        if (rOf(t, c).hp <= 0) continue
        inflict(t, c.id, ph.inflicts, sOf(t, c).maxHp, enemyId)
      }
    }
    const first = m.pattern?.[m.patternIdx ?? 0]
    if (ph.newPattern && first?.telegraph) {
      t.effects.push({ type: 'enemyTelegraph', enemyId, text: first.telegraph })
    }
  }
  if (!changed) return
  const next = [...t.gs.enemies]
  next[idx] = m
  t.gs.enemies = next
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
    case 'TalentLearned':
      return reduceTalentLearned(input, event.characterId, event.nodeId)
    case 'HabitMilestone':
      return reduceHabitMilestone(input, event.habitId, event.streak)
    case 'CalendarEventAttended':
      return reduceCalendarAttended(input)
    // Unwired — kept for the extensibility contract.
    case 'FocusStreak':
    case 'DialogueInteraction':
      return noop(input)
  }
}

/** §29 — honoring a scheduled commitment is a reflective act like journaling: small party
 *  XP + split affinity + a proud mood flag. (No UI dispatches this yet — the calendar zone
 *  shows due TODOS; this completes the event contract for when real events grow a UI.) */
function reduceCalendarAttended(input: ReducerInput): ReducerResult {
  const t = newTurn(input)
  grantXp(t, 6)
  gainAffinitySplit(t, 6)
  const companion = activeCompanion(t.party)
  if (companion) {
    t.gs.moodFlags = { ...t.gs.moodFlags, [companion.id]: 'proud' }
    t.effects.push({ type: 'mood', characterId: companion.id, flag: 'proud' })
  }
  return finishTurn(t)
}

// ---------- §28 growth-system events ----------

/** Learn one talent node: validates the tree/prereq/cost (canLearn), deducts the points,
 *  records the node. Invalid picks are no-ops (stale UI clicks must never corrupt state). */
function reduceTalentLearned(input: ReducerInput, characterId: ID, nodeId: string): ReducerResult {
  const t = newTurn(input)
  const char = t.party.find((c) => c.id === characterId)
  if (!char) return finishTurn(t)
  const points = t.gs.talentPoints?.[characterId] ?? 0
  const node = canLearn(char, nodeId, t.gs.learnedTalents, points)
  if (!node) return finishTurn(t)
  t.gs.talentPoints = { ...(t.gs.talentPoints ?? {}), [characterId]: points - node.cost }
  const learned = t.gs.learnedTalents ?? {}
  t.gs.learnedTalents = { ...learned, [characterId]: [...(learned[characterId] ?? []), node.id] }
  t.effects.push({ type: 'talentLearned', characterId, nodeId: node.id })
  return finishTurn(t)
}

/** §28 habit milestones (fired by habitStore AFTER stamping milestoneRewardedAt):
 *  7 天 → 全队天赋点 +1; 30 天 → a RARE item from the active world (else +300 gold);
 *  100 天 → an EPIC item (else +800 gold) AND 全队天赋点 +2. */
function reduceHabitMilestone(input: ReducerInput, habitId: ID, streak: number): ReducerResult {
  const t = newTurn(input)
  const grantPointsToAll = (n: number): void => {
    const cur = { ...(t.gs.talentPoints ?? {}) }
    for (const c of t.combatants) cur[c.id] = (cur[c.id] ?? 0) + n
    t.gs.talentPoints = cur
  }
  /** First not-yet-owned item of the wanted rarity in the active world (stable by id). */
  const pickByRarity = (rarity: 'rare' | 'epic'): string | undefined => {
    const owned = new Set(t.gs.ownedEquipment.map((o) => o.defId))
    return Object.values(EQUIPMENT_DEFS)
      .filter((d) => (d.rarity ?? 'common') === rarity)
      .filter((d) => !d.worldId || d.worldId === t.gs.activeWorldId || !t.gs.activeWorldId)
      .filter((d) => !owned.has(d.id))
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id
  }
  let rewardText = ''
  if (streak >= 100) {
    const epic = pickByRarity('epic')
    if (epic) grantQuestReward(t, { equipmentDefIds: [epic], unlockCompanionIds: [] })
    else t.gs.gold += 800
    grantPointsToAll(2)
    rewardText = epic ? '史诗装备 + 全队天赋点 +2' : '金币 +800 + 全队天赋点 +2'
  } else if (streak >= 30) {
    const rare = pickByRarity('rare')
    if (rare) grantQuestReward(t, { equipmentDefIds: [rare], unlockCompanionIds: [] })
    else t.gs.gold += 300
    rewardText = rare ? '稀有装备' : '金币 +300'
  } else {
    grantPointsToAll(1)
    rewardText = '全队天赋点 +1'
  }
  t.effects.push({ type: 'habitMilestone', habitId, streak, rewardText })
  return finishTurn(t)
}

/** Spend a planned skill's cost and apply its effect (attack/heal/buff/debuff), pushing the
 *  skillCast log line. The caller has already checked the caster is alive and can pay. The attack
 *  damage is tagged `fromSkill` so the log shows only the cast line (the float still counts it).
 *  Returns true iff an attack skill landed the killing blow. */
function applySkillEffect(t: Turn, caster: Character, skill: SkillDef, ctx: CombatContext, targetId?: ID): boolean {
  const r = rOf(t, caster)
  setR(t, caster, { hp: r.hp - (skill.hpCost ?? 0), mp: r.mp - skillCostOf(t, caster, skill) })
  const casterId = caster.id
  const eff = effectiveStats(caster, ctx)
  // §28 — talent skillPower nodes boost ONE skill; critBonus talent/affixes feed the roll.
  const powerMult = skillPowerMult(caster, t.gs.learnedTalents, skill.id)
  const critBonus = critBonusOf(t, caster)
  if (skill.kind === 'attack') {
    // §25: skills resolve through the unified pipeline. Physical skills scale off str/物攻
    // and inherit the weapon's category; magic skills (scaling: 'mag') scale off wis/魔攻 as
    // arcane vs mdef. Optional skill.physKind/element override the identity.
    // (The serialized literals 'atk'|'mag' predate the §25 rename and are kept for packs.)
    const magicSkill = skill.scaling === 'mag'
    const wk = attackKindOf(caster, ctx)
    const strikeArgs = (target: Monster) => ({
      pow: magicSkill ? eff.wis : eff.str,
      power: skill.power * SKILL_ATK_MULT * powerMult,
      def: magicSkill ? (target.mdef ?? Math.round(target.def * 0.8)) : target.def,
      attackerHit: eff.hit,
      targetEva: target.eva ?? 6,
      attackerSkl: eff.skl,
      critBonusPct: critBonus || undefined,
      physKind: skill.physKind ?? (magicSkill ? ('arcane' as const) : wk.kind),
      attackerElement: skill.element ?? wk.element,
      targetElement: target.element,
      targetWeak: target.physWeak,
      targetResist: target.physResist,
      roll: rollOf(t.input),
    })
    if (skill.target === 'allEnemies') {
      // AoE: hit every CURRENTLY-living enemy (each rolls its own hit/crit/weakness). Snapshot
      // ids first (a clear respawns the array) and stop once a hit clears the team, so we never
      // strike the freshly-spawned next team. The skillCast headline = the first target's roll.
      const ids = livingEnemies(t.gs.enemies).map((m) => m.id)
      let cleared = false
      let headlined = false
      for (const id of ids) {
        if (cleared) break
        const e = t.gs.enemies.find((m) => m.id === id)
        if (!e || e.hp <= 0) continue
        const out = rollDamage(strikeArgs(e))
        if (!headlined) {
          t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: out.dmg, missed: out.missed || undefined, crit: out.crit || undefined })
          headlined = true
        }
        if (out.missed) continue
        cleared = damageEnemy(t, id, out.dmg, casterId, true, { crit: out.crit, typeMult: out.typeMult }) || cleared
        if (out.crit) applyCritHeal(t, caster) // §28 onCritHeal affixes
        if (!cleared && skill.inflictsStatus) {
          // §26: each landed AoE hit tries to stick the status on its (surviving) target.
          const after = t.gs.enemies.find((m) => m.id === id)
          if (after && after.hp > 0) inflict(t, after.id, skill.inflictsStatus, after.maxHp, casterId)
        }
      }
      return cleared
    }
    // single-target attack: the chosen enemy, else the auto-target.
    const target = resolveTarget(t, targetId)
    if (!target) return false
    const out = rollDamage(strikeArgs(target))
    if (out.missed) {
      t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: 0, missed: true, targetId: target.id })
      return false
    }
    const monsterHpAfter = Math.max(0, target.hp - out.dmg) // shown in the log so it reconciles with the bar
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'attack', amount: out.dmg, monsterHpAfter, targetId: target.id, crit: out.crit || undefined, typeMult: out.typeMult !== 1 ? out.typeMult : undefined })
    const cleared = damageEnemy(t, target.id, out.dmg, casterId, true, { crit: out.crit, typeMult: out.typeMult })
    if (out.crit) applyCritHeal(t, caster) // §28 onCritHeal affixes
    if (!cleared && skill.inflictsStatus) {
      // §26: a landed attack tries to stick its status on the (still standing) target.
      const after = t.gs.enemies.find((m) => m.id === target.id)
      if (after && after.hp > 0) inflict(t, after.id, skill.inflictsStatus, after.maxHp, casterId)
    }
    return cleared
  }
  if (skill.kind === 'heal') {
    const heal = Math.round(eff.wis * skill.power * SKILL_HEAL_MULT * powerMult)
    t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'heal', amount: heal })
    if (skill.target === 'allAllies') {
      for (const c of t.combatants) {
        healChar(t, c, heal)
        if (skill.clearsStatus) cleanseStatuses(t, c.id, skill.clearsStatus)
      }
    } else {
      // §26: a cleanse-heal prefers an AFFLICTED ally over the most-injured one.
      const injured = t.combatants.filter((c) => rOf(t, c).hp < sOf(t, c).maxHp).sort((a, b) => rOf(t, a).hp - rOf(t, b).hp)[0]
      const afflicted = skill.clearsStatus
        ? t.combatants
            .filter((c) => rOf(t, c).hp > 0 && skill.clearsStatus!.some((k) => hasStatus(t.gs.activeStatuses, c.id, k)))
            .sort((a, b) => rOf(t, a).hp - rOf(t, b).hp)[0]
        : undefined
      const healTarget = afflicted ?? injured
      if (healTarget) {
        healChar(t, healTarget, heal)
        if (skill.clearsStatus) cleanseStatuses(t, healTarget.id, skill.clearsStatus)
      }
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
  // §26: power 0 = a PURE status move (no def shred); inflictsStatus applies on cast.
  t.effects.push({ type: 'skillCast', skillId: skill.id, casterId, skillKind: 'debuff', amount: Math.round(skill.power * 100) })
  const lowerDef = (m: Monster): Monster => ({ ...m, def: Math.max(0, Math.round(m.def * (1 - skill.power))) })
  if (skill.target === 'allEnemies') {
    if (skill.power > 0) t.gs.enemies = t.gs.enemies.map((m) => (m.hp > 0 ? lowerDef(m) : m))
    if (skill.inflictsStatus) {
      for (const m of livingEnemies(t.gs.enemies)) inflict(t, m.id, skill.inflictsStatus, m.maxHp, casterId)
    }
  } else {
    const target = resolveTarget(t, targetId)
    if (target) {
      if (skill.power > 0) t.gs.enemies = t.gs.enemies.map((m) => (m.id === target.id ? lowerDef(m) : m))
      if (skill.inflictsStatus) inflict(t, target.id, skill.inflictsStatus, target.maxHp, casterId)
    }
  }
  return false
}

// ---------- §28 羁绊连携技 (duo techs) ----------

const DUO_CLEANSE: StatusKind[] = ['poison', 'burn', 'sleep', 'paralysis', 'silence', 'slow']

/** Execute a duo tech if every condition holds: caster in the pair, partner on-field+alive,
 *  both bonds at the required rank, both can pay mpCostEach. Returns the killing-blow flag
 *  when EXECUTED, undefined when conditions fail (caller degrades to a basic attack).
 *  Design: the duo consumes only the CASTER's turn — the partner lends stats + MP but keeps
 *  their own action (no cross-dispatch consumed-turn state to persist; parity-safe). */
function tryDuoSkill(
  t: Turn, caster: Character, duo: DuoSkillDef, ctx: CombatContext, targetId?: ID,
): boolean | undefined {
  if (!duo.pair.includes(caster.id)) return undefined
  const partnerId = duo.pair[0] === caster.id ? duo.pair[1] : duo.pair[0]
  const partner = t.combatants.find((c) => c.id === partnerId)
  if (!partner || rOf(t, partner).hp <= 0) return undefined
  const ranksOk = duo.pair.every((id) => {
    const a = t.aff[id]
    return a && rankIndex(a.rank) >= rankIndex(duo.requiredRank)
  })
  if (!ranksOk) return undefined
  const rc = rOf(t, caster)
  if (rc.mp < duo.mpCostEach || rOf(t, partner).mp < duo.mpCostEach) return undefined

  setR(t, caster, { ...rc, mp: rc.mp - duo.mpCostEach })
  const rp = rOf(t, partner)
  setR(t, partner, { ...rp, mp: rp.mp - duo.mpCostEach })
  const effA = effectiveStats(caster, ctx)
  const effB = effectiveStats(partner, ctx)

  if (duo.kind === 'heal') {
    const heal = Math.round((effA.wis + effB.wis) * DUO_POW_SHARE * duo.power * SKILL_HEAL_MULT)
    t.effects.push({ type: 'duoSkillCast', skillId: duo.id, casterIds: [caster.id, partnerId], amount: heal })
    for (const c of t.combatants) {
      if (rOf(t, c).hp <= 0) continue
      healChar(t, c, heal)
      cleanseStatuses(t, c.id, DUO_CLEANSE)
    }
    return false
  }

  // attack — combined offensive stat; an ultimate never whiffs (hit 999 vs eva 0).
  const pow = (Math.max(effA.str, effA.wis) + Math.max(effB.str, effB.wis)) * DUO_POW_SHARE
  const strike = (target: Monster) =>
    rollDamage({
      pow,
      power: duo.power * SKILL_ATK_MULT,
      def: (duo.physKind ?? 'arcane') === 'arcane' ? (target.mdef ?? Math.round(target.def * 0.8)) : target.def,
      attackerHit: 999,
      targetEva: 0,
      attackerSkl: Math.max(effA.skl, effB.skl),
      physKind: duo.physKind ?? 'arcane',
      attackerElement: duo.element,
      targetElement: target.element,
      targetWeak: target.physWeak,
      targetResist: target.physResist,
      roll: rollOf(t.input),
    })
  if (duo.target === 'allEnemies') {
    const ids = livingEnemies(t.gs.enemies).map((m) => m.id)
    let cleared = false
    let headlined = false
    for (const id of ids) {
      if (cleared) break
      const e = t.gs.enemies.find((m) => m.id === id)
      if (!e || e.hp <= 0) continue
      const out = strike(e)
      if (!headlined) {
        t.effects.push({ type: 'duoSkillCast', skillId: duo.id, casterIds: [caster.id, partnerId], amount: out.dmg, crit: out.crit || undefined })
        headlined = true
      }
      cleared = damageEnemy(t, id, out.dmg, caster.id, true, { crit: out.crit, typeMult: out.typeMult }) || cleared
    }
    return cleared
  }
  const target = resolveTarget(t, targetId)
  if (!target) return false
  const out = strike(target)
  t.effects.push({ type: 'duoSkillCast', skillId: duo.id, casterIds: [caster.id, partnerId], amount: out.dmg, targetId: target.id, crit: out.crit || undefined })
  return damageEnemy(t, target.id, out.dmg, caster.id, true, { crit: out.crit, typeMult: out.typeMult })
}

/** §26: clear the listed status kinds from one combatant, logging each removal. */
function cleanseStatuses(t: Turn, id: ID, kinds: StatusKind[]): void {
  const { map, cleared } = clearStatusKinds(t.gs.activeStatuses, id, kinds)
  if (cleared.length === 0) return
  t.gs.activeStatuses = map
  for (const k of cleared) t.effects.push({ type: 'statusExpired', targetId: id, kind: k })
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
  /** §26 — activeStatuses snapshot at round start (STAT folds only; action gates read live). */
  statusesAtStart: StatusMap
}

/** Build a round's frozen snapshot (ctx/mult/order/charges) WITHOUT resolving any turn. */
function buildRoundCtx(input: ReducerInput, priority: Priority): RoundCtx {
  const t = newTurn(input)
  const ctx = combatCtx(input)
  // Each member's basic hit scales by the todo's priority (the round's "push") and active buffs.
  const mult = PRIORITY_MULT[priority] * (1 + activeAtkBuff(t.gs))
  const { order, charges } = ctbRound(ctbUnitsOf(t, ctx))
  return {
    priority, mult, order, charges,
    buffsAtStart: [...input.gameState.partyBuffs],
    statusesAtStart: cloneStatusMap(input.gameState.activeStatuses),
  }
}

/** The combat context for a round's turns: equipment/synergies from input, partyBuffs AND
 *  statuses FROZEN to the round-start snapshot (so the interactive path, which re-reads live
 *  state each step, matches the synchronous path exactly). */
function roundCombatCtx(input: ReducerInput, rctx: RoundCtx): CombatContext {
  return {
    ownedEquipment: input.ownedEquipment ?? [],
    activeSynergies: input.activeSynergies ?? [],
    partyBuffs: rctx.buffsAtStart,
    statuses: rctx.statusesAtStart,
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
    // round is skipped. §25: it executes the next move of its rotation (can miss, may telegraph).
    const attacker = t.gs.enemies.find((m) => m.id === act.id)
    if (!attacker || attacker.hp <= 0) return false
    // §26 action gates — sleep FREEZES the rotation (stalling a telegraphed heavy is the
    // tactical reward); paralysis advances it silently (the wind-up still telegraphs).
    const incap = incapacitatedBy(t.gs.activeStatuses, attacker.id)
    if (incap) {
      t.effects.push({ type: 'statusSkipped', targetId: attacker.id, kind: incap })
      if (incap === 'paralysis') advanceEnemyPattern(t, attacker)
      return false
    }
    enemyStrike(t, attacker, ctx)
    return false
  }
  const member = t.combatants.find((c) => c.id === act.id)
  if (!member || rOf(t, member).hp <= 0) return false // downed mid-timeline → can't act
  // §26: a slept/paralyzed member loses the action (their "choice" is consumed by the skip;
  // isLiveDecision already returns false for them, so the step-through never pauses here).
  const memberIncap = incapacitatedBy(t.gs.activeStatuses, member.id)
  if (memberIncap) {
    acted.add(member.id)
    t.effects.push({ type: 'statusSkipped', targetId: member.id, kind: memberIncap })
    return false
  }
  const firstTurn = !acted.has(member.id)
  acted.add(member.id)
  let plannedId = firstTurn ? (choice !== undefined ? choice : t.gs.roundPlan[member.id]) : undefined
  // §26 smart tactics: fill the DEFAULT first-turn action only (an explicit choice/plan wins).
  if (firstTurn && plannedId === undefined && t.input.tactics === 'smart') {
    plannedId = smartDefaultAction(t, member, ctx)
  }
  // §26 防御: a 1-round guard status — halves incoming enemy TURN hits until round end.
  if (plannedId === GUARD_ACTION) {
    t.gs.activeStatuses = applyStatus(
      t.gs.activeStatuses, member.id, { kind: 'guard', rounds: 1 }, sOf(t, member).maxHp, t.input.newId,
    )
    t.effects.push({ type: 'guarded', characterId: member.id })
    return false
  }
  // §28 嘲讽 stance (talent-gated): draw enemy turn-hits to this member this round.
  if (plannedId === TAUNT_ACTION) {
    if (hasTalentPassive(member, t.gs.learnedTalents, 'taunt')) {
      t.gs.activeStatuses = applyStatus(
        t.gs.activeStatuses, member.id, { kind: 'taunt', rounds: 1 }, sOf(t, member).maxHp, t.input.newId,
      )
      t.effects.push({ type: 'statusApplied', targetId: member.id, kind: 'taunt', rounds: 1, sourceId: member.id })
      return false
    }
    plannedId = undefined // stance not unlocked → fall through to the basic attack
  }
  // §26 silence: planned skills are locked — fall through to the basic attack.
  const silenced = hasStatus(t.gs.activeStatuses, member.id, 'silence')
  // §28 羁绊连携技 — the plan may name a duo id; unmet conditions degrade to a basic attack.
  if (!silenced && plannedId && plannedId !== 'basic') {
    const duo = duoSkillFor(plannedId)
    if (duo) {
      const fired = tryDuoSkill(t, member, duo, ctx, targetId)
      if (fired !== undefined) return fired
    }
  }
  const skill = !silenced && plannedId && plannedId !== 'basic' ? unlockedSkills(member).find((s) => s.id === plannedId) : undefined
  const r = rOf(t, member)
  if (skill && r.mp >= skillCostOf(t, member, skill) && r.hp > (skill.hpCost ?? 0)) {
    return applySkillEffect(t, member, skill, ctx, targetId) // planned skill fires (spends MP/HP)
  }
  // §25 basic attack through the unified pipeline. Identity: an arcane weapon (杖扇琴) swings
  // magic; otherwise the member's BEST offensive stat (casters with high wis swing magic so
  // they aren't floored by physical defense). Magic targets mdef, physical targets def.
  // It hits the chosen target (manual step-through), else the auto-target (lowest-HP living enemy).
  const target = resolveTarget(t, targetId)
  if (!target) return false // no living enemy (e.g. a lap after the team already cleared)
  const eff = effectiveStats(member, ctx)
  const wk = attackKindOf(member, ctx)
  const magic = wk.kind === 'arcane' || eff.wis > eff.str
  const memberCritBonus = critBonusOf(t, member) // §28 talent/affix crit
  const out = rollDamage({
    pow: magic ? eff.wis : eff.str,
    power: rctx.mult,
    def: magic ? (target.mdef ?? Math.round(target.def * 0.8)) : target.def,
    attackerHit: eff.hit,
    targetEva: target.eva ?? 6,
    attackerSkl: eff.skl,
    critBonusPct: memberCritBonus || undefined,
    physKind: magic ? 'arcane' : wk.kind,
    attackerElement: wk.element,
    targetElement: target.element,
    targetWeak: target.physWeak,
    targetResist: target.physResist,
    roll: rollOf(t.input),
  })
  if (out.missed) {
    // 真实Miss — per-MEMBER, so a completed task practically never zeroes out (§25).
    t.effects.push({ type: 'damage', amount: 0, monsterHpAfter: target.hp, actorId: member.id, targetId: target.id, missed: true })
    return false
  }
  const clearedBasic = damageEnemy(t, target.id, out.dmg, member.id, false, { crit: out.crit, typeMult: out.typeMult })
  if (out.crit) applyCritHeal(t, member) // §28 onCritHeal affixes
  if (!clearedBasic) applyOnHitStatuses(t, member, target.id) // §28 statusOnHit affixes
  return clearedBasic
}

/** §26 smart tactics (Settings.autoTactics → input.tactics 'smart'): pick a better DEFAULT
 *  first-turn action for a member with no explicit choice/plan, so light players get sensible
 *  play without ever being asked. Deterministic, MP-aware, NO RNG consumed. Heuristics in order:
 *  1. an ally carries a harmful status → an affordable cleanse-heal that covers it
 *  2. an ally is dangerously hurt → the strongest affordable heal
 *  3. own HP critically low → 防御
 *  4. an enemy is sleeping → the strongest affordable attack skill (burst the window)
 *  else undefined → the normal basic attack. */
function smartDefaultAction(t: Turn, member: Character, ctx: CombatContext): SkillId | undefined {
  void ctx
  const r = rOf(t, member)
  const affordable = unlockedSkills(member).filter(
    (s) => r.mp >= s.mpCost && r.hp > (s.hpCost ?? 0),
  )
  const HARMFUL: StatusKind[] = ['sleep', 'paralysis', 'silence', 'poison', 'burn', 'slow']
  const alive = t.combatants.filter((c) => rOf(t, c).hp > 0)

  // 1. cleanse — an afflicted ally + a heal that covers at least one of their ailments.
  const afflicted = alive.find((c) => HARMFUL.some((k) => hasStatus(t.gs.activeStatuses, c.id, k)))
  if (afflicted) {
    const cleanse = affordable
      .filter((s) => s.kind === 'heal' && s.clearsStatus?.some((k) => hasStatus(t.gs.activeStatuses, afflicted.id, k)))
      .sort((a, b) => b.power - a.power)[0]
    if (cleanse) return cleanse.id
  }
  // 2. heal — any ally dangerously hurt.
  const hurt = alive.some((c) => rOf(t, c).hp < sOf(t, c).maxHp * SMART_HEAL_HP_PCT)
  if (hurt) {
    const heal = affordable.filter((s) => s.kind === 'heal').sort((a, b) => b.power - a.power)[0]
    if (heal) return heal.id
  }
  // 3. guard — own HP critically low (and nothing better to do about it).
  if (r.hp < sOf(t, member).maxHp * SMART_GUARD_HP_PCT) return GUARD_ACTION
  // 4. burst a sleeping enemy.
  if (livingEnemies(t.gs.enemies).some((m) => hasStatus(t.gs.activeStatuses, m.id, 'sleep'))) {
    const attack = affordable.filter((s) => s.kind === 'attack').sort((a, b) => b.power - a.power)[0]
    if (attack) return attack.id
  }
  return undefined
}

/** True if order[index] is a LIVE party member taking its FIRST turn — the point the interactive
 *  resolver pauses at for the player's choice (enemy turns, laps, downed slots and §26
 *  slept/paralyzed members are auto-run — the step-through NEVER pauses on a skip). */
function isLiveDecision(t: Turn, order: TurnActor[], index: number, acted: Set<ID>): boolean {
  const a = order[index]
  if (!a || a.side !== 'party' || acted.has(a.id)) return false
  const member = t.combatants.find((c) => c.id === a.id)
  if (!member || rOf(t, member).hp <= 0) return false
  return incapacitatedBy(t.gs.activeStatuses, member.id) === undefined
}

/** Persist the round's CTB gauges (combatants + every current enemy). A respawned next-team enemy
 *  isn't in `charges` and starts cold at 0; a same-encounter dead enemy keeps its (inert) gauge. */
function commitCharges(t: Turn, charges: Record<ID, number>): void {
  const nextCharge: Record<ID, number> = {}
  for (const c of t.combatants) nextCharge[c.id] = charges[c.id] ?? t.gs.charge[c.id] ?? 0
  for (const m of t.gs.enemies) nextCharge[m.id] = charges[m.id] ?? t.gs.charge[m.id] ?? 0
  t.gs.charge = nextCharge
}

/** §26 round-end status pass: DOT/HOT resolve, then every duration ticks down (1 task = 1
 *  round, so 「中毒 3 回合」 = three real tasks). Poison can land the killing blow on the
 *  LAST enemy (full clear cascade) or down a member (the wipeCheck right after catches an
 *  all-down). Guard expires silently (it's an implicit 1-round stance). */
function tickStatusesRoundEnd(t: Turn): void {
  const map = t.gs.activeStatuses
  if (!map || Object.keys(map).length === 0) return

  // 1. Party DOT / HOT.
  for (const c of t.combatants) {
    if (rOf(t, c).hp <= 0) continue
    for (const s of stOf(t, c.id)) {
      if (s.kind === 'poison' || s.kind === 'burn') {
        const dmg = Math.max(1, Math.round(s.magnitude ?? 1))
        const r = rOf(t, c)
        const hpAfter = Math.max(0, r.hp - dmg)
        setR(t, c, { ...r, hp: hpAfter })
        t.effects.push({ type: 'statusTick', targetId: c.id, kind: s.kind, amount: dmg, hpAfter })
        if (hpAfter <= 0) {
          shedStatuses(t, c.id) // §26 death cleanse
          t.effects.push({ type: 'downed', characterId: c.id })
          break
        }
      } else if (s.kind === 'regen') {
        const r = rOf(t, c)
        const max = sOf(t, c).maxHp
        if (r.hp >= max) continue
        const amount = Math.min(max - r.hp, Math.max(1, Math.round(s.magnitude ?? 1)))
        setR(t, c, { ...r, hp: r.hp + amount })
        t.effects.push({ type: 'statusTick', targetId: c.id, kind: 'regen', amount, hpAfter: r.hp + amount })
      }
    }
  }

  // 2. Enemy DOT / HOT (snapshot ids — a poison kill respawns the array mid-loop; the
  //    freshly-spawned team is never ticked this round).
  for (const id of livingEnemies(t.gs.enemies).map((m) => m.id)) {
    for (const s of statusesOf(t.gs.activeStatuses, id)) {
      const live = t.gs.enemies.find((m) => m.id === id)
      if (!live || live.hp <= 0) break
      if (s.kind === 'poison' || s.kind === 'burn') {
        const dmg = Math.max(1, Math.round(s.magnitude ?? 1))
        applyEnemyDamageCore(t, id, dmg, (hpAfter) => {
          t.effects.push({ type: 'statusTick', targetId: id, kind: s.kind, amount: dmg, hpAfter })
        })
      } else if (s.kind === 'regen') {
        const idx = t.gs.enemies.findIndex((m) => m.id === id)
        const m = t.gs.enemies[idx]
        if (m.hp >= m.maxHp) continue
        const amount = Math.min(m.maxHp - m.hp, Math.max(1, Math.round(s.magnitude ?? 1)))
        const next = [...t.gs.enemies]
        next[idx] = { ...m, hp: m.hp + amount }
        t.gs.enemies = next
        t.effects.push({ type: 'statusTick', targetId: id, kind: 'regen', amount, hpAfter: m.hp + amount })
      }
    }
  }

  // 3. Durations tick down for EVERY tracked combatant; expirations are logged (guard is
  //    silent — its whole life is one round by construction). Entries for ids that no longer
  //    exist (dead enemies of past encounters) tick away and vanish on their own.
  const current = t.gs.activeStatuses
  if (!current) return
  const nextMap: StatusMap = {}
  for (const [id, sts] of Object.entries(current)) {
    const { kept, expired } = tickDurations(sts)
    for (const s of expired) {
      if (s.kind !== 'guard') t.effects.push({ type: 'statusExpired', targetId: id, kind: s.kind })
    }
    if (kept.length > 0) nextMap[id] = kept
  }
  t.gs.activeStatuses = nextMap
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
  tickStatusesRoundEnd(t) // §26 — DOT/HOT + duration tick (1 task = 1 round)
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
    statusesAtStart: rctx.statusesAtStart, // §26 — frozen stat-fold view for the whole round
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
  const rctx: RoundCtx = {
    priority: ar.priority, mult: ar.mult, order: ar.order, charges: ar.charges,
    buffsAtStart: ar.buffsAtStart,
    // Pre-§26 saves have no snapshot — fall back to the live map (close enough for a round
    // that began before the feature existed).
    statusesAtStart: ar.statusesAtStart ?? cloneStatusMap(input.gameState.activeStatuses),
  }
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
