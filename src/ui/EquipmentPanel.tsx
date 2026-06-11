import { useState } from 'react'
import { WEAPON_CATEGORY, RARITY_META, STATUS_META } from '../domain/config'
import type { Character, EquipAffix, Stats } from '../domain/types'
import { effectiveStats } from '../game/effectiveStats'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'
import { activeSynergiesFor } from '../world/relationships'
import { EQUIPMENT_DEFS } from '../world/equipment'

const SHOWN: (keyof Stats)[] = ['maxHp', 'maxMp', 'str', 'vit', 'wis', 'spr', 'spd', 'skl', 'hit', 'eva']

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

function bonusText(defId: string): string {
  const def = EQUIPMENT_DEFS[defId]
  const b = def?.bonus ?? {}
  const stats = (Object.keys(b) as (keyof typeof b)[])
    .map((k) => `${t(`stat.${k}`)}+${b[k]}`)
    .join(' ')
  const kind = def?.weaponKind ? `【${t(`weapon.${def.weaponKind}`)}·${t(`phys.${WEAPON_CATEGORY[def.weaponKind]}`)}】` : ''
  const elem = def?.element ? `〔${t(`element.${def.element}`)}〕` : ''
  return `${kind}${elem}${stats}`
}

export function EquipmentPanel() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const equip = useGame((s) => s.equip)
  const unequip = useGame((s) => s.unequip)
  const [selId, setSelId] = useState<string | null>(null)
  if (!gs) return null

  const party = gs.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c))
  const selected = party.find((c) => c.id === selId) ?? party[0]
  if (!selected) return null

  const companionIds = party.filter((c) => c.kind === 'companion').map((c) => c.id)
  const ctx = { ownedEquipment: gs.ownedEquipment, activeSynergies: activeSynergiesFor(companionIds) }
  const eff = effectiveStats(selected, ctx)
  const base = selected.stats

  const equipped = gs.ownedEquipment.filter((e) => e.equippedBy === selected.id)
  const stash = gs.ownedEquipment.filter((e) => !e.equippedBy)

  return (
    <div className="panel">
      <div className="panel-title"><span>装备</span></div>

      <div className="member-pills">
        {party.map((c) => (
          <button
            key={c.id}
            className={`pill ${c.id === selected.id ? 'on' : ''}`}
            onClick={() => setSelId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="gear-stats">
        {SHOWN.map((k) => {
          const delta = eff[k] - base[k]
          return (
            <div key={k} className="gear-stat">
              <span className="gear-stat-label">{t(`stat.${k}`)}</span>
              <span className="gear-stat-val">
                {eff[k]}
                {delta > 0 && <span className="gear-delta"> +{delta}</span>}
              </span>
            </div>
          )
        })}
      </div>

      <div className="gear-section-label">已装备</div>
      <div className="gear-list">
        {equipped.length === 0 && <div className="gear-empty">还没有装备</div>}
        {equipped.map((e) => {
          const def = EQUIPMENT_DEFS[e.defId]
          const rarity = def?.rarity ?? 'common'
          const rarityMeta = RARITY_META[rarity]
          const affixes = affixLines(def?.affixes)
          return (
            <div key={e.instanceId} className="gear-row">
              <span className="gear-slot">{t(`slot.${def?.slot ?? 'trinket'}`)}</span>
              <span className={`gear-name rarity-${rarity}`}>
                {t(def?.nameKey ?? e.defId)}
                {rarity !== 'common' && <span className="rarity-chip">{rarityMeta.label}</span>}
              </span>
              <span className="gear-bonus">{bonusText(e.defId)}</span>
              {affixes.map((line, i) => <span key={i} className="gear-affix">{line}</span>)}
              <button className="btn btn-ghost gear-btn" onClick={() => unequip(e.instanceId)}>卸下</button>
            </div>
          )
        })}
      </div>

      <div className="gear-section-label">背包</div>
      <div className="gear-list">
        {stash.length === 0 && <div className="gear-empty">背包是空的，去副本里夺取战利品吧</div>}
        {stash.map((e) => {
          const def = EQUIPMENT_DEFS[e.defId]
          const rarity = def?.rarity ?? 'common'
          const rarityMeta = RARITY_META[rarity]
          const affixes = affixLines(def?.affixes)
          return (
            <div key={e.instanceId} className="gear-row">
              <span className="gear-slot">{t(`slot.${def?.slot ?? 'trinket'}`)}</span>
              <span className={`gear-name rarity-${rarity}`}>
                {t(def?.nameKey ?? e.defId)}
                {rarity !== 'common' && <span className="rarity-chip">{rarityMeta.label}</span>}
              </span>
              <span className="gear-bonus">{bonusText(e.defId)}</span>
              {affixes.map((line, i) => <span key={i} className="gear-affix">{line}</span>)}
              <button className="btn gear-btn" onClick={() => equip(e.instanceId, selected.id)}>
                装备
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
