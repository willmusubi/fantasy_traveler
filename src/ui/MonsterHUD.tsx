import { Fragment } from 'react'
import { SKILL_DEFS, unlockedSkills } from '../companion/skills'
import type { CharResource, Character, ClassId, PartyBuff } from '../domain/types'
import { ctbRound, type CtbUnit } from '../game/combat'
import { effectiveStats } from '../game/effectiveStats'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { selectPlayer, useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { activeSynergiesFor } from '../world/relationships'
import { FIRST_WORLD_ID, WORLD_DEFS } from '../world/worlds'

// Placeholder battle sprites (emoji) until real pixel art lands. Player sprite is
// class-flavored; companions use a friendly face.
const CLASS_EMOJI: Record<ClassId, string> = {
  vanguard: '⚔️', guardian: '🛡️', striker: '🗡️', arcanist: '🔮', tactician: '📜', medic: '✨',
}

// Fallback names for buffs without a label (e.g. skill atk buffs).
const BUFF_KIND_LABEL: Record<PartyBuff['kind'], string> = {
  atkPct: '攻击', defPct: '防御', spdPct: '速度', magPct: '法术',
}

// Placeholder enemy sprite by a light keyword heuristic (until real art lands). For a
// canon antagonist we avoid the generic 👹 demon; only the no-quest "training" monster is 👹.
function enemyEmoji(name: string, inQuest: boolean): string {
  if (/保安|安保|守卫|警卫|护卫/.test(name)) return '👮'
  if (/收藏|大亨|富豪|老板|绅士/.test(name)) return '🎩'
  if (/掮客|黑帮|打手|拍卖|匪/.test(name)) return '🕴️'
  if (/雇佣兵|武装|士兵|兵/.test(name)) return '🥷'
  if (/假面|面具|神秘|幕后|影/.test(name)) return '🎭'
  return inQuest ? '🎭' : '👹'
}

function MiniBar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`mini-bar ${cls}`}>
      <div className="mini-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

function BattleSprite({ char, isPlayer, res, charge, plan }: { char: Character; isPlayer: boolean; res: CharResource; charge: number; plan?: string }) {
  const downed = res.hp <= 0
  const emoji = downed ? '💫' : isPlayer ? CLASS_EMOJI[char.classId] ?? '⚔️' : '🙂'
  return (
    <div className={`bsprite ${downed ? 'downed' : ''}`}>
      {!downed && plan && <div className="bsprite-action" title="这一回合的行动">{plan}</div>}
      <div className="bsprite-body" aria-hidden>{emoji}</div>
      <div className="bsprite-shadow" aria-hidden />
      <div className="bsprite-name">
        {char.name} <span className="bsprite-lv">Lv.{char.stats.level}</span>
      </div>
      <div className="bsprite-bars">
        <MiniBar value={res.hp} max={char.stats.maxHp} cls="hp" />
        <MiniBar value={res.mp} max={char.stats.maxMp} cls="mp" />
        <MiniBar value={Math.min(charge, 100)} max={100} cls="ct" />
      </div>
    </div>
  )
}

export function MonsterHUD() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const player = useGame(selectPlayer)
  const lastDamage = useGame((s) => s.lastDamage)
  const activeQuest = useGame((s) => s.activeQuest)
  const setRoundAction = useGame((s) => s.setRoundAction)
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
          {player && <BattleSprite char={player} isPlayer res={resourceOf(gs, player)} charge={gs.charge[player.id] ?? 0} plan={planLabel(player)} />}
          {partyCompanions.map((c) => (
            <BattleSprite key={c.id} char={c} isPlayer={false} res={resourceOf(gs, c)} charge={gs.charge[c.id] ?? 0} plan={planLabel(c)} />
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
          <div className="boss-hint">完成一个任务，按速度执行你为各角色排好的行动（技能消耗 MP）</div>
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

      {planParty.length > 0 && (
        <div className="plan-bar">
          <div className="plan-bar-head">排好各角色的行动，完成一个任务执行这一回合（技能消耗 MP）</div>
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
      )}
    </div>
  )
}
