// Shop catalog. Potions are the spendable-gold sink for the active-combat loop;
// equipment for sale is sourced from EQUIPMENT_DEFS that carry a `price`.

export interface PotionDef {
  id: string
  name: string
  desc: string
  price: number
  /** Applied to every on-field party member on purchase. */
  effect: { hp?: number; mp?: number; revive?: boolean }
}

export const SHOP_POTIONS: PotionDef[] = [
  { id: 'hp_potion', name: 'HP 药水', desc: '全队恢复 80 HP', price: 50, effect: { hp: 80 } },
  { id: 'mp_potion', name: 'MP 药水', desc: '全队恢复 50 MP', price: 40, effect: { mp: 50 } },
  { id: 'revive_tonic', name: '复苏灵药', desc: '唤醒所有倒下的伙伴并恢复至半血', price: 120, effect: { revive: true } },
]
