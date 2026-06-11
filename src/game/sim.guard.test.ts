// §25 TTK guard — the CI tripwire for the product pacing anchors. If a stat/curve
// change pushes fights out of the productivity-loop budget (a fight should cost a
// handful of REAL tasks, at every level), this fails before any player feels it.

import { describe, expect, it } from 'vitest'
import { summarize, summarizeSpec } from './simulator'

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

describe('§26 sim extensions', () => {
  it('(a) boss with sleepRounds:2 has strictly lower mean TTK than baseline boss (high-wipe scenario)', () => {
    // poolScale:0.3 simulates a fragile-party scenario where the boss causes frequent wipes
    // (each wipe heals the boss 30%, extending TTK).  Preventing 2 rounds of enemy attacks via
    // sleep reliably reduces wipes → lower mean TTK.  300 runs stabilises the estimate.
    for (const lv of LEVELS) {
      const base = summarizeSpec({ level: lv, archetype: 'boss', exploit: false, poolScale: 0.3 }, 300)
      const slept = summarizeSpec({ level: lv, archetype: 'boss', exploit: false, sleepRounds: 2, poolScale: 0.3 }, 300)
      expect(slept.mean, `L${lv} sleep-2 TTK`).toBeLessThan(base.mean)
    }
  })

  it('(b) boss with 0.5-phase atkBoost+10 has mean TTK within ±1 round of baseline AND wipeRate >= baseline', () => {
    const phased = [{ triggerHpPct: 0.5, atkBoost: 10 }]
    for (const lv of LEVELS) {
      const base = summarize(lv, 'boss', false, 120)
      const boosted = summarizeSpec({ level: lv, archetype: 'boss', exploit: false, phases: phased }, 120)
      expect(Math.abs(boosted.mean - base.mean), `L${lv} phase TTK delta`).toBeLessThanOrEqual(1)
      expect(boosted.wipeRate, `L${lv} phase wipeRate >= baseline`).toBeGreaterThanOrEqual(base.wipeRate)
    }
  })
})
