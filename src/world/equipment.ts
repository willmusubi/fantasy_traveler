// Equipment catalog (static defs, like SKILL_DEFS). Bonuses apply as EFFECTIVE
// stats at combat time (see src/game/effectiveStats.ts) — never written onto a
// character's base stats. (§22)

import { LOCAL_PACK } from '../content/localPack'
import type { Element, EquipAffix, EquipRarity, Stats, WeaponKind, WorldId } from '../domain/types'

export type EquipSlot = 'weapon' | 'armor' | 'trinket'

export interface EquipmentDef {
  id: string
  nameKey: string
  /** Story copy shown in the equipment panel. */
  description?: string
  slot: EquipSlot
  worldId?: WorldId
  /** Flat additive stat bonuses. A weapon's +str IS its attack power (§25). */
  bonus: Partial<Omit<Stats, 'level' | 'xp'>>
  /** §25 — weapons only: one of the 12 kinds; the physical category (斩/刺/打/法)
   *  derives via WEAPON_CATEGORY. Absent → the wielder's profile default. */
  weaponKind?: WeaponKind
  /** §25 — optional 五行 carried by the weapon (overrides the wielder's innate). */
  element?: Element
  /** §28 — display tier + affix-budget convention. Missing = 'common'. */
  rarity?: EquipRarity
  /** §28 — special properties beyond flat bonuses (pct stats, crit-heal, status-on-hit…). */
  affixes?: EquipAffix[]
  /** Shop price in gold. Omitted = not purchasable (quest-only loot). */
  price?: number
}

/** System-owned rewards must exist even when a personal content pack replaces world equipment. */
const SYSTEM_EQUIPMENT_DEFS: Record<string, EquipmentDef> = {
  reality_hero_sword: {
    id: 'reality_hero_sword', nameKey: 'equip.reality_hero_sword', slot: 'weapon',
    bonus: { str: 10, spd: 3 }, weaponKind: 'sword', rarity: 'epic',
    affixes: [{ kind: 'critBonus', pct: 8 }],
  },
  money_dart: {
    id: 'money_dart', nameKey: 'equip.money_dart', slot: 'weapon',
    description: '众筹来了第一把趁手的武器，上面印有一个“币”的字样。',
    bonus: { str: 6, skl: 4 }, weaponKind: 'dart', rarity: 'rare',
  },
  lucky_coin: {
    id: 'lucky_coin', nameKey: 'equip.lucky_coin', slot: 'trinket',
    description: '其中一个金钱镖，突然发出金光，一声回响传入耳中“你币有了”。',
    bonus: { skl: 8, spd: 6 }, rarity: 'legendary',
    affixes: [{ kind: 'critBonus', pct: 10 }],
  },
}

const DEFAULT_EQUIPMENT_DEFS: Record<string, EquipmentDef> = {
  practice_dagger: {
    id: 'practice_dagger', nameKey: 'equip.practice_dagger', slot: 'weapon',
    bonus: { str: 2 }, weaponKind: 'sword', price: 30, rarity: 'common', // 匕首默认归剑 → 刺
  },
  starlit_blade: {
    id: 'starlit_blade', nameKey: 'equip.starlit_blade', slot: 'weapon', worldId: 'stargazers',
    bonus: { str: 6, spd: 3 }, weaponKind: 'sword', element: 'fire', price: 180, rarity: 'uncommon', // 星火淬刃 — 克金
  },
  stargaze_cloak: {
    id: 'stargaze_cloak', nameKey: 'equip.stargaze_cloak', slot: 'armor', worldId: 'stargazers',
    bonus: { vit: 5, maxHp: 20 }, price: 150, rarity: 'uncommon',
  },
  astral_gem: {
    id: 'astral_gem', nameKey: 'equip.astral_gem', slot: 'trinket', worldId: 'stargazers',
    bonus: { wis: 5, spd: 2 }, price: 160, rarity: 'uncommon',
  },
  mist_pouch: {
    id: 'mist_pouch', nameKey: 'equip.mist_pouch', slot: 'trinket', worldId: 'stargazers',
    bonus: { spd: 4, str: 2 }, price: 140, rarity: 'uncommon',
  },
  // §25 counterplay items: 命中 vs 真实Miss, 技巧 vs 暴击 build.
  starsight_ring: {
    id: 'starsight_ring', nameKey: 'equip.starsight_ring', slot: 'trinket', worldId: 'stargazers',
    bonus: { hit: 4, spd: 1 }, price: 120, rarity: 'uncommon',
  },
  comet_charm: {
    id: 'comet_charm', nameKey: 'equip.comet_charm', slot: 'trinket', worldId: 'stargazers',
    bonus: { skl: 5 }, price: 170, rarity: 'uncommon',
  },
  // 观星会 canon items (quest loot — not sold). §28: rare with tasteful affixes.
  star_compass: {
    id: 'star_compass', nameKey: 'equip.star_compass', slot: 'trinket', worldId: 'stargazers',
    bonus: { wis: 6, spd: 3 }, rarity: 'rare', // 诺娃's all-purpose stargazing compass
    affixes: [{ kind: 'pctStat', stat: 'wis', pct: 0.1 }],
  },
  stargazer_seal: {
    id: 'stargazer_seal', nameKey: 'equip.stargazer_seal', slot: 'trinket', worldId: 'stargazers',
    bonus: { str: 4, spd: 4 }, rarity: 'rare', // the order's signature seal
    affixes: [{ kind: 'critBonus', pct: 5 }],
  },
  astral_canvas: {
    id: 'astral_canvas', nameKey: 'equip.astral_canvas', slot: 'armor', worldId: 'stargazers',
    bonus: { maxHp: 24, wis: 4 }, rarity: 'rare', // a recovered star-chart — inspiration
    affixes: [{ kind: 'onCritHeal', amount: 14 }],
  },
  // §28 new items: rare shop weapon + epic quest-only trinket.
  du_xing_blade: {
    id: 'du_xing_blade', nameKey: 'equip.du_xing_blade', slot: 'weapon', worldId: 'stargazers',
    bonus: { str: 7 }, weaponKind: 'sword', price: 260, rarity: 'rare', // 淬星之刃 — shop weapon, poison-on-hit
    affixes: [{ kind: 'statusOnHit', status: { kind: 'poison', rounds: 2, chance: 0.6 } }],
  },
  xingchen_crown: {
    id: 'xingchen_crown', nameKey: 'equip.xingchen_crown', slot: 'trinket', worldId: 'stargazers',
    bonus: { wis: 6, spr: 4 }, rarity: 'epic', // 星辰冠冕 — epic quest-only trinket
    affixes: [{ kind: 'pctStat', stat: 'spd', pct: 0.08 }, { kind: 'critBonus', pct: 4 }],
  },
}

/** A local pack replaces world equipment; system-owned rewards remain available. */
export const EQUIPMENT_DEFS: Record<string, EquipmentDef> = {
  ...SYSTEM_EQUIPMENT_DEFS,
  ...(LOCAL_PACK?.equipment ?? DEFAULT_EQUIPMENT_DEFS),
}

/** Equipment available in a given world (world-scoped + world-agnostic items). */
export function getWorldEquipment(worldId: WorldId): Record<string, EquipmentDef> {
  return Object.fromEntries(
    Object.entries(EQUIPMENT_DEFS).filter(([, e]) => !e.worldId || e.worldId === worldId),
  )
}
