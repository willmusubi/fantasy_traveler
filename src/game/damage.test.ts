import { describe, expect, it } from 'vitest'
import {
  CHIP_FLOOR_PCT, CRIT_CAP, CRIT_MULT, DEADLINE_CRIT_BONUS, DMG_VARIANCE, HIT_FLOOR,
} from '../domain/config'
import { critRate, elementMult, hitRate, physMult, rollDamage, typeMultiplier } from './damage'

/** Deterministic roll sequence — values consumed in pipeline order (hit, crit, variance). */
function seq(...vals: number[]): () => number {
  let i = 0
  return () => vals[Math.min(i++, vals.length - 1)]
}
/** Mid-variance roll (0.5 → variance exactly 1.0). */
const MID = 0.5

describe('hitRate', () => {
  it('equal hit/eva = base 88%', () => expect(hitRate(10, 10)).toBe(88))
  it('caps at 100% with a big hit advantage', () => expect(hitRate(30, 10)).toBe(100))
  it('floors at 55% against extreme eva', () => expect(hitRate(0, 100)).toBe(HIT_FLOOR))
})

describe('critRate', () => {
  it('5% base + 0.3/skl', () => expect(critRate(10)).toBe(8))
  it('caps at 45%', () => expect(critRate(1000)).toBe(CRIT_CAP))
  it('gear bonus adds in', () => expect(critRate(10, 5)).toBe(13))
})

describe('type multipliers', () => {
  it('phys weakness ×1.5 / resist ×0.7 / neutral 1.0 (incl. arcane 弱魔)', () => {
    expect(physMult('slash', ['slash'])).toBe(1.5)
    expect(physMult('arcane', ['arcane'])).toBe(1.5) // 弱魔 is a first-class weakness
    expect(physMult('pierce', ['slash'], ['pierce'])).toBe(0.7)
    expect(physMult('strike')).toBe(1)
    expect(physMult(undefined, ['slash'])).toBe(1)
  })
  it('五行相克环: 木→土→水→火→金→木', () => {
    expect(elementMult('wood', 'earth')).toBe(1.3)
    expect(elementMult('earth', 'water')).toBe(1.3)
    expect(elementMult('water', 'fire')).toBe(1.3)
    expect(elementMult('fire', 'metal')).toBe(1.3)
    expect(elementMult('metal', 'wood')).toBe(1.3)
    expect(elementMult('earth', 'wood')).toBe(0.8) // 被克
    expect(elementMult('fire', 'fire')).toBe(1) // 同行中立
    expect(elementMult(undefined, 'fire')).toBe(1) // 旅人无属性 → 恒中立
  })
  it('combined product clamps to [0.5, 2.0]', () => {
    expect(typeMultiplier('slash', 'wood', 'earth', ['slash'])).toBeCloseTo(1.95) // 1.5×1.3 — the 解谜 moment
    expect(typeMultiplier('pierce', 'earth', 'wood', undefined, ['pierce'])).toBeCloseTo(0.56) // 0.7×0.8
  })
})

describe('rollDamage', () => {
  const base = { pow: 20, power: 1.5, def: 10, attackerHit: 12, targetEva: 8, roll: seq(0, MID) }

  it('lands a plain hit: raw = pow×power − def×0.5, mid variance = exact', () => {
    const r = rollDamage({ ...base })
    // 20×1.5 − 10×0.5 = 25; no crit (no skl), variance 1.0
    expect(r).toMatchObject({ dmg: 25, missed: false, crit: false, typeMult: 1 })
  })

  it('misses on a high roll vs the hit rate (true miss = 0 damage)', () => {
    // hit 12 vs eva 8 → 92.8% — roll 0.93 misses.
    const r = rollDamage({ ...base, roll: seq(0.93) })
    expect(r).toMatchObject({ dmg: 0, missed: true, crit: false })
  })

  it('player-side crit multiplies ×1.6 outside the type clamp', () => {
    // rolls: hit 0 (lands), crit 0 (crits — rate ≥ 5%), variance 0.5 (×1.0)
    const r = rollDamage({ ...base, attackerSkl: 14, roll: seq(0, 0, MID) })
    expect(r.crit).toBe(true)
    expect(r.dmg).toBe(Math.round(25 * CRIT_MULT)) // 40
  })

  it('enemy-side attacks NEVER crit (no skl provided)', () => {
    const r = rollDamage({ ...base, roll: seq(0, 0, MID) })
    expect(r.crit).toBe(false)
  })

  it('§35 准时暴击: critBonusPct lifts the crit rate so a borderline roll lands', () => {
    // skl 0 → base critRate 5%. A crit roll of 0.10 (10%) sits ABOVE the base window but the
    // on-time bonus (+15 → 20%) pulls it in. Same roll, crit flips on the bonus alone.
    const rolls = () => seq(0, 0.1, MID)
    expect(rollDamage({ ...base, attackerSkl: 0, roll: rolls() }).crit).toBe(false)
    const onTime = rollDamage({ ...base, attackerSkl: 0, critBonusPct: DEADLINE_CRIT_BONUS, roll: rolls() })
    expect(onTime.crit).toBe(true)
    expect(onTime.dmg).toBe(Math.round(25 * CRIT_MULT)) // 40 — ×1.6 outside the type clamp
  })

  it('chip floor: heavy defense yields ceil(10% of raw hit), not 1', () => {
    const r = rollDamage({ ...base, def: 999, roll: seq(0, MID) })
    expect(r.dmg).toBe(Math.ceil(20 * 1.5 * CHIP_FLOOR_PCT)) // 3 — no insulting min-1
  })

  it('weakness + element advantage stack into the clamped mult (效果拔群)', () => {
    const r = rollDamage({
      ...base, physKind: 'slash', targetWeak: ['slash'],
      attackerElement: 'fire', targetElement: 'metal', roll: seq(0, MID),
    })
    expect(r.typeMult).toBeCloseTo(1.95)
    expect(r.dmg).toBe(Math.round(25 * 1.95)) // 49
  })

  it('variance spans ±8%', () => {
    const lo = rollDamage({ ...base, roll: seq(0, 0) })
    const hi = rollDamage({ ...base, roll: seq(0, 0.9999999) })
    expect(lo.dmg).toBe(Math.round(25 * (1 - DMG_VARIANCE)))
    expect(hi.dmg).toBe(Math.round(25 * (1 + DMG_VARIANCE)))
  })

  it('buffMult scales the raw before soak/floor', () => {
    const r = rollDamage({ ...base, buffMult: 1.2, roll: seq(0, MID) })
    expect(r.dmg).toBe(Math.round(20 * 1.5 * 1.2 - 5)) // 31
  })

  it('is deterministic for a fixed roll sequence', () => {
    const a = rollDamage({ ...base, attackerSkl: 10, roll: seq(0.1, 0.5, 0.7) })
    const b = rollDamage({ ...base, attackerSkl: 10, roll: seq(0.1, 0.5, 0.7) })
    expect(a).toEqual(b)
  })
})
