// Inline turn picker: shown in the battle HUD (where the defaults panel used to sit) WHILE a round
// is resolving. The HUD already shows live enemy HP / party HP-MP / charge, so this is just the
// decision row for whoever's turn it is now — pick a skill, or ⚡全部自动 to finish with defaults.

import { unlockedSkills } from '../companion/skills'
import type { SkillId } from '../domain/types'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

export function TurnPicker() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const advanceRound = useGame((s) => s.advanceRound)
  const autoResolveRound = useGame((s) => s.autoResolveRound)

  const ar = gs?.activeRound
  if (!gs || !ar) return null

  const actor = ar.order[ar.index]
  const decider = actor?.side === 'party' ? characters.find((c) => c.id === actor.id) : undefined
  const r = decider ? resourceOf(gs, decider) : undefined
  const planned = decider ? gs.roundPlan[decider.id] : undefined
  const choose = (choice: SkillId | 'basic') => void advanceRound(choice)

  return (
    <div className="turn-picker">
      <div className="turn-picker-head">
        <span className="tp-title">{decider ? <>轮到 <b>{decider.name}</b> 出手 · 选择行动</> : '结算中…'}</span>
        <button className="btn btn-ghost tp-auto" onClick={() => void autoResolveRound()} title="用每个角色的默认行动结算剩余出手">
          ⚡ 全部自动
        </button>
      </div>
      {decider && r && (
        <div className="plan-row">
          <span className="plan-row-name">{decider.name}</span>
          <button
            className={`skill-btn ${!planned ? 'selected' : ''}`}
            title={`${decider.name}：普通攻击（不耗 MP）`}
            onClick={() => choose('basic')}
          >
            <span className="skill-btn-name">普攻</span>
            <span className="skill-btn-cost">MP0</span>
          </button>
          {unlockedSkills(decider).map((skill) => {
            const affordable = r.mp >= skill.mpCost && (!skill.hpCost || r.hp > skill.hpCost)
            return (
              <button
                key={skill.id}
                className={`skill-btn ${planned === skill.id ? 'selected' : ''}`}
                disabled={!affordable}
                title={`${decider.name}：${skill.desc}`}
                onClick={() => choose(skill.id)}
              >
                <span className="skill-btn-name">{t(skill.nameKey)}</span>
                <span className="skill-btn-cost">
                  MP{skill.mpCost}{skill.hpCost ? `·HP${skill.hpCost}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
