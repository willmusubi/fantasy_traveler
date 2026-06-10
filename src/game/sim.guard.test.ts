// §25 TTK guard — the CI tripwire for the product pacing anchors. If a stat/curve
// change pushes fights out of the productivity-loop budget (a fight should cost a
// handful of REAL tasks, at every level), this fails before any player feels it.

import { describe, expect, it } from 'vitest'
import { summarize } from './simulator'

const LEVELS = [1, 30, 60] // bounded-growth checkpoints (MAX_LEVEL horizon)

describe('§25 pacing anchors (seeded montecarlo)', () => {
  it('elite ≈ 4-9 rounds neutral at every checkpoint (level-invariant pacing)', () => {
    for (const lv of LEVELS) {
      const s = summarize(lv, 'elite', false, 120)
      expect(s.killRate, `L${lv} elite killRate`).toBeGreaterThan(0.95)
      expect(s.mean, `L${lv} elite mean TTK`).toBeGreaterThanOrEqual(3.5)
      expect(s.mean, `L${lv} elite mean TTK`).toBeLessThanOrEqual(9)
    }
  })

  it('boss ≈ 7-14 rounds neutral; mook ≈ 2.5-7', () => {
    for (const lv of LEVELS) {
      const boss = summarize(lv, 'boss', false, 120)
      expect(boss.mean, `L${lv} boss`).toBeGreaterThanOrEqual(7)
      expect(boss.mean, `L${lv} boss`).toBeLessThanOrEqual(14)
      const mook = summarize(lv, 'mook', false, 120)
      expect(mook.mean, `L${lv} mook`).toBeGreaterThanOrEqual(2.5)
      expect(mook.mean, `L${lv} mook`).toBeLessThanOrEqual(7)
    }
  })

  it('exploiting weaknesses is a real reward (faster) but never required (≤ ~2×)', () => {
    for (const lv of LEVELS) {
      const n = summarize(lv, 'elite', false, 120)
      const e = summarize(lv, 'elite', true, 120)
      expect(e.mean, `L${lv} exploit faster`).toBeLessThan(n.mean)
      expect(n.mean / e.mean, `L${lv} speedup cap`).toBeLessThanOrEqual(2.2)
    }
  })

  it('at-level fights do not death-spiral (wipe rate stays low)', () => {
    for (const lv of LEVELS) {
      const s = summarize(lv, 'elite', false, 120)
      expect(s.wipeRate, `L${lv} elite wipes`).toBeLessThanOrEqual(0.1)
      const b = summarize(lv, 'boss', false, 120)
      expect(b.wipeRate, `L${lv} boss wipes`).toBeLessThanOrEqual(0.5)
    }
  })
})
