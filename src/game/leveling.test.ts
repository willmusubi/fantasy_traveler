import { describe, expect, it } from 'vitest'
import { MAX_LEVEL, PROFILE_TEMPLATES, xpForLevel } from '../domain/config'
import { applyXp, statsForClassAtLevel, statsForProfileAtLevel } from './leveling'

const attacker = PROFILE_TEMPLATES.attacker
const balanced = PROFILE_TEMPLATES.balanced

describe('statsForProfileAtLevel', () => {
  it('level 1 = base (attacker template)', () => {
    const s = statsForProfileAtLevel(attacker, 1)
    expect(s).toMatchObject({
      level: 1, maxHp: 95, maxMp: 24, str: 18, vit: 8, wis: 6, spr: 7, spd: 15, skl: 14, hit: 14, eva: 10,
    })
  })
  it('applies growth per level above 1', () => {
    const s = statsForProfileAtLevel(attacker, 3) // +2 growth steps
    expect(s.str).toBe(18 + 3 * 2)
    expect(s.maxHp).toBe(95 + 10 * 2)
    expect(s.skl).toBe(14 + 3 * 2)
    expect(s.eva).toBe(10 + 2 * 2)
  })
  it('clamps to MAX_LEVEL (bounded growth)', () => {
    const s = statsForProfileAtLevel(attacker, MAX_LEVEL + 10)
    expect(s.level).toBe(MAX_LEVEL)
    expect(s.str).toBe(18 + 3 * (MAX_LEVEL - 1))
  })
})

describe('statsForClassAtLevel (legacy shim)', () => {
  it('maps classId to its profile template (§25)', () => {
    expect(statsForClassAtLevel('striker', 1)).toEqual(statsForProfileAtLevel(attacker, 1))
    expect(statsForClassAtLevel('vanguard', 1)).toEqual(statsForProfileAtLevel(balanced, 1))
  })
})

describe('applyXp', () => {
  it('does not level up below threshold', () => {
    const s = statsForProfileAtLevel(balanced, 1)
    const r = applyXp(s, balanced, xpForLevel(1) - 1)
    expect(r.levelsGained).toBe(0)
    expect(r.stats.level).toBe(1)
  })
  it('levels up and applies growth, carrying remainder', () => {
    const s = statsForProfileAtLevel(balanced, 1)
    const r = applyXp(s, balanced, xpForLevel(1) + 5)
    expect(r.levelsGained).toBe(1)
    expect(r.stats.level).toBe(2)
    expect(r.stats.xp).toBe(5)
    expect(r.stats.str).toBe(14 + 2)
    expect(r.stats.spr).toBe(10 + 2)
  })
  it('handles multiple level-ups in one gain', () => {
    const s = statsForProfileAtLevel(balanced, 1)
    const big = xpForLevel(1) + xpForLevel(2)
    const r = applyXp(s, balanced, big)
    expect(r.levelsGained).toBe(2)
    expect(r.stats.level).toBe(3)
  })
  it('hard-stops at MAX_LEVEL and discards overflow XP', () => {
    const s = statsForProfileAtLevel(balanced, MAX_LEVEL)
    const r = applyXp(s, balanced, 1_000_000)
    expect(r.levelsGained).toBe(0)
    expect(r.stats.level).toBe(MAX_LEVEL)
    expect(r.stats.xp).toBe(0) // overflow discarded at the cap
  })
  it('is pure (does not mutate input)', () => {
    const s = statsForProfileAtLevel(balanced, 1)
    applyXp(s, balanced, 10_000)
    expect(s.level).toBe(1)
  })
})
