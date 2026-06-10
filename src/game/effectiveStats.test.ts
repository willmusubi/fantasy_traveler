import { describe, expect, it } from 'vitest'
import type { Character } from '../domain/types'
import type { SynergyDef } from '../world/relationships'
import { EMPTY_COMBAT_CONTEXT, effectiveStats } from './effectiveStats'
import { statsForClassAtLevel } from './leveling'

function char(id: string, classId: Character['classId']): Character {
  return {
    id, name: id, kind: 'companion', classId, worldId: 'stargazers',
    stats: statsForClassAtLevel(classId, 1), skills: [], portraitSet: 'x', createdAt: '',
  }
}

describe('effectiveStats', () => {
  it('empty context is the identity (keeps M0 combat unchanged)', () => {
    const c = char('mira', 'striker') // attacker template: base str 18
    expect(effectiveStats(c, EMPTY_COMBAT_CONTEXT)).toEqual(c.stats)
  })

  it('adds equipped item bonuses for THIS character only', () => {
    const c = char('mira', 'striker')
    const ctx = {
      ownedEquipment: [
        { instanceId: 'i1', defId: 'starlit_blade', equippedBy: 'mira', acquiredAt: '' }, // +6 str +3 spd
        { instanceId: 'i2', defId: 'practice_dagger', equippedBy: 'someone_else', acquiredAt: '' }, // not ours
        { instanceId: 'i3', defId: 'stargaze_cloak', acquiredAt: '' }, // unequipped
      ],
      activeSynergies: [] as SynergyDef[],
    }
    expect(effectiveStats(c, ctx).str).toBe(18 + 6)
    expect(effectiveStats(c, ctx).spd).toBe(15 + 3)
  })

  it('applies synergy percentage bonuses', () => {
    const c = char('mira', 'striker')
    const syn: SynergyDef = { id: 'x', worldId: 'stargazers', requires: [], bonus: { atkPct: 0.2 }, labelKey: 'x' }
    const ctx = { ownedEquipment: [], activeSynergies: [syn] }
    expect(effectiveStats(c, ctx).str).toBe(Math.round(18 * 1.2))
  })

  it('stacks equipment (flat) then synergy (percent)', () => {
    const c = char('mira', 'striker')
    const syn: SynergyDef = { id: 'x', worldId: 'stargazers', requires: [], bonus: { atkPct: 0.5 }, labelKey: 'x' }
    const ctx = {
      ownedEquipment: [{ instanceId: 'i1', defId: 'starlit_blade', equippedBy: 'mira', acquiredAt: '' }],
      activeSynergies: [syn],
    }
    expect(effectiveStats(c, ctx).str).toBe(Math.round((18 + 6) * 1.5))
  })

  it('applies party buff percentages for def/spd/mag (atk stays in the attack mult)', () => {
    const c = char('arc', 'arcanist') // caster template: vit 7, spd 11, wis 18, str 6
    const ctx = {
      ownedEquipment: [],
      activeSynergies: [] as SynergyDef[],
      partyBuffs: [
        { id: 'b1', kind: 'magPct' as const, magnitude: 0.25, untilVictory: true },
        { id: 'b2', kind: 'defPct' as const, magnitude: 0.2, untilVictory: true },
        { id: 'b3', kind: 'atkPct' as const, magnitude: 0.5, untilVictory: true }, // ignored here
      ],
    }
    const s = effectiveStats(c, ctx)
    expect(s.wis).toBe(Math.round(18 * 1.25))
    expect(s.vit).toBe(Math.round(7 * 1.2))
    expect(s.str).toBe(6) // atkPct is NOT applied in effectiveStats
  })

  it('a negative spd debuff lowers speed but never below 1', () => {
    const slow = char('guardian', 'guardian') // base spd 7
    const ctx = { ownedEquipment: [], activeSynergies: [] as SynergyDef[], partyBuffs: [{ id: 'd', kind: 'spdPct' as const, magnitude: -0.15, untilVictory: true }] }
    expect(effectiveStats(slow, ctx).spd).toBe(Math.round(7 * 0.85))
    const crippled = char('guardian', 'guardian')
    const ctx2 = { ownedEquipment: [], activeSynergies: [] as SynergyDef[], partyBuffs: [{ id: 'd2', kind: 'spdPct' as const, magnitude: -5, untilVictory: true }] }
    expect(effectiveStats(crippled, ctx2).spd).toBe(1) // floored
  })
})
