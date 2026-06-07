import { rankForPoints } from '../companion/affinity'
import { COMPANION_DEFS } from '../companion/roster'
import { allSkillsOf } from '../companion/skills'
import { xpForLevel } from '../domain/config'
import type { Stats } from '../domain/types'
import { effectiveStats } from '../game/effectiveStats'
import { resourceOf } from '../game/resources'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { activeSynergiesFor } from '../world/relationships'
import { Portrait } from './Portrait'

const STAT_KEYS: (keyof Stats)[] = ['atk', 'def', 'spd', 'mag']

/** What each stat actually does in combat — surfaced as hover tooltips so the roles are
 *  discoverable in-game (not just numbers). */
const STAT_DESC: Record<string, string> = {
  atk: '攻击 · 完成任务的普攻、以及物理技能伤害的主来源',
  def: '防御 · 按固定量抵消敌人进攻 / 逾期造成的伤害（硬扛路线）',
  spd: '速度 · 驱动出手时间线（CTB）：越快越早出手，快得多还能在一回合内套圈多打几次（节奏路线）',
  mag: '法术 · 治疗量，以及法系攻击技能（如夜幕协奏）的伤害来源',
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
  const char = characters.find((c) => c.id === characterId)
  if (!gs || !char) return null

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
        <div className="sheet-head">
          <Portrait portraitSet={char.portraitSet} expression={char.persona?.defaultExpression ?? 'neutral'} name={char.name} />
          <div className="sheet-id">
            <div className="sheet-name">{char.name}</div>
            <div className="sheet-sub">
              {t(`class.${char.classId}`)} · Lv.{base.level}
              {char.kind === 'player' ? ' · 旅人' : ''}
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
