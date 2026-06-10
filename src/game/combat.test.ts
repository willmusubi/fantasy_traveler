import { describe, expect, it } from 'vitest'
import { ARCHETYPE_PATTERNS, enemyHpBudget, HP_PER_OPEN_HIGH } from '../domain/config'
import { statsForClassAtLevel } from './leveling'
import type { Character, Monster } from '../domain/types'
import { computeDamage, ctbForecast, ctbResolve, ctbRound, partyAtk, spawnMonster, type CtbUnit } from './combat'

function char(classId: Character['classId'], kind: Character['kind']): Character {
  return {
    id: `${kind}-${classId}`,
    name: classId,
    kind,
    classId,
    stats: statsForClassAtLevel(classId, 1),
    skills: [],
    portraitSet: 'x',
    createdAt: '2026-05-29',
  }
}

const monster: Monster = {
  id: 'm1', nameKey: 'monster.procrastination', level: 1,
  maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1,
}

describe('partyAtk', () => {
  it('sums atk across the party', () => {
    const party = [char('vanguard', 'player'), char('striker', 'companion')]
    expect(partyAtk(party)).toBe(14 + 18) // balanced 14 + attacker 18 (§25 profiles)
  })
})

describe('computeDamage', () => {
  const party = [char('vanguard', 'player'), char('striker', 'companion')] // str 32
  it('applies priority multiplier and subtracts def', () => {
    expect(computeDamage(party, 'high', monster)).toBe(Math.round(32 * 2.5 - 10)) // 70
    expect(computeDamage(party, 'med', monster)).toBe(Math.round(32 * 1.5 - 10)) // 38
    expect(computeDamage(party, 'low', monster)).toBe(Math.round(32 * 1 - 10)) // 22
  })
  it('never deals less than 1', () => {
    const tank: Monster = { ...monster, def: 9999 }
    expect(computeDamage(party, 'low', tank)).toBe(1)
  })
})

describe('CTB turn timeline', () => {
  it('forecasts turns soonest-by-charge first (cold start orders by speed)', () => {
    const units: CtbUnit[] = [
      { side: 'party', id: 'fast', spd: 16, charge: 0 },
      { side: 'party', id: 'slow', spd: 10, charge: 0 },
      { side: 'enemy', id: 'enemy', spd: 9, charge: 0 },
    ]
    expect(ctbForecast(units, 3).map((a) => a.id)).toEqual(['fast', 'slow', 'enemy'])
  })

  it('a faster unit laps — it acts repeatedly before a slow one gets a turn', () => {
    const units: CtbUnit[] = [
      { side: 'party', id: 'fast', spd: 20, charge: 0 },
      { side: 'party', id: 'slow', spd: 5, charge: 0 },
    ]
    expect(ctbForecast(units, 3).map((a) => a.id)).toEqual(['fast', 'fast', 'fast'])
  })

  it('resolves N party turns, lets a charged enemy interject, and carries overflow', () => {
    const cold: CtbUnit[] = [
      { side: 'party', id: 'A', spd: 16, charge: 0 },
      { side: 'party', id: 'B', spd: 10, charge: 0 },
      { side: 'enemy', id: 'E', spd: 9, charge: 0 },
    ]
    const r = ctbResolve(cold, 2)
    expect(r.order.map((a) => a.id)).toEqual(['A', 'B']) // 2 party turns; the slow enemy didn't reach act
    expect(r.charges.E).toBeGreaterThan(80) // its gauge CARRIED (not reset) toward next completion

    const charged: CtbUnit[] = [
      { side: 'party', id: 'A', spd: 16, charge: 0 },
      { side: 'enemy', id: 'E', spd: 9, charge: 95 },
    ]
    expect(ctbResolve(charged, 1).order.map((a) => a.side)).toEqual(['enemy', 'party']) // enemy interjects first
  })
})

describe('ctbRound (one task = one round)', () => {
  it('every living unit takes its own turn at least once per round', () => {
    const cold: CtbUnit[] = [
      { side: 'party', id: 'fast', spd: 16, charge: 0 },
      { side: 'party', id: 'slow', spd: 10, charge: 0 },
      { side: 'enemy', id: 'E', spd: 9, charge: 0 },
    ]
    const ids = ctbRound(cold).order.map((a) => a.id)
    expect(ids).toContain('fast')
    expect(ids).toContain('slow')
    expect(ids).toContain('E') // the enemy is a unit in the round too → it attacks on its turn
  })

  it('a faster unit laps as a BONUS — the slow unit STILL takes its own turn (not eaten)', () => {
    const units: CtbUnit[] = [
      { side: 'party', id: 'fast', spd: 20, charge: 0 },
      { side: 'party', id: 'slow', spd: 5, charge: 0 },
    ]
    const order = ctbRound(units).order.map((a) => a.id)
    expect(order.filter((id) => id === 'fast').length).toBeGreaterThanOrEqual(2) // laps
    expect(order.filter((id) => id === 'slow').length).toBe(1) // never starved (the old bug)
  })

  it('carries gauge overflow into the next round, gauges stay in [0, THRESHOLD)', () => {
    const { charges } = ctbRound([
      { side: 'party', id: 'fast', spd: 16, charge: 0 },
      { side: 'party', id: 'slow', spd: 10, charge: 0 },
    ])
    for (const id of ['fast', 'slow']) {
      expect(charges[id]).toBeGreaterThanOrEqual(0)
      expect(charges[id]).toBeLessThan(100)
    }
    expect(charges.slow).toBeCloseTo(0) // the slowest unit sets Δ → ends fully discharged
  })

  it('a charged enemy crosses inside the window and interjects first', () => {
    const order = ctbRound([
      { side: 'party', id: 'A', spd: 10, charge: 0 },
      { side: 'enemy', id: 'E', spd: 9, charge: 95 },
    ]).order
    expect(order[0]).toEqual({ side: 'enemy', id: 'E' }) // its gauge was nearly full
    expect(order.some((a) => a.side === 'party')).toBe(true)
  })
})

describe('spawnMonster (§25 TTK-budget curves)', () => {
  it('sizes HP from the archetype TTK budget + open-high load', () => {
    const m = spawnMonster(0, 0, () => 'id')
    expect(m.maxHp).toBe(enemyHpBudget(0, 'elite'))
    const m2 = spawnMonster(2, 3, () => 'id')
    expect(m2.maxHp).toBe(enemyHpBudget(2, 'elite') + HP_PER_OPEN_HIGH * 3)
    expect(m2.hp).toBe(m2.maxHp)
    expect(m2.level).toBe(3)
  })
  it('carries the §25 combat fields + a move rotation; the 心魔 stays a NEUTRAL dummy', () => {
    const m = spawnMonster(0, 0, () => 'id')
    expect(m.matk).toBeGreaterThan(0)
    expect(m.mdef).toBeGreaterThan(0)
    expect(m.hit).toBe(8)
    expect(m.eva).toBe(6)
    expect(m.pattern).toEqual(ARCHETYPE_PATTERNS.elite)
    expect(m.element).toBeUndefined() // training dummy: no weakness puzzle
    expect(m.physWeak).toBeUndefined()
  })
  it('a boss budget is larger than an elite, which beats a mook (TTK 10/6/4)', () => {
    expect(enemyHpBudget(0, 'boss')).toBeGreaterThan(enemyHpBudget(0, 'elite'))
    expect(enemyHpBudget(0, 'elite')).toBeGreaterThan(enemyHpBudget(0, 'mook'))
  })
})
