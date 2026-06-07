import { describe, expect, it } from 'vitest'
import { xpForLevel } from '../domain/config'
import { applyXp, statsForClassAtLevel } from './leveling'

describe('statsForClassAtLevel', () => {
  it('level 1 = base', () => {
    const s = statsForClassAtLevel('striker', 1)
    expect(s).toMatchObject({ level: 1, maxHp: 95, atk: 20, def: 8, spd: 16, mag: 6 })
  })
  it('applies growth per level above 1', () => {
    const s = statsForClassAtLevel('striker', 3) // +2 growth steps
    expect(s.atk).toBe(20 + 3 * 2)
    expect(s.maxHp).toBe(95 + 10 * 2)
  })
})

describe('applyXp', () => {
  it('does not level up below threshold', () => {
    const s = statsForClassAtLevel('vanguard', 1)
    const r = applyXp(s, 'vanguard', xpForLevel(1) - 1)
    expect(r.levelsGained).toBe(0)
    expect(r.stats.level).toBe(1)
  })
  it('levels up and applies growth, carrying remainder', () => {
    const s = statsForClassAtLevel('vanguard', 1)
    const r = applyXp(s, 'vanguard', xpForLevel(1) + 5)
    expect(r.levelsGained).toBe(1)
    expect(r.stats.level).toBe(2)
    expect(r.stats.xp).toBe(5)
    expect(r.stats.atk).toBe(18 + 3)
  })
  it('handles multiple level-ups in one gain', () => {
    const s = statsForClassAtLevel('vanguard', 1)
    const big = xpForLevel(1) + xpForLevel(2)
    const r = applyXp(s, 'vanguard', big)
    expect(r.levelsGained).toBe(2)
    expect(r.stats.level).toBe(3)
  })
  it('is pure (does not mutate input)', () => {
    const s = statsForClassAtLevel('vanguard', 1)
    applyXp(s, 'vanguard', 10_000)
    expect(s.level).toBe(1)
  })
})
