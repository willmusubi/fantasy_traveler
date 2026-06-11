// §26 status-effect helpers. Pure functions over GameState.activeStatuses
// (Record<combatantId, CombatStatus[]>) — no clock, no rng, no I/O. The reducer owns
// WHEN these run (action gates at turn time, DOT + duration ticks at round end);
// this module owns the map mechanics so they are trivially unit-testable.

import { SLOW_DEFAULT_PCT, STATUS_DOT_PCT } from '../domain/config'
import type { CombatStatus, ID, StatusEffectSpec, StatusKind } from '../domain/types'

export type StatusMap = Record<ID, CombatStatus[]>

/** The live statuses on one combatant (missing entry = none). */
export function statusesOf(map: StatusMap | undefined, id: ID): CombatStatus[] {
  return map?.[id] ?? []
}

export function hasStatus(map: StatusMap | undefined, id: ID, kind: StatusKind): boolean {
  return statusesOf(map, id).some((s) => s.kind === kind)
}

/** sleep/paralysis — the kinds that consume the owner's action. */
export function incapacitatedBy(map: StatusMap | undefined, id: ID): StatusKind | undefined {
  if (hasStatus(map, id, 'sleep')) return 'sleep'
  if (hasStatus(map, id, 'paralysis')) return 'paralysis'
  return undefined
}

/** Clone the map one level deep (per-id arrays copied) — the reducer's newTurn uses this so
 *  mid-turn mutations never leak into the caller's GameState. */
export function cloneStatusMap(map: StatusMap | undefined): StatusMap {
  if (!map) return {}
  return Object.fromEntries(Object.entries(map).map(([id, sts]) => [id, [...sts]]))
}

/** Resolve a spec's flat magnitude at application time: explicit wins; DOT/HOT kinds
 *  default to a fraction of the TARGET's maxHp; slow defaults to SLOW_DEFAULT_PCT. */
export function resolveMagnitude(spec: StatusEffectSpec, targetMaxHp: number): number | undefined {
  if (spec.magnitude != null) return spec.magnitude
  const pct = STATUS_DOT_PCT[spec.kind]
  if (pct != null) return Math.max(1, Math.round(targetMaxHp * pct))
  if (spec.kind === 'slow') return SLOW_DEFAULT_PCT
  return undefined
}

/** Apply a spec to `targetId`, REPLACING any same-kind status (durations don't stack —
 *  re-application refreshes to the longer roundsLeft / stronger magnitude). Pure. */
export function applyStatus(
  map: StatusMap | undefined,
  targetId: ID,
  spec: StatusEffectSpec,
  targetMaxHp: number,
  newId: () => string,
  sourceId?: ID,
): StatusMap {
  const next = cloneStatusMap(map)
  const existing = next[targetId]?.find((s) => s.kind === spec.kind)
  const magnitude = resolveMagnitude(spec, targetMaxHp)
  const merged: CombatStatus = existing
    ? {
        ...existing,
        roundsLeft: Math.max(existing.roundsLeft, spec.rounds),
        magnitude: maxDefined(existing.magnitude, magnitude),
        sourceId: sourceId ?? existing.sourceId,
      }
    : { id: newId(), kind: spec.kind, roundsLeft: spec.rounds, magnitude, sourceId }
  next[targetId] = [...(next[targetId] ?? []).filter((s) => s.kind !== spec.kind), merged]
  return next
}

function maxDefined(a?: number, b?: number): number | undefined {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

/** Remove the listed kinds from one combatant. Returns the kinds actually cleared. */
export function clearStatusKinds(
  map: StatusMap | undefined,
  id: ID,
  kinds: StatusKind[],
): { map: StatusMap; cleared: StatusKind[] } {
  const next = cloneStatusMap(map)
  const mine = next[id] ?? []
  const cleared = mine.filter((s) => kinds.includes(s.kind)).map((s) => s.kind)
  if (cleared.length === 0) return { map: next, cleared }
  const kept = mine.filter((s) => !kinds.includes(s.kind))
  if (kept.length > 0) next[id] = kept
  else delete next[id]
  return { map: next, cleared }
}

/** Drop EVERY status on one combatant (death cleanse — a downed member / dead enemy
 *  sheds its statuses; revival starts clean). */
export function clearAllStatuses(map: StatusMap | undefined, id: ID): StatusMap {
  const next = cloneStatusMap(map)
  delete next[id]
  return next
}

/** Effective spd after slow (floored at 1 so the CTB timeline can never stall). */
export function slowedSpd(spd: number, statuses: CombatStatus[]): number {
  const slow = statuses.find((s) => s.kind === 'slow')
  if (!slow) return spd
  return Math.max(1, Math.round(spd * (1 - (slow.magnitude ?? SLOW_DEFAULT_PCT))))
}

/** Round-end duration tick for ONE combatant's statuses: every roundsLeft decrements;
 *  expirations split out (the reducer logs them). Pure. */
export function tickDurations(statuses: CombatStatus[]): { kept: CombatStatus[]; expired: CombatStatus[] } {
  const kept: CombatStatus[] = []
  const expired: CombatStatus[] = []
  for (const s of statuses) {
    const left = s.roundsLeft - 1
    if (left > 0) kept.push({ ...s, roundsLeft: left })
    else expired.push(s)
  }
  return { kept, expired }
}
