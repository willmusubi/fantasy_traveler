import { useState } from 'react'
import { COMPANION_DEFS } from '../companion/roster'
import type { Character, GameState } from '../domain/types'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { selectPlayer, useGame } from '../state/gameStore'
import { activeSynergiesFor } from '../world/relationships'
import { CharacterSheet } from './CharacterSheet'

const MAX_PARTY = 6

function nameOf(id: string, characters: Character[]): string {
  return characters.find((c) => c.id === id)?.name ?? COMPANION_DEFS[id]?.name ?? id
}

/** At-a-glance vitals: level + current/max HP and MP. */
function Vitals({ c, gs }: { c: Character | undefined; gs: GameState }) {
  if (!c) return null
  const s = c.stats
  const r = resourceOf(gs, c)
  return (
    <span className="party-vitals">
      <span className="lv">Lv.{s.level}</span> · <span className="hp">HP {r.hp}/{s.maxHp}</span> ·{' '}
      <span className="mp">MP {r.mp}/{s.maxMp}</span>
    </span>
  )
}

export function PartyPanel() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const player = useGame(selectPlayer)
  const setParty = useGame((s) => s.setParty)
  const [sheetId, setSheetId] = useState<string | null>(null)
  if (!gs || !player) return null

  const partyCompanionIds = gs.partyIds.filter((id) => id !== player.id)
  const benchIds = gs.unlockedCompanionIds.filter((id) => !partyCompanionIds.includes(id))
  const synergies = activeSynergiesFor(partyCompanionIds)
  const full = gs.partyIds.length >= MAX_PARTY

  const add = (id: string) => setParty([...partyCompanionIds, id])
  const remove = (id: string) => setParty(partyCompanionIds.filter((x) => x !== id))

  return (
    <div className="panel">
      <div className="panel-title">
        <span>队伍</span>
        <span>{gs.partyIds.length}/{MAX_PARTY}</span>
      </div>

      <div className="party-list">
        <div className="party-row">
          <button type="button" className="party-id" onClick={() => setSheetId(player.id)} title="查看资料">
            <span className="party-name">{player.name}</span>
            <Vitals c={player} gs={gs} />
          </button>
          <span className="party-tag">旅人</span>
        </div>
        {partyCompanionIds.map((id) => (
          <div key={id} className="party-row">
            <button type="button" className="party-id" onClick={() => setSheetId(id)} title="查看资料">
              <span className="party-name">{nameOf(id, characters)}</span>
              <Vitals c={characters.find((c) => c.id === id)} gs={gs} />
            </button>
            <button className="btn btn-ghost party-btn" onClick={() => remove(id)}>移出</button>
          </div>
        ))}
      </div>

      {synergies.length > 0 && (
        <div className="synergy-badges">
          {synergies.map((s) => (
            <span key={s.id} className="synergy-badge" title={s.requires.map((id) => nameOf(id, characters)).join(' + ')}>
              ✦ {t(s.labelKey)}
            </span>
          ))}
        </div>
      )}

      <div className="gear-section-label">候补</div>
      <div className="party-list">
        {benchIds.length === 0 && <div className="gear-empty">通过剧情副本招募更多伙伴</div>}
        {benchIds.map((id) => (
          <div key={id} className="party-row">
            <button type="button" className="party-id" onClick={() => setSheetId(id)} title="查看资料">
              <span className="party-name">{nameOf(id, characters)}</span>
              <Vitals c={characters.find((c) => c.id === id)} gs={gs} />
            </button>
            <button className="btn party-btn" disabled={full} onClick={() => add(id)}>
              {full ? '队伍已满' : '加入'}
            </button>
          </div>
        ))}
      </div>

      {sheetId && <CharacterSheet characterId={sheetId} onClose={() => setSheetId(null)} />}
    </div>
  )
}
