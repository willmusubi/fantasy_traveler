// Equipment catalog (static defs, like SKILL_DEFS). Bonuses apply as EFFECTIVE
// stats at combat time (see src/game/effectiveStats.ts) — never written onto a
// character's base stats. (§22)

import { LOCAL_PACK } from '../content/localPack'
import type { Element, Stats, WeaponKind, WorldId } from '../domain/types'

export type EquipSlot = 'weapon' | 'armor' | 'trinket'

export interface EquipmentDef {
  id: string
  nameKey: string
  slot: EquipSlot
  worldId?: WorldId
  /** Flat additive stat bonuses. A weapon's +str IS its attack power (§25). */
  bonus: Partial<Omit<Stats, 'level' | 'xp'>>
  /** §25 — weapons only: one of the 12 kinds; the physical category (斩/突/打/法)
   *  derives via WEAPON_CATEGORY. Absent → the wielder's profile default. */
  weaponKind?: WeaponKind
  /** §25 — optional 五行 carried by the weapon (overrides the wielder's innate). */
  element?: Element
  /** Shop price in gold. Omitted = not purchasable (quest-only loot). */
  price?: number
}

const DEFAULT_EQUIPMENT_DEFS: Record<string, EquipmentDef> = {
  practice_dagger: {
    id: 'practice_dagger', nameKey: 'equip.practice_dagger', slot: 'weapon',
    bonus: { str: 2 }, weaponKind: 'katana', price: 30,
  },
  starlit_blade: {
    id: 'starlit_blade', nameKey: 'equip.starlit_blade', slot: 'weapon', worldId: 'stargazers',
    bonus: { str: 6, spd: 3 }, weaponKind: 'sword', element: 'fire', price: 180, // 星火淬刃 — 克金
  },
  stargaze_cloak: {
    id: 'stargaze_cloak', nameKey: 'equip.stargaze_cloak', slot: 'armor', worldId: 'stargazers',
    bonus: { vit: 5, maxHp: 20 }, price: 150,
  },
  astral_gem: {
    id: 'astral_gem', nameKey: 'equip.astral_gem', slot: 'trinket', worldId: 'stargazers',
    bonus: { wis: 5, spd: 2 }, price: 160,
  },
  mist_pouch: {
    id: 'mist_pouch', nameKey: 'equip.mist_pouch', slot: 'trinket', worldId: 'stargazers',
    bonus: { spd: 4, str: 2 }, price: 140,
  },
  // §25 counterplay items: 命中 vs 真实Miss, 技巧 vs 暴击 build.
  starsight_ring: {
    id: 'starsight_ring', nameKey: 'equip.starsight_ring', slot: 'trinket', worldId: 'stargazers',
    bonus: { hit: 4, spd: 1 }, price: 120,
  },
  comet_charm: {
    id: 'comet_charm', nameKey: 'equip.comet_charm', slot: 'trinket', worldId: 'stargazers',
    bonus: { skl: 5 }, price: 170,
  },
  // 观星会 canon items (quest loot — not sold).
  star_compass: {
    id: 'star_compass', nameKey: 'equip.star_compass', slot: 'trinket', worldId: 'stargazers',
    bonus: { wis: 6, spd: 3 }, // 诺娃's all-purpose stargazing compass
  },
  stargazer_seal: {
    id: 'stargazer_seal', nameKey: 'equip.stargazer_seal', slot: 'trinket', worldId: 'stargazers',
    bonus: { str: 4, spd: 4 }, // the order's signature seal
  },
  astral_canvas: {
    id: 'astral_canvas', nameKey: 'equip.astral_canvas', slot: 'armor', worldId: 'stargazers',
    bonus: { maxHp: 24, wis: 4 }, // a recovered star-chart — inspiration
  },
}

/** The active equipment catalog — a local content pack (gitignored) overrides the shipped sample. */
export const EQUIPMENT_DEFS: Record<string, EquipmentDef> = LOCAL_PACK?.equipment ?? DEFAULT_EQUIPMENT_DEFS

/** Equipment available in a given world (world-scoped + world-agnostic items). */
export function getWorldEquipment(worldId: WorldId): Record<string, EquipmentDef> {
  return Object.fromEntries(
    Object.entries(EQUIPMENT_DEFS).filter(([, e]) => !e.worldId || e.worldId === worldId),
  )
}
