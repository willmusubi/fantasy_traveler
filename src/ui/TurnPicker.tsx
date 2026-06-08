// Inline turn picker: shown in the battle HUD (where the defaults panel used to sit) WHILE a round
// is resolving. The HUD already shows live enemy HP / party HP-MP / charge, so this is just the
// decision row for whoever's turn it is now — pick a target (when facing a team), then a skill, or
// ⚡全部自动 to finish with defaults.

import { useEffect } from 'react'
import { SKILL_DEFS, unlockedSkills } from '../companion/skills'
import type { SkillId } from '../domain/types'
import { autoTargetEnemy, livingEnemies } from '../game/combat'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

export function TurnPicker() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const advanceRound = useGame((s) => s.advanceRound)
  const autoResolveRound = useGame((s) => s.autoResolveRound)
  const combatTargetId = useGame((s) => s.combatTargetId)
  const setCombatTarget = useGame((s) => s.setCombatTarget)

  const ar = gs?.activeRound
  const actorIndex = ar?.index
  const enemies = gs?.enemies ?? []
  const autoTarget = autoTargetEnemy(enemies)

  // Pre-select the smart auto-target (lowest-HP living enemy) whenever the deciding turn changes;
  // the player can override by clicking an enemy (here or on its HUD card).
  useEffect(() => {
    setCombatTarget(autoTarget?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorIndex])

  if (!gs || !ar) return null

  const actor = ar.order[ar.index]
  const decider = actor?.side === 'party' ? characters.find((c) => c.id === actor.id) : undefined
  const r = decider ? resourceOf(gs, decider) : undefined
  const planned = decider ? gs.roundPlan[decider.id] : undefined

  const living = livingEnemies(enemies)
  const pickedAlive = combatTargetId ? living.find((m) => m.id === combatTargetId) : undefined
  const targetId = (pickedAlive ?? autoTarget)?.id

  // Single-target actions hit the chosen enemy; AoE skills ('allEnemies') ignore the pick and the
  // engine loops every living enemy.
  const choose = (choice: SkillId | 'basic') => {
    const aoe = choice !== 'basic' && SKILL_DEFS[choice]?.target === 'allEnemies'
    void advanceRound(choice, aoe ? undefined : targetId)
  }

  return (
    <div className="turn-picker">
      <div className="turn-picker-head">
        <span className="tp-title">{decider ? <>轮到 <b>{decider.name}</b> 出手 · 选择行动</> : '结算中…'}</span>
        <button className="btn btn-ghost tp-auto" onClick={() => void autoResolveRound()} title="用每个角色的默认行动结算剩余出手">
          ⚡ 全部自动
        </button>
      </div>
      {decider && living.length > 1 && (
        <div className="target-row" aria-label="选择目标">
          <span className="target-row-label">目标</span>
          {living.map((m) => {
            const name = m.displayName ?? t(m.nameKey)
            return (
              <button
                key={m.id}
                className={`target-btn ${targetId === m.id ? 'selected' : ''}`}
                onClick={() => setCombatTarget(m.id)}
                title={`攻击 ${name}（剩 ${m.hp}）`}
              >
                <span className="target-btn-name">{name}</span>
                <span className="target-btn-hp">{m.hp}</span>
              </button>
            )
          })}
        </div>
      )}
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
