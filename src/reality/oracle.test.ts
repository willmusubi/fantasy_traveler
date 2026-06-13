import { describe, expect, it } from 'vitest'
import type { RealityEvidence, RealityQuest } from '../domain/types'
import { evaluateThreshold, shouldAutoVerify } from './oracle'

const quest = {
  provider: 'bilibili-video',
  metric: 'coin',
  sourceRef: 'BV1dzEx6jERS',
  threshold: 100,
} as RealityQuest

function evidence(value: number): RealityEvidence {
  return {
    provider: 'bilibili-video',
    metric: 'coin',
    sourceRef: 'BV1dzEx6jERS',
    value,
    sourceUrl: 'https://www.bilibili.com/video/BV1dzEx6jERS',
    observedAt: '2026-06-13T00:00:00.000Z',
  }
}

describe('evaluateThreshold', () => {
  it('does not pass below the configured threshold', () => {
    expect(evaluateThreshold(quest, evidence(99))).toEqual({ passed: false, value: 99, threshold: 100 })
  })

  it('passes at the configured threshold', () => {
    expect(evaluateThreshold(quest, evidence(100))).toEqual({ passed: true, value: 100, threshold: 100 })
  })

  it('does not use evidence from a different source', () => {
    expect(evaluateThreshold(quest, { ...evidence(999), sourceRef: 'BV1xxxxxxxxx' }).passed).toBe(false)
  })
})

describe('shouldAutoVerify', () => {
  it('checks an active quest with no evidence', () => {
    expect(shouldAutoVerify({ ...quest, status: 'active', evidence: [] } as RealityQuest, new Date('2026-06-13T12:00:00Z'))).toBe(true)
  })

  it('waits one week between automatic checks and ignores settled quests', () => {
    const checked = { ...quest, status: 'active', evidence: [evidence(20)] } as RealityQuest
    expect(shouldAutoVerify(checked, new Date('2026-06-19T23:59:59Z'))).toBe(false)
    expect(shouldAutoVerify(checked, new Date('2026-06-20T00:00:00Z'))).toBe(true)
    expect(shouldAutoVerify({ ...checked, status: 'settled' }, new Date('2026-06-20T00:00:00Z'))).toBe(false)
  })
})
