// Pure affinity math (§9, §21). Rules-computed (never LLM-computed).

import { AFFINITY_DAILY_CAP, AFFINITY_THRESHOLDS } from '../domain/config'
import type { Affinity, AffinityRank } from '../domain/types'

const RANK_ORDER: AffinityRank[] = ['none', 'C', 'B', 'A', 'S']

/** Rank for a given point total. `none` only when points are 0 AND never gained. */
export function rankForPoints(points: number, everGained: boolean): AffinityRank {
  if (!everGained && points <= 0) return 'none'
  if (points >= AFFINITY_THRESHOLDS.S) return 'S'
  if (points >= AFFINITY_THRESHOLDS.A) return 'A'
  if (points >= AFFINITY_THRESHOLDS.B) return 'B'
  return 'C'
}

export function rankIndex(rank: AffinityRank): number {
  return RANK_ORDER.indexOf(rank)
}

export interface AffinityGainResult {
  affinity: Affinity
  /** points actually applied after the daily cap. */
  applied: number
  /** the rank crossed into this gain, or null. */
  rankedUpTo: AffinityRank | null
}

/**
 * Apply an affinity gain honoring the daily cap and none→C boundary.
 * `today` is an injected local date key (YYYY-MM-DD); pure.
 */
export function applyAffinityGain(
  current: Affinity,
  requested: number,
  today: string,
): AffinityGainResult {
  // Reset the daily counter on a new local day.
  const dailyGained = current.dailyGainedOn === today ? current.dailyGained : 0
  const remaining = Math.max(0, AFFINITY_DAILY_CAP - dailyGained)
  const applied = Math.max(0, Math.min(requested, remaining))

  const beforeRank = current.rank
  const points = current.points + applied
  const everGained = applied > 0 || current.points > 0 || current.rank !== 'none'
  const rank = rankForPoints(points, everGained)

  const rankedUpTo = rankIndex(rank) > rankIndex(beforeRank) ? rank : null

  return {
    affinity: {
      ...current,
      points,
      rank,
      dailyGained: dailyGained + applied,
      dailyGainedOn: today,
    },
    applied,
    rankedUpTo,
  }
}

/** A fresh affinity record for a companion. */
export function freshAffinity(characterId: string, today: string): Affinity {
  return {
    characterId,
    points: 0,
    rank: 'none',
    unlockedSupports: [],
    dailyGained: 0,
    dailyGainedOn: today,
  }
}
