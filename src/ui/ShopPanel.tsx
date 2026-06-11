import { WEAPON_CATEGORY, RARITY_META, STATUS_META } from '../domain/config'
import type { EquipAffix } from '../domain/types'
import type { EquipmentDef } from '../world/equipment'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { SHOP_POTIONS } from '../world/shop'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

function affixLines(affixes: EquipAffix[] | undefined): string[] {
  if (!affixes || affixes.length === 0) return []
  return affixes.map((a) => {
    if (a.kind === 'pctStat') return `+${Math.round(a.pct * 100)}% ${t(`stat.${a.stat}`)}`
    if (a.kind === 'onCritHeal') return `会心时回复 ${a.amount} HP`
    if (a.kind === 'statusOnHit') return `攻击附加「${STATUS_META[a.status.kind]?.label ?? a.status.kind}」`
    if (a.kind === 'critBonus') return `会心率 +${a.pct}%`
    return ''
  }).filter(Boolean)
}

function bonusText(def: EquipmentDef): string {
  const b = def.bonus
  const stats = (Object.keys(b) as (keyof typeof b)[]).map((k) => `${t(`stat.${k}`)}+${b[k]}`).join(' ')
  // §25 weapon identity: kind (类别) + optional 五行 — shown so weapon shopping is informed.
  const kind = def.weaponKind ? `【${t(`weapon.${def.weaponKind}`)}·${t(`phys.${WEAPON_CATEGORY[def.weaponKind]}`)}】` : ''
  const elem = def.element ? `〔${t(`element.${def.element}`)}〕` : ''
  return `${kind}${elem}${stats}`
}

export function ShopPanel() {
  const gold = useGame((s) => s.gameState?.gold ?? 0)
  const worldId = useGame((s) => s.gameState?.activeWorldId)
  const buyPotion = useGame((s) => s.buyPotion)
  const buyEquipment = useGame((s) => s.buyEquipment)

  const forSale = Object.values(EQUIPMENT_DEFS).filter(
    (e) => e.price != null && (!e.worldId || e.worldId === worldId),
  )

  return (
    <div className="panel">
      <div className="panel-title">
        <span>商店</span>
        <span className="shop-gold">🪙 {gold}</span>
      </div>

      <div className="gear-section-label">补给（立即对全队生效）</div>
      <div className="shop-list">
        {SHOP_POTIONS.map((p) => (
          <div key={p.id} className="shop-row">
            <div className="shop-info">
              <div className="shop-name">{p.name}</div>
              <div className="shop-desc">{p.desc}</div>
            </div>
            <button className="btn shop-buy" disabled={gold < p.price} onClick={() => void buyPotion(p.id)}>
              🪙 {p.price}
            </button>
          </div>
        ))}
      </div>

      <div className="gear-section-label">装备（购入后进背包）</div>
      <div className="shop-list">
        {forSale.length === 0 && <div className="gear-empty">这个世界暂无在售装备。</div>}
        {forSale.map((e) => {
          const rarity = e.rarity ?? 'common'
          const rarityMeta = RARITY_META[rarity]
          const affixes = affixLines(e.affixes)
          return (
            <div key={e.id} className="shop-row">
              <div className="shop-info">
                <div className="shop-name">
                  <span className={`rarity-${rarity}`}>{t(e.nameKey)}</span>
                  {rarity !== 'common' && <span className="rarity-chip">{rarityMeta.label}</span>}
                </div>
                <div className="shop-desc">{t(`slot.${e.slot}`)} · {bonusText(e)}</div>
                {affixes.map((line, i) => <div key={i} className="shop-affix">{line}</div>)}
              </div>
              <button className="btn shop-buy" disabled={gold < e.price!} onClick={() => void buyEquipment(e.id)}>
                🪙 {e.price}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
