// Inline turn picker: shown in the battle HUD (where the defaults panel used to sit) WHILE a round
// is resolving. The HUD already shows live enemy HP / party HP-MP / charge, so this is just the
// decision row for whoever's turn it is now — pick a target (when facing a team), then a skill, or
// ⚡全部自动 to finish with defaults.

import { useEffect } from 'react'
import { SKILL_DEFS, unlockedSkills } from '../companion/skills'
import { availableDuoSkills } from '../companion/duoSkills'
import { hasTalentPassive } from '../companion/talents'
import { COMPANION_DEFS } from '../companion/roster'
import { GUARD_ACTION, TAUNT_ACTION } from '../domain/config'
import type { SkillId } from '../domain/types'
import { autoTargetEnemy, livingEnemies } from '../game/combat'
import { hasStatus } from '../game/status'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

export function TurnPicker() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const affinities = useGame((s) => s.affinities)
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

  // Check if the acting member is silenced (skills locked).
  const isSilenced = decider
    ? hasStatus(gs.activeStatuses ?? {}, decider.id, 'silence')
    : false

  // IDs of companions currently on-field and alive (for duo availability check).
  const onFieldAliveCompanionIds: string[] = (gs?.partyIds ?? []).filter((id) => {
    const c = characters.find((ch) => ch.id === id)
    if (!c || c.kind !== 'companion') return false
    const r = gs ? resourceOf(gs, c) : null
    return r ? r.hp > 0 : true
  })

  // Single-target actions hit the chosen enemy; AoE skills ('allEnemies') ignore the pick and the
  // engine loops every living enemy.
  const choose = (choice: SkillId | 'basic' | typeof GUARD_ACTION | typeof TAUNT_ACTION) => {
    if (choice === GUARD_ACTION) {
      void advanceRound(GUARD_ACTION, undefined)
      return
    }
    if (choice === TAUNT_ACTION) {
      void advanceRound(TAUNT_ACTION, undefined)
      return
    }
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
          <button
            className={`skill-btn ${planned === GUARD_ACTION ? 'selected' : ''}`}
            title={`${decider.name}：防御姿态——本轮受击伤害减半`}
            onClick={() => choose(GUARD_ACTION)}
          >
            <span className="skill-btn-name">🛡防御</span>
            <span className="skill-btn-cost">MP0</span>
          </button>
          {hasTalentPassive(decider, gs?.learnedTalents, 'taunt') && (
            <button
              className={`skill-btn ${planned === TAUNT_ACTION ? 'selected' : ''}`}
              title={`${decider.name}：嘲讽——一回合内敌人优先攻击你`}
              onClick={() => choose(TAUNT_ACTION)}
            >
              <span className="skill-btn-name">🎯嘲讽</span>
              <span className="skill-btn-cost">MP0</span>
            </button>
          )}
          {isSilenced && (
            <span className="skill-btn-silence-hint" title="角色处于「沉默」状态，技能被封印，只能普攻或防御">
              🤐 沉默中，技能封印
            </span>
          )}
          {!isSilenced && unlockedSkills(decider).map((skill) => {
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
          {!isSilenced && availableDuoSkills(decider.id, onFieldAliveCompanionIds, affinities).map((duo) => {
            const partnerIdInPair = duo.pair[0] === decider.id ? duo.pair[1] : duo.pair[0]
            const partnerName = COMPANION_DEFS[partnerIdInPair]?.name ?? partnerIdInPair
            const partnerR = gs && characters.find((c) => c.id === partnerIdInPair)
              ? resourceOf(gs, characters.find((c) => c.id === partnerIdInPair)!)
              : null
            const partnerAffordable = partnerR ? partnerR.mp >= duo.mpCostEach : false
            const selfAffordable = r.mp >= duo.mpCostEach
            const affordable = selfAffordable && partnerAffordable
            return (
              <button
                key={duo.id}
                className={`skill-btn ${planned === duo.id ? 'selected' : ''}`}
                disabled={!affordable}
                title={`连携技：${duo.desc}`}
                onClick={() => choose(duo.id)}
              >
                <span className="skill-btn-name">🌟{t(duo.nameKey)} ✕{partnerName}</span>
                <span className="skill-btn-cost">MP{duo.mpCostEach}×2</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
