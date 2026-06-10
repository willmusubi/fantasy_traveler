// Pure combat math (§21, §25). No clock, no rng, no I/O — trivially unit-testable.

import {
  ARCHETYPE_PATTERNS,
  clampStage,
  CTB_THRESHOLD,
  DEFEAT_GOLD_PER_HP,
  DEFEAT_GOLD_PER_LEVEL,
  DEFEAT_XP_PER_HP,
  DEFEAT_XP_PER_LEVEL,
  ENEMY_ATK,
  ENEMY_EVA,
  ENEMY_HIT,
  ENEMY_MATK,
  ENEMY_MDEF,
  ENEMY_PDEF,
  enemyHpBudget,
  HP_PER_OPEN_HIGH,
  MONSTER_BASE_SPD,
  MONSTER_SPD_PER_STAGE,
  PRIORITY_MULT,
} from '../domain/config'
import type {
  Character, Element, EncounterSpec, EnemyArchetype, Monster, PhysKind, Priority, TurnActor,
} from '../domain/types'
import { EMPTY_COMBAT_CONTEXT, effectiveStats, type CombatContext } from './effectiveStats'

export type { TurnActor }

/** Sum of EFFECTIVE str (物攻) across the party (equipment + synergies). */
export function partyAtk(party: Character[], ctx: CombatContext = EMPTY_COMBAT_CONTEXT): number {
  return party.reduce((sum, c) => sum + effectiveStats(c, ctx).str, 0)
}

/** Canonical overworld damage from completing a todo. */
export function computeDamage(
  party: Character[],
  priority: Priority,
  monster: Monster,
  ctx: CombatContext = EMPTY_COMBAT_CONTEXT,
): number {
  const raw = partyAtk(party, ctx) * PRIORITY_MULT[priority] - monster.def
  return Math.max(1, Math.round(raw))
}

export interface CtbUnit extends TurnActor {
  spd: number
  charge: number
}

const ctbRank = (x: TurnActor): number => (x.side === 'party' ? 0 : 1)

/** Advance the shared CTB clock to the next unit that reaches CTB_THRESHOLD, MUTATING `u`
 *  (every gauge fills by spd×Δt; the actor's gauge drops by the threshold, overflow kept).
 *  Ties resolve to the party. Returns that actor, or null if nobody can charge. */
function popNext(u: CtbUnit[]): TurnActor | null {
  let best = -1
  let bestT = Infinity
  for (let i = 0; i < u.length; i++) {
    const x = u[i]
    if (x.spd <= 0) continue
    const tt = (CTB_THRESHOLD - x.charge) / x.spd
    if (best < 0 || tt < bestT - 1e-9 || (Math.abs(tt - bestT) <= 1e-9 && ctbRank(x) < ctbRank(u[best]))) {
      bestT = tt
      best = i
    }
  }
  if (best < 0) return null
  for (const x of u) x.charge += x.spd * bestT
  u[best].charge -= CTB_THRESHOLD
  return { side: u[best].side, id: u[best].id }
}

/** Resolve one completion's worth of the timeline: advance until the party has taken
 *  `partyTurns` turns, letting any enemy turns that come up first resolve too. Returns the
 *  action order + the new (persistent) gauges. Pure — `units` is copied, not mutated. */
export function ctbResolve(units: CtbUnit[], partyTurns: number): { order: TurnActor[]; charges: Record<string, number> } {
  const u = units.map((x) => ({ ...x }))
  const order: TurnActor[] = []
  let taken = 0
  let guard = 0
  while (taken < partyTurns && guard++ < 500) {
    if (!u.some((x) => x.side === 'party')) break
    const a = popNext(u)
    if (!a) break
    order.push(a)
    if (a.side === 'party') taken++
  }
  const charges: Record<string, number> = {}
  for (const x of u) charges[x.id] = x.charge
  return { order, charges }
}

/** Resolve ONE task = ONE round (§ round model): advance the shared clock by a window Δ wide
 *  enough that EVERY living unit crosses CTB_THRESHOLD at least once — Δ = the slowest-to-act
 *  unit's time to its first crossing. Each crossing is one action, emitted in time (speed) order;
 *  a unit fast enough to cross twice inside Δ LAPS (套圈) as a BONUS, so a slow member is never
 *  starved of its own turn (the bug `ctbResolve(units, partySize)` had — a fast unit could eat the
 *  whole budget). Ties resolve to the party. Pure — `units` is copied. Gauges carry exactly:
 *  end = charge + spd·Δ − THRESHOLD·(times acted), provably in [0, THRESHOLD). */
export function ctbRound(units: CtbUnit[]): { order: TurnActor[]; charges: Record<string, number> } {
  const u = units.map((x) => ({ ...x }))
  const charges: Record<string, number> = {}
  const movers = u.filter((x) => x.spd > 0)
  if (movers.length === 0) {
    for (const x of u) charges[x.id] = x.charge
    return { order: [], charges }
  }
  // Δ = max first-crossing time → every living unit acts at least once this round.
  const delta = Math.max(...movers.map((x) => (CTB_THRESHOLD - x.charge) / x.spd))

  // Collect every (unit, crossing-time) in [0, Δ]; a fast unit appears more than once (a lap).
  // The k≤50 cap is insurance against a near-zero spd (heavy debuff) blowing up the loop.
  const crosses: { actor: TurnActor; t: number; rank: number }[] = []
  for (const x of u) {
    if (x.spd <= 0) continue
    for (let k = 1; k <= 50; k++) {
      const t = (k * CTB_THRESHOLD - x.charge) / x.spd
      if (t > delta + 1e-9) break
      crosses.push({ actor: { side: x.side, id: x.id }, t, rank: ctbRank(x) })
    }
  }
  // Chronological order; exact ties resolve to the party (matches popNext's ctbRank).
  crosses.sort((a, b) => (Math.abs(a.t - b.t) <= 1e-9 ? a.rank - b.rank : a.t - b.t))
  const order: TurnActor[] = crosses.map((c) => c.actor)

  // Advance all gauges by spd·Δ, then subtract THRESHOLD once per action taken (overflow kept).
  const acted: Record<string, number> = {}
  for (const c of crosses) acted[c.actor.id] = (acted[c.actor.id] ?? 0) + 1
  for (const x of u) charges[x.id] = x.charge + x.spd * delta - CTB_THRESHOLD * (acted[x.id] ?? 0)
  return { order, charges }
}

/** Simulate the next `count` turns from the CURRENT gauges (no state change) — drives the
 *  UI's turn-order forecast strip. */
export function ctbForecast(units: CtbUnit[], count: number): TurnActor[] {
  const u = units.map((x) => ({ ...x }))
  const order: TurnActor[] = []
  let guard = 0
  while (order.length < count && guard++ < 500) {
    const a = popNext(u)
    if (!a) break
    order.push(a)
  }
  return order
}

/** XP + gold awarded for defeating a monster, scaled to its strength (HP + level). */
export function defeatRewards(monster: Monster): { xp: number; gold: number } {
  return {
    xp: Math.round(monster.maxHp * DEFEAT_XP_PER_HP + monster.level * DEFEAT_XP_PER_LEVEL),
    gold: Math.round(monster.maxHp * DEFEAT_GOLD_PER_HP + monster.level * DEFEAT_GOLD_PER_LEVEL),
  }
}

// ---------- §25 enemy spawning (TTK-budget curves + weakness assignment) ----------

const ELEMENT_POOL: Element[] = ['metal', 'wood', 'water', 'fire', 'earth']
const PHYS_POOL: PhysKind[] = ['slash', 'pierce', 'strike', 'arcane']

/** FNV-1a — deterministic weakness assignment for unauthored enemies. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Derive element + weakness tags from an enemy's identity. Every quest enemy gets a
 *  puzzle to solve even when the author/AI assigned nothing — zero authoring cost. */
export function hashWeaknesses(seed: string): { element: Element; physWeak: PhysKind[]; physResist: PhysKind[] } {
  const h = fnv1a(seed)
  const weak = PHYS_POOL[(h >>> 3) % 4]
  const resistCandidate = PHYS_POOL[(h >>> 6) % 4]
  return {
    element: ELEMENT_POOL[h % 5],
    physWeak: [weak],
    physResist: resistCandidate === weak ? [] : [resistCandidate],
  }
}

/** Spawn a fresh monster for the given story stage and current high-priority load.
 *  The open-world 心魔 is a NEUTRAL training dummy (no element/weaknesses) — the depth
 *  layer lives on quest enemies; simple-mode pacing is untouched by it. */
export function spawnMonster(
  storyStage: number,
  openHighCount: number,
  idFactory: () => string,
  archetype: EnemyArchetype = 'elite',
): Monster {
  const stage = clampStage(storyStage)
  const maxHp = enemyHpBudget(stage, archetype) + HP_PER_OPEN_HIGH * openHighCount
  return {
    id: idFactory(),
    nameKey: 'monster.procrastination',
    level: stage + 1,
    maxHp,
    hp: maxHp,
    atk: ENEMY_ATK(stage),
    def: ENEMY_PDEF(stage),
    spd: MONSTER_BASE_SPD + stage * MONSTER_SPD_PER_STAGE,
    matk: ENEMY_MATK(stage),
    mdef: ENEMY_MDEF(stage),
    hit: ENEMY_HIT(stage),
    eva: ENEMY_EVA(stage),
    archetype,
    pattern: ARCHETYPE_PATTERNS[archetype].map((m) => ({ ...m })),
    patternIdx: 0,
    growth: 1,
  }
}

/** Spawn the monster for a quest encounter: budget spawn scaled by the encounter, plus
 *  §25 identity (element/weaknesses): authored → as written; else hash-assigned. */
export function monsterFromEncounter(
  enc: EncounterSpec,
  storyStage: number,
  openHighCount: number,
  idFactory: () => string,
): Monster {
  const archetype = enc.archetype ?? 'elite'
  const base = spawnMonster(storyStage, openHighCount, idFactory, archetype)
  const maxHp = Math.max(1, Math.round(base.maxHp * enc.hpScale))
  const hashed = hashWeaknesses(enc.antagonistId ?? enc.enemyName)
  return {
    ...base,
    maxHp,
    hp: maxHp,
    def: Math.max(0, Math.round(base.def * enc.defScale)),
    displayName: enc.enemyName,
    theme: enc.enemyTheme,
    element: enc.element ?? hashed.element,
    physWeak: enc.physWeak ?? hashed.physWeak,
    physResist: enc.physResist ?? hashed.physResist,
  }
}

/** Build the full enemy TEAM for an encounter: primary (enemies[0]) + each add (its own scaling).
 *  An encounter with no `adds` returns a 1-element team — identical to the old single-enemy spawn.
 *  §25: the primary defaults to 'elite'; escorts default to 'mook' (lighter TTK budget). */
export function teamFromEncounter(
  enc: EncounterSpec,
  storyStage: number,
  openHighCount: number,
  idFactory: () => string,
): Monster[] {
  const primary = monsterFromEncounter(enc, storyStage, openHighCount, idFactory)
  const adds = (enc.adds ?? []).map((a) =>
    monsterFromEncounter(
      {
        ...enc,
        enemyName: a.enemyName, enemyTheme: a.enemyTheme, antagonistId: a.antagonistId,
        hpScale: a.hpScale, defScale: a.defScale,
        element: a.element, physWeak: a.physWeak, physResist: a.physResist,
        archetype: a.archetype ?? 'mook',
      },
      storyStage,
      openHighCount,
      idFactory,
    ),
  )
  return [primary, ...adds]
}

/** §25 read-time backfill for pre-§25 saved enemies (same pattern as character stats):
 *  derive the new combat fields from level/atk/def; idempotent. */
export function withMonsterDefaults(m: Monster): Monster {
  if (m.matk != null && m.pattern != null && m.hit != null) return m
  const stage = clampStage(m.level - 1)
  const archetype: EnemyArchetype = m.archetype ?? 'elite'
  return {
    ...m,
    matk: m.matk ?? Math.round(m.atk * 0.9),
    mdef: m.mdef ?? Math.round(m.def * 0.8),
    hit: m.hit ?? ENEMY_HIT(stage),
    eva: m.eva ?? ENEMY_EVA(stage),
    archetype,
    pattern: m.pattern ?? ARCHETYPE_PATTERNS[archetype].map((mv) => ({ ...mv })),
    patternIdx: m.patternIdx ?? 0,
  }
}

// ---------- Enemy-team helpers (multi-enemy combat) ----------

/** The living enemies (hp > 0), in array order (primary first). */
export function livingEnemies(enemies: Monster[]): Monster[] {
  return enemies.filter((m) => m.hp > 0)
}

/** Smart auto-target: the lowest-HP LIVING enemy (ties → earliest in array = the primary first).
 *  This is the picker's default pre-selection AND the fallback for passive/auto/non-adventure
 *  resolution. Returns undefined only if every enemy is dead. */
export function autoTargetEnemy(enemies: Monster[]): Monster | undefined {
  return livingEnemies(enemies).reduce<Monster | undefined>((best, m) => (!best || m.hp < best.hp ? m : best), undefined)
}

/** The encounter's primary: the first LIVING enemy if any, else enemies[0] (the authored boss).
 *  Used for overdue/timer flavor (which enemy grows / takes the free swing). */
export function primaryEnemy(enemies: Monster[]): Monster | undefined {
  return enemies.find((m) => m.hp > 0) ?? enemies[0]
}

/** Whole team defeated? (an empty team reads as cleared — defensive). */
export function teamCleared(enemies: Monster[]): boolean {
  return enemies.every((m) => m.hp <= 0)
}
