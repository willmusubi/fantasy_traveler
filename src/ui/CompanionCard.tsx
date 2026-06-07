import { rankForPoints } from '../companion/affinity'
import { AFFINITY_THRESHOLDS } from '../domain/config'
import type { AffinityRank } from '../domain/types'
import { t } from '../i18n'
import { selectPrimaryCompanion, useGame } from '../state/gameStore'
import { Portrait } from './Portrait'

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

export function CompanionCard() {
  const companion = useGame(selectPrimaryCompanion)
  const affinity = useGame((s) => (companion ? s.affinities[companion.id] : undefined))
  if (!companion) return null

  const points = affinity?.points ?? 0
  const everGained = (affinity?.rank ?? 'none') !== 'none' || points > 0
  const rank = rankForPoints(points, everGained)
  const nextMin = NEXT_MIN[rank]
  const curMin = CUR_MIN[rank]
  const fillPct = nextMin === null ? 100 : Math.round(((points - curMin) / (nextMin - curMin)) * 100)

  // Reactions now surface in the global ReactionPopup (random reactor + portrait), so the
  // home card just shows the primary companion at her resting expression.
  const expression = companion.persona?.defaultExpression ?? 'smile'

  return (
    <div className="panel">
      <div className="panel-title">伙伴</div>
      <div className="companion-card">
        <Portrait portraitSet={companion.portraitSet} expression={expression} name={companion.name} />
        <div className="companion-body">
          <div className="companion-name">{companion.name}</div>
          <div className="companion-brand">专属烙印 · {companion.brand}</div>
          <div className="affinity-row">
            <span>好感度</span>
            <span className="affinity-rank">{t(`affinity.${rank}`)}</span>
          </div>
          <div className="affinity-bar">
            <div className="affinity-bar-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
