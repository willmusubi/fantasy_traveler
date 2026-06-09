import { rankForPoints } from '../companion/affinity'
import { AFFINITY_THRESHOLDS } from '../domain/config'
import type { AffinityRank } from '../domain/types'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

// Single source of truth for the affinity rank/fill math (used by AffinityBar / ChatSwitcher).
const NEXT_MIN: Record<AffinityRank, number | null> = {
  none: AFFINITY_THRESHOLDS.C,
  C: AFFINITY_THRESHOLDS.B,
  B: AFFINITY_THRESHOLDS.A,
  A: AFFINITY_THRESHOLDS.S,
  S: null,
}
const CUR_MIN: Record<AffinityRank, number> = {
  none: 0, C: AFFINITY_THRESHOLDS.C, B: AFFINITY_THRESHOLDS.B, A: AFFINITY_THRESHOLDS.A, S: AFFINITY_THRESHOLDS.S,
}

/** A compact rank label + fill bar for one companion's affinity. Recomputes the rank from points
 *  (not the stored rank) so the label and bar can never disagree. */
export function AffinityBar({ companionId }: { companionId: string }) {
  const affinity = useGame((s) => s.affinities[companionId])
  const points = affinity?.points ?? 0
  const everGained = (affinity?.rank ?? 'none') !== 'none' || points > 0
  const rank = rankForPoints(points, everGained)
  const nextMin = NEXT_MIN[rank]
  const curMin = CUR_MIN[rank]
  const fillPct = nextMin === null ? 100 : Math.round(((points - curMin) / (nextMin - curMin)) * 100)

  return (
    <div className="affinity-line">
      <span className="affinity-rank">{t(`affinity.${rank}`)}</span>
      <div className="affinity-bar affinity-bar-thin">
        <div className="affinity-bar-fill" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  )
}
