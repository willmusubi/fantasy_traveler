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
  moonlit_dagger: {
    id: 'moonlit_dagger', nameKey: 'equip.moonlit_dagger', slot: 'weapon', worldId: 'cats_eye',
    bonus: { atk: 6, spd: 3 }, price: 180,
  },
  thief_cloak: {
    id: 'thief_cloak', nameKey: 'equip.thief_cloak', slot: 'armor', worldId: 'cats_eye',
    bonus: { def: 5, maxHp: 20 }, price: 150,
  },
  cats_eye_gem: {
    id: 'cats_eye_gem', nameKey: 'equip.cats_eye_gem', slot: 'trinket', worldId: 'cats_eye',
    bonus: { mag: 5, spd: 2 }, price: 160,
  },
  smoke_bomb_pouch: {
    id: 'smoke_bomb_pouch', nameKey: 'equip.smoke_bomb_pouch', slot: 'trinket', worldId: 'cats_eye',
    bonus: { spd: 4, atk: 2 }, price: 140,
  },
  // Cat's Eye canon items (quest loot — not sold).
  wanneng_decoder: {
    id: 'wanneng_decoder', nameKey: 'equip.wanneng_decoder', slot: 'trinket', worldId: 'cats_eye',
    bonus: { mag: 6, spd: 3 }, // 来生爱's all-purpose decoder
  },
  cats_eye_card: {
    id: 'cats_eye_card', nameKey: 'equip.cats_eye_card', slot: 'trinket', worldId: 'cats_eye',
    bonus: { atk: 4, spd: 4 }, // the signature calling card (予告状)
  },
  heinz_canvas: {
    id: 'heinz_canvas', nameKey: 'equip.heinz_canvas', slot: 'armor', worldId: 'cats_eye',
    bonus: { maxHp: 24, mag: 4 }, // a recovered Heinz painting — inspiration
  },
}

/** Equipment available in a given world (world-scoped + world-agnostic items). */
export function getWorldEquipment(worldId: WorldId): Record<string, EquipmentDef> {
  return Object.fromEntries(
    Object.entries(EQUIPMENT_DEFS).filter(([, e]) => !e.worldId || e.worldId === worldId),
  )
}
