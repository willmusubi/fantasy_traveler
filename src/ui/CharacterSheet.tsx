import { rankForPoints } from '../companion/affinity'
import { COMPANION_DEFS, profileFor } from '../companion/roster'
import { allSkillsOf } from '../companion/skills'
import { canLearn, talentTreeFor } from '../companion/talents'
import { xpForLevel } from '../domain/config'
import type { Stats } from '../domain/types'
import { effectiveStats } from '../game/effectiveStats'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'
import { isDeepCombat, useSettings } from '../state/settingsStore'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { activeSynergiesFor } from '../world/relationships'
import { FullbodyArt } from './FullbodyArt'
import { Portrait } from './Portrait'

// §25 layered depth: simple mode keeps the 4 core stats; deep mode shows the full
// 10-stat sheet + derived 物攻/物防/魔攻/魔防 + element/weapon identity.
const SIMPLE_KEYS: (keyof Stats)[] = ['str', 'vit', 'spd', 'wis']
const DEEP_KEYS: (keyof Stats)[] = ['str', 'vit', 'wis', 'spr', 'spd', 'skl', 'hit', 'eva']

/** What each stat actually does in combat — surfaced as hover tooltips so the roles are
 *  discoverable in-game (not just numbers). */
const STAT_DESC: Record<string, string> = {
  str: '力量 · 物攻的来源：完成任务的普攻与物理技能伤害',
  vit: '耐久 · 物防的来源：按固定量抵消敌人的物理伤害（硬扛路线）',
  spd: '速度 · 驱动出手时间线（CTB）：越快越早出手，快得多还能在一回合内套圈多打几次（节奏路线）',
  wis: '智慧 · 魔攻的来源：治疗量与法系技能伤害',
  spr: '精神 · 魔防的来源：减轻敌人的法术伤害',
  skl: '技巧 · 暴击率：会心一击的概率',
  hit: '命中 · 攻击命中目标的概率',
  eva: '闪避 · 闪开敌人攻击的概率',
  maxHp: '生命 · 能承受的伤害上限',
  maxMp: '魔力 · 施放技能消耗的资源',
}

function Bar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0
  return (
    <div className={`sheet-bar ${cls}`}>
      <div className="sheet-bar-fill" style={{ width: `${pct}%` }} />
      <div className="sheet-bar-label">{value} / {max}</div>
    </div>
  )
}

export function CharacterSheet({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const affinity = useGame((s) => s.affinities[characterId])
  const learnTalent = useGame((s) => s.learnTalent)
  const deep = useSettings((s) => isDeepCombat(s.settings))
  const char = characters.find((c) => c.id === characterId)
  if (!gs || !char) return null
  const STAT_KEYS = deep ? DEEP_KEYS : SIMPLE_KEYS

  const res = resourceOf(gs, char)
  const partyCompanionIds = gs.partyIds.filter((id) => {
    const c = characters.find((ch) => ch.id === id)
    return c?.kind === 'companion'
  })
  const ctx = { ownedEquipment: gs.ownedEquipment, activeSynergies: activeSynergiesFor(partyCompanionIds) }
  const eff = effectiveStats(char, ctx)
  const base = char.stats
  const skills = allSkillsOf(char)
  const equipped = gs.ownedEquipment.filter((e) => e.equippedBy === char.id)
  const xpNeed = xpForLevel(base.level)
  const isCompanion = char.kind === 'companion'
  const rank = isCompanion ? rankForPoints(affinity?.points ?? 0, (affinity?.rank ?? 'none') !== 'none') : null
  const bio = COMPANION_DEFS[char.id]?.bio

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sheet-modal" onClick={(e) => e.stopPropagation()}>
        {isCompanion && (
          <div className="sheet-fullbody-wrap">
            <FullbodyArt portraitSet={char.portraitSet} name={char.name} />
          </div>
        )}
        <div className="sheet-head">
          <Portrait portraitSet={char.portraitSet} expression={char.persona?.defaultExpression ?? 'neutral'} name={char.name} />
          <div className="sheet-id">
            <div className="sheet-name">{char.name}</div>
            <div className="sheet-sub">
              {profileFor(char).role} · Lv.{base.level}
              {char.brand ? ` · 专属烙印「${char.brand}」` : ''}
            </div>
            {rank && (
              <div className="sheet-aff">羁绊 {t(`affinity.${rank}`)} · {affinity?.points ?? 0} 点</div>
            )}
          </div>
          <button className="sheet-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        <div className="sheet-vitals">
          <div className="sheet-vital" title={STAT_DESC.maxHp}>
            <span className="sheet-vital-k">HP</span>
            <Bar value={res.hp} max={eff.maxHp} cls="hp" />
          </div>
          <div className="sheet-vital" title={STAT_DESC.maxMp}>
            <span className="sheet-vital-k">MP</span>
            <Bar value={res.mp} max={eff.maxMp} cls="mp" />
          </div>
          <div className="sheet-vital" title="经验 · 累积到上限即升级，全属性提升">
            <span className="sheet-vital-k">EXP</span>
            <Bar value={base.xp} max={xpNeed} cls="xp" />
          </div>
        </div>

        <div className="sheet-stats">
          {STAT_KEYS.map((k) => {
            const delta = (eff[k] as number) - (base[k] as number)
            return (
              <div key={k} className="sheet-stat" title={STAT_DESC[k]}>
                <span className="sheet-stat-k">{t(`stat.${k}`)}</span>
                <span className="sheet-stat-v">
                  {eff[k]}
                  {delta > 0 && <span className="sheet-delta"> +{delta}</span>}
                </span>
              </div>
            )
          })}
        </div>

        {deep && (
          <>
            {/* §25 deep mode: derived combat values + identity badges. */}
            <div className="sheet-stats" style={{ marginTop: 6 }}>
              <div className="sheet-stat" title="物攻 = 有效力量（含武器/羁绊）">
                <span className="sheet-stat-k">{t('derived.patk')}</span>
                <span className="sheet-stat-v">{eff.str}</span>
              </div>
              <div className="sheet-stat" title="物防 = 有效耐久">
                <span className="sheet-stat-k">{t('derived.pdef')}</span>
                <span className="sheet-stat-v">{eff.vit}</span>
              </div>
              <div className="sheet-stat" title="魔攻 = 有效智慧（治疗与法术同源）">
                <span className="sheet-stat-k">{t('derived.matk')}</span>
                <span className="sheet-stat-v">{eff.wis}</span>
              </div>
              <div className="sheet-stat" title="魔防 = 有效精神">
                <span className="sheet-stat-k">{t('derived.mdef')}</span>
                <span className="sheet-stat-v">{eff.spr}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
              {profileFor(char).element && (
                <span className="reward-chip" title="五行属性（克制环：木→土→水→火→金→木）">
                  ☯ {t(`element.${profileFor(char).element}`)}
                </span>
              )}
              <span className="reward-chip" title="可用武器类别">
                ⚔{' '}
                {profileFor(char).weaponKinds === 'all'
                  ? '全武器（旅人特权）'
                  : (profileFor(char).weaponKinds as string[]).map((w) => t(`weapon.${w}`)).join('·')}
              </span>
            </div>
          </>
        )}

        {equipped.length > 0 && (
          <>
            <div className="gear-section-label">装备</div>
            <div className="sheet-gear">
              {equipped.map((e) => (
                <span key={e.instanceId} className="reward-chip">
                  {t(`slot.${EQUIPMENT_DEFS[e.defId]?.slot ?? 'trinket'}`)} · {t(EQUIPMENT_DEFS[e.defId]?.nameKey ?? e.defId)}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="gear-section-label">技能</div>
        <div className="sheet-skills">
          {skills.length === 0 && <div className="gear-empty">该角色暂无主动技能。</div>}
          {skills.map((s) => {
            const locked = base.level < s.unlockLevel
            return (
              <div key={s.id} className={`sheet-skill ${locked ? 'locked' : ''}`}>
                <div className="sheet-skill-head">
                  <span className="sheet-skill-name">{t(s.nameKey)}</span>
                  <span className="sheet-skill-cost">
                    {locked ? `Lv.${s.unlockLevel} 解锁` : `MP ${s.mpCost}${s.hpCost ? ` · HP ${s.hpCost}` : ''}`}
                  </span>
                </div>
                <div className="sheet-skill-desc">{s.desc}</div>
              </div>
            )
          })}
        </div>

        {(() => {
          const talentTree = talentTreeFor(char)
          if (talentTree.length === 0) return null
          const learned = gs.learnedTalents?.[char.id] ?? []
          const points = gs.talentPoints?.[char.id] ?? 0
          return (
            <>
              <div className="gear-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>天赋</span>
                <span className="talent-points-label">可用天赋点 {points}</span>
              </div>
              <div className="talent-tree">
                {talentTree.map((node) => {
                  const isLearned = learned.includes(node.id)
                  const isLearnable = !isLearned && canLearn(char, node.id, gs.learnedTalents, points) != null
                  const hasPrereq = node.requires ? learned.includes(node.requires) : true
                  const lockedReason = isLearned ? null
                    : !hasPrereq ? `需先习得「${talentTree.find((n) => n.id === node.requires)?.name ?? node.requires}」`
                    : points < node.cost ? `需 ${node.cost} 天赋点`
                    : null
                  return (
                    <div
                      key={node.id}
                      className={`talent-node ${isLearned ? 'learned' : isLearnable ? 'learnable' : 'locked'}`}
                      style={node.requires ? { marginLeft: 18 } : undefined}
                    >
                      <div className="talent-node-head">
                        <span className="talent-node-name">
                          {isLearned ? '✓ ' : ''}{node.name}
                        </span>
                        {!isLearned && isLearnable && (
                          <button
                            className="btn btn-ghost talent-learn-btn"
                            onClick={() => void learnTalent(char.id, node.id)}
                          >
                            习得（{node.cost}点）
                          </button>
                        )}
                        {!isLearned && !isLearnable && lockedReason && (
                          <span className="talent-locked-reason">{lockedReason}</span>
                        )}
                      </div>
                      <div className="talent-node-desc">{node.desc}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}

        {bio && (
          <>
            <div className="gear-section-label">简介</div>
            <p className="sheet-bio">{bio}</p>
          </>
        )}
      </div>
    </div>
  )
}
