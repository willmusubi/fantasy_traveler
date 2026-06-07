import { useState } from 'react'
import type { Character, Stats } from '../domain/types'
import { effectiveStats } from '../game/effectiveStats'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'
import { activeSynergiesFor } from '../world/relationships'
import { EQUIPMENT_DEFS } from '../world/equipment'

const SHOWN: (keyof Stats)[] = ['maxHp', 'maxMp', 'atk', 'def', 'spd', 'mag']

function bonusText(defId: string): string {
  const b = EQUIPMENT_DEFS[defId]?.bonus ?? {}
  return (Object.keys(b) as (keyof typeof b)[])
    .map((k) => `${t(`stat.${k}`)}+${b[k]}`)
    .join(' ')
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
        {equipped.map((e) => (
          <div key={e.instanceId} className="gear-row">
            <span className="gear-slot">{t(`slot.${EQUIPMENT_DEFS[e.defId]?.slot ?? 'trinket'}`)}</span>
            <span className="gear-name">{t(EQUIPMENT_DEFS[e.defId]?.nameKey ?? e.defId)}</span>
            <span className="gear-bonus">{bonusText(e.defId)}</span>
            <button className="btn btn-ghost gear-btn" onClick={() => unequip(e.instanceId)}>卸下</button>
          </div>
        ))}
      </div>

      <div className="gear-section-label">背包</div>
      <div className="gear-list">
        {stash.length === 0 && <div className="gear-empty">背包是空的，去副本里夺取战利品吧</div>}
        {stash.map((e) => (
          <div key={e.instanceId} className="gear-row">
            <span className="gear-slot">{t(`slot.${EQUIPMENT_DEFS[e.defId]?.slot ?? 'trinket'}`)}</span>
            <span className="gear-name">{t(EQUIPMENT_DEFS[e.defId]?.nameKey ?? e.defId)}</span>
            <span className="gear-bonus">{bonusText(e.defId)}</span>
            <button className="btn gear-btn" onClick={() => equip(e.instanceId, selected.id)}>
              装备
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
