// The "默认行动" editor as a popup (was the always-on plan-bar in the HUD). Sets each member's
// default action — what the turn picker pre-selects and what ⚡全部自动 / off-screen completions use.

import { unlockedSkills } from '../companion/skills'
import type { Character } from '../domain/types'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { selectPlayer, useGame } from '../state/gameStore'
import { Modal } from './Modal'

export function DefaultActionsModal({ onClose }: { onClose: () => void }) {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const player = useGame(selectPlayer)
  const setRoundAction = useGame((s) => s.setRoundAction)
  if (!gs) return null

  const partyCompanions = gs.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => c != null && c.kind === 'companion')
  const planParty = [player, ...partyCompanions].filter((c): c is Character => Boolean(c))

  return (
    <Modal label="默认行动" onClose={onClose} className="plan-modal">
      <h2>⚙ 默认行动</h2>
      <p className="plan-modal-sub">出手时自动预选；「⚡ 全部自动」与不在战斗界面时按此执行（技能消耗 MP）</p>
      <div className="plan-bar">
        {planParty.map((c) => {
          const r = resourceOf(gs, c)
          const planned = gs.roundPlan[c.id]
          const skills = unlockedSkills(c)
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
