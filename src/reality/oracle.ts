import type { RealityEvidence, RealityQuest } from '../domain/types'

export interface ThresholdResult {
  passed: boolean
  value: number
  threshold: number
}

export const AUTO_VERIFY_INTERVAL_MS = 7 * 24 * 60 * 60_000

/** External facts are adjudicated by deterministic code; AI is never the judge. */
export function evaluateThreshold(quest: Pick<RealityQuest, 'provider' | 'metric' | 'sourceRef' | 'threshold'>, evidence: RealityEvidence): ThresholdResult {
  const comparable =
    quest.provider === evidence.provider &&
    quest.metric === evidence.metric &&
    quest.sourceRef === evidence.sourceRef
  return {
    passed: comparable && evidence.value >= quest.threshold,
    value: evidence.value,
    threshold: quest.threshold,
  }
}

/** Active claims are refreshed conservatively when the app starts or regains focus. */
export function shouldAutoVerify(quest: RealityQuest, now = new Date(), intervalMs = AUTO_VERIFY_INTERVAL_MS): boolean {
  if (quest.status !== 'active') return false
  const latest = quest.evidence[quest.evidence.length - 1]
  if (!latest) return true
  return now.getTime() - new Date(latest.observedAt).getTime() >= intervalMs
}
