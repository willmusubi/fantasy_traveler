import { Fragment, useState } from 'react'
import { SKILL_DEFS } from '../companion/skills'
import type { Character, PartyBuff } from '../domain/types'
import { ctbRound, type CtbUnit } from '../game/combat'
import { effectiveStats } from '../game/effectiveStats'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { selectPlayer, useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { activeSynergiesFor } from '../world/relationships'
import { FIRST_WORLD_ID, WORLD_DEFS } from '../world/worlds'
import { BattleSprite, CLASS_EMOJI, enemyEmoji } from './battleSprites'
import { DefaultActionsModal } from './DefaultActionsModal'
import { TurnPicker } from './TurnPicker'

// Fallback names for buffs without a label (e.g. skill atk buffs).
const BUFF_KIND_LABEL: Record<PartyBuff['kind'], string> = {
  atkPct: '攻击', defPct: '防御', spdPct: '速度', magPct: '法术',
}

export function MonsterHUD() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const player = useGame(selectPlayer)
  const lastDamage = useGame((s) => s.lastDamage)
  const activeQuest = useGame((s) => s.activeQuest)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const questStatus = useQuest((s) => s.status)
  const startQuest = useQuest((s) => s.startQuest)
  if (!gs) return null

  const activeWorldId = gs.activeWorldId ?? FIRST_WORLD_ID
  const world = WORLD_DEFS[activeWorldId]
  const generating = questStatus === 'generating'
  const monster = gs.monster
  const partyCompanions = gs.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => c != null && c.kind === 'companion')

  // Whose first turn it is right now (drives the sprite highlight + the inline TurnPicker).
  const arActor = gs.activeRound ? gs.activeRound.order[gs.activeRound.index] : undefined
  const activeId = arActor?.side === 'party' ? arActor.id : undefined

  const pct = Math.max(0, Math.round((monster.hp / monster.maxHp) * 100))
  const low = pct <= 30
  const encounter = activeQuest?.encounters[gs.encounterIndex]
  const title = activeQuest ? activeQuest.title : '心魔讨伐'
  const subtitle = activeQuest
    ? `第 ${gs.encounterIndex + 1}/${activeQuest.encounters.length} 关`
    : `第 ${gs.storyStage + 1} 阶段`
  const bossName = monster.displayName ?? t(monster.nameKey)

  // Turn-order forecast, Octopath-style: run ctbRound TWICE (the very function task-completion
  // resolves with) to preview THIS round then the NEXT — exact, enemies included. 1 round = 1 task.
  const partyForOrder = [player, ...partyCompanions].filter((c): c is Character => Boolean(c))
  const turnCtx = { ownedEquipment: gs.ownedEquipment, activeSynergies: activeSynergiesFor(partyCompanions.map((c) => c.id)), partyBuffs: gs.partyBuffs }
  const livingForOrder = partyForOrder.filter((c) => resourceOf(gs, c).hp > 0)
  const ctbUnits: CtbUnit[] = [
    ...(livingForOrder.length ? livingForOrder : partyForOrder).map((c) => ({
      side: 'party' as const, id: c.id, spd: effectiveStats(c, turnCtx).spd, charge: gs.charge[c.id] ?? 0,
    })),
    { side: 'enemy' as const, id: monster.id, spd: monster.spd, charge: gs.charge[monster.id] ?? 0 },
  ]
  const round1 = ctbRound(ctbUnits)
  const round2 = ctbRound(ctbUnits.map((u) => ({ ...u, charge: round1.charges[u.id] ?? 0 })))
  const turnSlots = [
    ...round1.order.map((a) => ({ a, round: 0 })),
    ...round2.order.map((a) => ({ a, round: 1 })),
  ]
  const nextRoundStart = round1.order.length // index in turnSlots where the next round begins
  // The living party members you assign actions to this round (player + on-field companions).
  const planParty = livingForOrder.length ? livingForOrder : partyForOrder
  // Each living member's planned action, shown as a badge above its battle sprite (Octopath-style).
  const planLabel = (c: Character): string => {
    const id = gs.roundPlan[c.id]
    const def = id ? SKILL_DEFS[id] : undefined
    return def ? t(def.nameKey) : '⚔ 普攻'
  }

  return (
    <div className="panel battle-stage">
      <div className="panel-title">
        <span>{title}</span>
        <span>{subtitle}</span>
      </div>

      <div className="stage-scene">
        <div className="stage-sky" aria-hidden />
        <div className="stage-ground" aria-hidden />

        <div className="party-side">
          {player && <BattleSprite char={player} isPlayer res={resourceOf(gs, player)} charge={gs.charge[player.id] ?? 0} plan={gs.activeRound ? undefined : planLabel(player)} active={activeId === player.id} />}
          {partyCompanions.map((c) => (
            <BattleSprite key={c.id} char={c} isPlayer={false} res={resourceOf(gs, c)} charge={gs.charge[c.id] ?? 0} plan={gs.activeRound ? undefined : planLabel(c)} active={activeId === c.id} />
          ))}
        </div>

        <div className="enemy-side">
          <div className={`monster-sprite ${low ? 'low' : ''}`} aria-hidden>
            {enemyEmoji(bossName, Boolean(activeQuest))}
          </div>
          <div className="monster-shadow" aria-hidden />
          {lastDamage && (
            <div className="float" key={lastDamage.key}>-{lastDamage.amount}</div>
          )}
        </div>
      </div>

      {encounter?.narrationIntro && <div className="stage-narration">{encounter.narrationIntro}</div>}

      <div className="turn-bar" aria-label="出手顺序">
        <span className="turn-bar-label">出手</span>
        {turnSlots.map((slot, idx) => {
          const { a, round } = slot
          const isEnemy = a.side === 'enemy'
          const c = isEnemy ? undefined : partyForOrder.find((x) => x.id === a.id)
          const lap = turnSlots.slice(0, idx).some((s) => s.round === round && s.a.id === a.id && s.a.side === a.side)
          const current = idx === 0
          const firstOfNext = idx === nextRoundStart
          const emoji = isEnemy ? enemyEmoji(bossName, Boolean(activeQuest)) : c?.kind === 'player' ? CLASS_EMOJI[c.classId] ?? '⚔️' : '🙂'
          const name = isEnemy ? bossName : c?.name ?? ''
          return (
            <Fragment key={idx}>
              {firstOfNext && <span className="turn-round-sep" aria-hidden>┊ 下一回合</span>}
              {idx > 0 && !firstOfNext && <span className="turn-arrow" aria-hidden>›</span>}
              <span className={`turn-chip ${isEnemy ? 'enemy' : 'ally'} ${lap ? 'lap' : ''} ${current ? 'current' : ''} ${round === 1 ? 'next-round' : ''}`} title={current ? `${name}（轮到出手）` : lap ? `${name}（连击）` : name}>
                <span className="turn-emoji" aria-hidden>{emoji}</span>
                <span className="turn-cname">{name}{lap ? ' ·连击' : ''}</span>
              </span>
            </Fragment>
          )
        })}
      </div>

      {gs.partyBuffs.length > 0 && (
        <div className="buff-band" aria-label="增益与减益">
          {gs.partyBuffs.map((b) => {
            const debuff = b.magnitude < 0
            const pct = Math.round(Math.abs(b.magnitude) * 100)
            const name = b.label ?? BUFF_KIND_LABEL[b.kind]
            return (
              <span key={b.id} className={`buff-badge ${debuff ? 'debuff' : ''}`} title={b.untilVictory ? '持续到下一场战斗胜利' : '战斗增益'}>
                {name} {debuff ? '−' : '+'}{pct}%
              </span>
            )
          })}
        </div>
      )}

      <div className="boss-bar">
        <div className="boss-bar-head">
          <span className="boss-name">{bossName}</span>
          <span className="boss-lv">Lv.{monster.level}</span>
        </div>
        <div className="hpbar">
          <div className={`hpbar-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
          <div className="hpbar-label">{monster.hp} / {monster.maxHp}</div>
        </div>
        {activeQuest ? (
          <div className="boss-hint">完成一个任务，按出手顺序逐个角色选择行动（技能消耗 MP）</div>
        ) : (
          <div className="stage-cta-wrap">
            <span className="stage-cta-hint">
              这是练手的拖延心魔。开启「{world?.name ?? '剧情'}」副本，面对真正的对手、夺取专属战利品。
            </span>
            <button
              className="btn btn-primary stage-cta"
              disabled={generating}
              onClick={() => void startQuest(activeWorldId)}
            >
              {generating ? '正在展开剧情…' : '⚔ 开启剧情副本'}
            </button>
          </div>
        )}
      </div>

      {gs.activeRound ? (
        <TurnPicker />
      ) : (
        planParty.length > 0 && (
          <div className="plan-defaults">
            <button className="btn btn-ghost" onClick={() => setDefaultsOpen(true)}>⚙ 默认行动</button>
            <span className="plan-defaults-hint">设置「⚡ 全部自动」与离开战斗界面时各角色的预设行动</span>
          </div>
        )
      )}
      {defaultsOpen && <DefaultActionsModal onClose={() => setDefaultsOpen(false)} />}
    </div>
  )
}
