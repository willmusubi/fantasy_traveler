// Equipment catalog (static defs, like SKILL_DEFS). Bonuses apply as EFFECTIVE
// stats at combat time (see src/game/effectiveStats.ts) — never written onto a
// character's base stats. (§22)

import type { Stats, WorldId } from '../domain/types'

export type EquipSlot = 'weapon' | 'armor' | 'trinket'

export interface EquipmentDef {
  id: string
  nameKey: string
  slot: EquipSlot
  worldId?: WorldId
  /** Flat additive stat bonuses. */
  bonus: Partial<Omit<Stats, 'level' | 'xp'>>
  /** Shop price in gold. Omitted = not purchasable (quest-only loot). */
  price?: number
}

export const EQUIPMENT_DEFS: Record<string, EquipmentDef> = {
  practice_dagger: {
    id: 'practice_dagger', nameKey: 'equip.practice_dagger', slot: 'weapon',
    bonus: { atk: 2 }, price: 30,
  },
  starlit_blade: {
    id: 'starlit_blade', nameKey: 'equip.starlit_blade', slot: 'weapon', worldId: 'stargazers',
    bonus: { atk: 6, spd: 3 }, price: 180,
  },
  stargaze_cloak: {
    id: 'stargaze_cloak', nameKey: 'equip.stargaze_cloak', slot: 'armor', worldId: 'stargazers',
    bonus: { def: 5, maxHp: 20 }, price: 150,
  },
  astral_gem: {
    id: 'astral_gem', nameKey: 'equip.astral_gem', slot: 'trinket', worldId: 'stargazers',
    bonus: { mag: 5, spd: 2 }, price: 160,
  },
  mist_pouch: {
    id: 'mist_pouch', nameKey: 'equip.mist_pouch', slot: 'trinket', worldId: 'stargazers',
    bonus: { spd: 4, atk: 2 }, price: 140,
  },
  // 观星会 canon items (quest loot — not sold).
  star_compass: {
    id: 'star_compass', nameKey: 'equip.star_compass', slot: 'trinket', worldId: 'stargazers',
    bonus: { mag: 6, spd: 3 }, // 诺娃's all-purpose stargazing compass
  },
  stargazer_seal: {
    id: 'stargazer_seal', nameKey: 'equip.stargazer_seal', slot: 'trinket', worldId: 'stargazers',
    bonus: { atk: 4, spd: 4 }, // the order's signature seal
  },
  astral_canvas: {
    id: 'astral_canvas', nameKey: 'equip.astral_canvas', slot: 'armor', worldId: 'stargazers',
    bonus: { maxHp: 24, mag: 4 }, // a recovered star-chart — inspiration
  },
}

/** Equipment available in a given world (world-scoped + world-agnostic items). */
export function getWorldEquipment(worldId: WorldId): Record<string, EquipmentDef> {
  return Object.fromEntries(
    Object.entries(EQUIPMENT_DEFS).filter(([, e]) => !e.worldId || e.worldId === worldId),
  )
}
