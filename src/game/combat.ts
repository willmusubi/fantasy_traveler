// Pure combat math (§21). No clock, no rng, no I/O — trivially unit-testable.

import {
  CTB_THRESHOLD,
  DEFEAT_GOLD_PER_HP,
  DEFEAT_GOLD_PER_LEVEL,
  DEFEAT_XP_PER_HP,
  DEFEAT_XP_PER_LEVEL,
  HP_PER_OPEN_HIGH,
  HP_PER_STAGE,
  MONSTER_BASE_ATK,
  MONSTER_BASE_DEF,
  MONSTER_BASE_HP,
  MONSTER_BASE_SPD,
  MONSTER_DEF_PER_STAGE,
  MONSTER_SPD_PER_STAGE,
  PRIORITY_MULT,
} from '../domain/config'
import type { Character, EncounterSpec, Monster, Priority, TurnActor } from '../domain/types'
import { EMPTY_COMBAT_CONTEXT, effectiveStats, type CombatContext } from './effectiveStats'

export type { TurnActor }

/** Sum of EFFECTIVE atk across the party (equipment + synergies). */
export function partyAtk(party: Character[], ctx: CombatContext = EMPTY_COMBAT_CONTEXT): number {
  return party.reduce((sum, c) => sum + effectiveStats(c, ctx).atk, 0)
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

/** Spawn a fresh monster for the given story stage and current high-priority load. */
export function spawnMonster(
  storyStage: number,
  openHighCount: number,
  idFactory: () => string,
): Monster {
  const maxHp =
    MONSTER_BASE_HP + HP_PER_OPEN_HIGH * openHighCount + storyStage * HP_PER_STAGE
  return {
    id: idFactory(),
    nameKey: 'monster.procrastination',
    level: storyStage + 1,
    maxHp,
    hp: maxHp,
    atk: MONSTER_BASE_ATK + storyStage,
    def: MONSTER_BASE_DEF + storyStage * MONSTER_DEF_PER_STAGE,
    spd: MONSTER_BASE_SPD + storyStage * MONSTER_SPD_PER_STAGE,
    growth: 1,
  }
}

/** Spawn the monster for a quest encounter: base spawn scaled by the encounter. */
export function monsterFromEncounter(
  enc: EncounterSpec,
  storyStage: number,
  openHighCount: number,
  idFactory: () => string,
): Monster {
  const base = spawnMonster(storyStage, openHighCount, idFactory)
  const maxHp = Math.max(1, Math.round(base.maxHp * enc.hpScale))
  return {
    ...base,
    maxHp,
    hp: maxHp,
    def: Math.max(0, Math.round(base.def * enc.defScale)),
    displayName: enc.enemyName,
    theme: enc.enemyTheme,
  }
}
