// The "默认行动" editor as a popup (was the always-on plan-bar in the HUD). Sets each member's
// default action — what the turn picker pre-selects and what ⚡全部自动 / off-screen completions use.

import { unlockedSkills } from '../companion/skills'
import { availableDuoSkills } from '../companion/duoSkills'
import { hasTalentPassive } from '../companion/talents'
import { COMPANION_DEFS } from '../companion/roster'
import { GUARD_ACTION, TAUNT_ACTION } from '../domain/config'
import type { Character } from '../domain/types'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { selectPlayer, useGame } from '../state/gameStore'
import { Modal } from './Modal'

export function DefaultActionsModal({ onClose }: { onClose: () => void }) {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const affinities = useGame((s) => s.affinities)
  const player = useGame(selectPlayer)
  const setRoundAction = useGame((s) => s.setRoundAction)
  if (!gs) return null

  const partyCompanions = gs.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => c != null && c.kind === 'companion')
  const planParty = [player, ...partyCompanions].filter((c): c is Character => Boolean(c))

  // IDs of companions in the party (for duo availability).
  const onFieldCompanionIds = partyCompanions.map((c) => c.id)

  return (
    <Modal label="默认行动" onClose={onClose} className="plan-modal">
      <h2>⚙ 默认行动</h2>
      <p className="plan-modal-sub">出手时自动预选；「⚡ 全部自动」与不在战斗界面时按此执行（技能消耗 MP）</p>
      <div className="plan-bar">
        {planParty.map((c) => {
          const r = resourceOf(gs, c)
          const planned = gs.roundPlan[c.id]
          const skills = unlockedSkills(c)
          const duos = availableDuoSkills(c.id, onFieldCompanionIds, affinities)
          const hasTaunt = hasTalentPassive(c, gs.learnedTalents, 'taunt')
          return (
            <div className="plan-row" key={c.id}>
              <span className="plan-row-name">{c.name}</span>
              <button
                className={`skill-btn ${!planned ? 'selected' : ''}`}
                title={`${c.name}：普通攻击（不耗 MP）`}
                onClick={() => void setRoundAction(c.id, null)}
              >
                <span className="skill-btn-name">普攻</span>
                <span className="skill-btn-cost">MP0</span>
              </button>
              <button
                className={`skill-btn ${planned === GUARD_ACTION ? 'selected' : ''}`}
                title={`${c.name}：防御姿态——出手时受击伤害减半`}
                onClick={() => void setRoundAction(c.id, GUARD_ACTION)}
              >
                <span className="skill-btn-name">🛡防御</span>
                <span className="skill-btn-cost">MP0</span>
              </button>
              {hasTaunt && (
                <button
                  className={`skill-btn ${planned === TAUNT_ACTION ? 'selected' : ''}`}
                  title={`${c.name}：嘲讽——一回合内敌人优先攻击你`}
                  onClick={() => void setRoundAction(c.id, TAUNT_ACTION)}
                >
                  <span className="skill-btn-name">🎯嘲讽</span>
                  <span className="skill-btn-cost">MP0</span>
                </button>
              )}
              {skills.map((skill) => {
                const affordable = r.mp >= skill.mpCost && (!skill.hpCost || r.hp > skill.hpCost)
                return (
                  <button
                    key={skill.id}
                    className={`skill-btn ${planned === skill.id ? 'selected' : ''}`}
                    disabled={!affordable && planned !== skill.id}
                    title={`${c.name}：${skill.desc}`}
                    onClick={() => void setRoundAction(c.id, skill.id)}
                  >
                    <span className="skill-btn-name">{t(skill.nameKey)}</span>
                    <span className="skill-btn-cost">
                      MP{skill.mpCost}{skill.hpCost ? `·HP${skill.hpCost}` : ''}
                    </span>
                  </button>
                )
              })}
              {duos.map((duo) => {
                const partnerIdInPair = duo.pair[0] === c.id ? duo.pair[1] : duo.pair[0]
                const partnerName = COMPANION_DEFS[partnerIdInPair]?.name ?? partnerIdInPair
                const partnerChar = characters.find((ch) => ch.id === partnerIdInPair)
                const partnerR = partnerChar ? resourceOf(gs, partnerChar) : null
                const affordable = r.mp >= duo.mpCostEach && (partnerR ? partnerR.mp >= duo.mpCostEach : false)
                return (
                  <button
                    key={duo.id}
                    className={`skill-btn ${planned === duo.id ? 'selected' : ''}`}
                    disabled={!affordable && planned !== duo.id}
                    title={`连携技：${duo.desc}`}
                    onClick={() => void setRoundAction(c.id, duo.id)}
                  >
                    <span className="skill-btn-name">🌟{t(duo.nameKey)} ✕{partnerName}</span>
                    <span className="skill-btn-cost">MP{duo.mpCostEach}×2</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>完成</button>
      </div>
    </Modal>
  )
}
