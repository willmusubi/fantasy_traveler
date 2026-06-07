import { describe, expect, it } from 'vitest'
import { AFFINITY_DAILY_CAP } from '../domain/config'
import { applyAffinityGain, freshAffinity, rankForPoints } from './affinity'

const TODAY = '2026-05-29'

describe('rankForPoints', () => {
  it('is none only when never gained and at 0', () => {
    expect(rankForPoints(0, false)).toBe('none')
    expect(rankForPoints(0, true)).toBe('C')
  })
  it('crosses thresholds', () => {
    expect(rankForPoints(99, true)).toBe('C')
    expect(rankForPoints(100, true)).toBe('B')
    expect(rankForPoints(250, true)).toBe('A')
    expect(rankForPoints(500, true)).toBe('S')
  })
})

describe('applyAffinityGain', () => {
  it('first gain moves none -> C and reports rank-up', () => {
    const a = freshAffinity('c1', TODAY)
    const r = applyAffinityGain(a, 5, TODAY)
    expect(r.applied).toBe(5)
    expect(r.affinity.rank).toBe('C')
    expect(r.rankedUpTo).toBe('C')
  })

  it('honors the daily cap', () => {
    let a = freshAffinity('c1', TODAY)
    const r1 = applyAffinityGain(a, AFFINITY_DAILY_CAP, TODAY)
    expect(r1.applied).toBe(AFFINITY_DAILY_CAP)
    const r2 = applyAffinityGain(r1.affinity, 10, TODAY)
    expect(r2.applied).toBe(0) // cap reached
    expect(r2.affinity.points).toBe(AFFINITY_DAILY_CAP)
  })

  it('resets the daily counter on a new local day', () => {
    let a = freshAffinity('c1', TODAY)
    a = applyAffinityGain(a, AFFINITY_DAILY_CAP, TODAY).affinity
    const r = applyAffinityGain(a, 10, '2026-05-30')
    expect(r.applied).toBe(10)
    expect(r.affinity.dailyGained).toBe(10)
  })

  it('reports rank-up only when a threshold is crossed', () => {
    let a = freshAffinity('c1', TODAY)
    a = { ...a, points: 96, rank: 'C', dailyGained: 0 }
    const r = applyAffinityGain(a, 5, TODAY) // 96 -> 101 crosses B
    expect(r.affinity.rank).toBe('B')
    expect(r.rankedUpTo).toBe('B')
    const r2 = applyAffinityGain(r.affinity, 1, TODAY) // still B
    expect(r2.rankedUpTo).toBe(null)
  })
})
