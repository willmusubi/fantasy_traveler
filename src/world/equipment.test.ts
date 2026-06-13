import { describe, expect, it } from 'vitest'
import { WEAPON_CATEGORY } from '../domain/config'
import { EQUIPMENT_DEFS, getWorldEquipment } from './equipment'

describe('getWorldEquipment', () => {
  it('includes world-agnostic + matching-world items', () => {
    const e = getWorldEquipment('stargazers')
    expect(e.practice_dagger).toBeTruthy() // world-agnostic
    expect(e.starlit_blade).toBeTruthy() // stargazers-scoped
    expect(e.stargazer_seal).toBeTruthy()
  })

  it('excludes items scoped to a different world', () => {
    const e = getWorldEquipment('some_other_world')
    expect(e.practice_dagger).toBeTruthy() // agnostic kept
    expect(e.starlit_blade).toBeUndefined() // stargazers-only excluded
  })
})

describe('§28 rarity tags', () => {
  it('practice_dagger is common', () => {
    expect(EQUIPMENT_DEFS.practice_dagger.rarity).toBe('common')
  })

  it('uncommon items carry the correct rarity', () => {
    for (const id of ['starlit_blade', 'stargaze_cloak', 'astral_gem', 'mist_pouch', 'starsight_ring', 'comet_charm']) {
      expect(EQUIPMENT_DEFS[id].rarity, `${id} should be uncommon`).toBe('uncommon')
    }
  })

  it('rare quest items exist with valid affix shapes', () => {
    const compass = EQUIPMENT_DEFS.star_compass
    expect(compass.rarity).toBe('rare')
    expect(compass.affixes).toHaveLength(1)
    expect(compass.affixes![0]).toMatchObject({ kind: 'pctStat', stat: 'wis', pct: 0.1 })

    const seal = EQUIPMENT_DEFS.stargazer_seal
    expect(seal.rarity).toBe('rare')
    expect(seal.affixes![0]).toMatchObject({ kind: 'critBonus', pct: 5 })

    const canvas = EQUIPMENT_DEFS.astral_canvas
    expect(canvas.rarity).toBe('rare')
    expect(canvas.affixes![0]).toMatchObject({ kind: 'onCritHeal', amount: 14 })
  })

  it('du_xing_blade is a rare shop weapon with statusOnHit affix', () => {
    const blade = EQUIPMENT_DEFS.du_xing_blade
    expect(blade).toBeTruthy()
    expect(blade.rarity).toBe('rare')
    expect(blade.price).toBe(260)
    expect(blade.bonus.str).toBe(7)
    const affix = blade.affixes![0]
    expect(affix.kind).toBe('statusOnHit')
    if (affix.kind === 'statusOnHit') {
      expect(affix.status.kind).toBe('poison')
      expect(affix.status.rounds).toBe(2)
      expect(affix.status.chance).toBe(0.6)
    }
  })

  it('xingchen_crown is epic, quest-only, with two affixes', () => {
    const crown = EQUIPMENT_DEFS.xingchen_crown
    expect(crown).toBeTruthy()
    expect(crown.rarity).toBe('epic')
    expect(crown.price).toBeUndefined() // not purchasable
    expect(crown.bonus.wis).toBe(6)
    expect(crown.bonus.spr).toBe(4)
    expect(crown.affixes).toHaveLength(2)
    const [a0, a1] = crown.affixes!
    expect(a0).toMatchObject({ kind: 'pctStat', stat: 'spd', pct: 0.08 })
    expect(a1).toMatchObject({ kind: 'critBonus', pct: 4 })
  })
})

describe('Fantasy Traveler reality rewards', () => {
  it('金钱镖 is a piercing weapon with its audience-funded story', () => {
    const dart = EQUIPMENT_DEFS.money_dart
    expect(dart.slot).toBe('weapon')
    expect(dart.weaponKind).toBe('dart')
    expect(WEAPON_CATEGORY[dart.weaponKind!]).toBe('pierce')
    expect(dart.description).toBe('众筹来了第一把趁手的武器，上面印有一个“币”的字样。')
  })

  it('吉语钱 is an orange legendary trinket with its transformation story', () => {
    const coin = EQUIPMENT_DEFS.lucky_coin
    expect(coin.slot).toBe('trinket')
    expect(coin.rarity).toBe('legendary')
    expect(coin.description).toBe('其中一个金钱镖，突然发出金光，一声回响传入耳中“你币有了”。')
  })
})
