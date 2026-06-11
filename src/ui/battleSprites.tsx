// Shared battle-sprite primitives, used by both the always-on MonsterHUD and the interactive
// RoundResolver overlay. A party sprite prefers real art (a pixel sprite at /sprites/<set>.png, or
// the HD head-crop as a gold-framed combat token) and falls back to a placeholder emoji — so the
// public emoji cast still works, and dropping in art upgrades the stage with no code change.

import { useState } from 'react'
import { STATUS_META } from '../domain/config'
import type { CharResource, Character, ClassId, CombatStatus, Monster } from '../domain/types'
import { t } from '../i18n'

// Player sprite is class-flavored; companions use a friendly face.
export const CLASS_EMOJI: Record<ClassId, string> = {
  vanguard: '⚔️', guardian: '🛡️', striker: '🗡️', arcanist: '🔮', tactician: '📜', medic: '✨',
}

// Placeholder enemy sprite by a light keyword heuristic (until real art lands). For a canon
// antagonist we avoid the generic 👹 demon; only the no-quest "training" monster is 👹.
export function enemyEmoji(name: string, inQuest: boolean): string {
  if (/保安|安保|守卫|警卫|护卫/.test(name)) return '👮'
  if (/收藏|大亨|富豪|老板|绅士/.test(name)) return '🎩'
  if (/掮客|黑帮|打手|拍卖|匪/.test(name)) return '🕴️'
  if (/雇佣兵|武装|士兵|兵/.test(name)) return '🥷'
  if (/假面|面具|神秘|幕后|影/.test(name)) return '🎭'
  return inQuest ? '🎭' : '👹'
}

export function MiniBar({ value, max, cls, title }: { value: number; max: number; cls: string; title?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`mini-bar ${cls}`} title={title}>
      <div className="mini-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Tiny round face for turn-order chips: the head-crop art, falling back to the same emoji the
 *  stage sprite uses — so the chip and the sprite always read as the same character. */
export function TurnFace({ char }: { char: Character }) {
  const [failed, setFailed] = useState(false)
  const fallback = char.kind === 'player' ? CLASS_EMOJI[char.classId] ?? '⚔️' : '🙂'
  if (failed) return <span className="turn-emoji" aria-hidden>{fallback}</span>
  return (
    <img
      className="turn-face"
      src={`/portraits/heads/${char.portraitSet}.png`}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function BattleSprite({
  char,
  isPlayer,
  res,
  charge,
  plan,
  active,
  statuses,
  deep,
}: {
  char: Character
  isPlayer: boolean
  res: CharResource
  charge: number
  plan?: string
  /** Highlight this sprite as the one currently choosing an action (RoundResolver). */
  active?: boolean
  /** Active status effects on this character. */
  statuses?: CombatStatus[]
  /** Deep combat mode: show the inline HP numbers under the bars. */
  deep?: boolean
}) {
  const downed = res.hp <= 0
  const emoji = downed ? '💫' : isPlayer ? CLASS_EMOJI[char.classId] ?? '⚔️' : '🙂'
  // Real battle art if present (drop a pixel sprite at /sprites/<set>.png), else the HD head-crop as
  // a gold-framed token, else the emoji. onError walks the chain down on a missing file.
  const candidates = downed ? [] : [`/sprites/${char.portraitSet}.png`, `/portraits/heads/${char.portraitSet}.png`]
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const artSrc = candidates.find((c) => !failed.has(c))
  return (
    <div className={`bsprite ${downed ? 'downed' : ''} ${active ? 'acting' : ''}`} data-fx-anchor={char.id}>
      {!downed && plan && <div className="bsprite-action" title="这一回合的行动">{plan}</div>}
      {artSrc ? (
        <div className="bsprite-body has-art" aria-hidden>
          <img
            className="bsprite-art"
            src={artSrc}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailed((prev) => new Set(prev).add(artSrc))}
          />
        </div>
      ) : (
        <div className="bsprite-body" aria-hidden>{emoji}</div>
      )}
      {/* The ground-contact shadow only makes sense under a free-standing emoji; the framed
          art token is a floating card, so it carries no shadow. */}
      {!artSrc && <div className="bsprite-shadow" aria-hidden />}
      <div className="bsprite-name">
        {char.name} <span className="bsprite-lv">Lv.{char.stats.level}</span>
      </div>
      <div className="bsprite-bars">
        <MiniBar value={res.hp} max={char.stats.maxHp} cls="hp" title={`HP ${res.hp}/${char.stats.maxHp}`} />
        <MiniBar value={res.mp} max={char.stats.maxMp} cls="mp" title={`MP ${res.mp}/${char.stats.maxMp}`} />
        <MiniBar value={Math.min(charge, 100)} max={100} cls="ct" title={`充能 ${Math.round(Math.min(charge, 100))}%（满 100% 本回合连击）`} />
      </div>
      {deep && !downed && (
        <div className="bsprite-hp-label" aria-hidden>{res.hp}/{char.stats.maxHp}</div>
      )}
      {statuses && statuses.length > 0 && (
        <div className="status-chip-row" aria-label="状态">
          {statuses.map((s) => {
            const meta = STATUS_META[s.kind]
            return (
              <span
                key={s.id}
                className="status-chip"
                title={`${meta?.label ?? s.kind}（剩余 ${s.roundsLeft} 回合）`}
                aria-label={`${meta?.label ?? s.kind} ${s.roundsLeft}回合`}
              >
                {meta?.icon ?? '?'}{s.roundsLeft}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One enemy in the on-field team: sprite + name/Lv + its own HP bar. Shows a defeated state at
 *  hp≤0, a floating damage number, a current-target highlight, and (when onSelect is given and the
 *  enemy is alive) is clickable to pick it as the step-through target. */
const PHYS_ICON: Record<string, string> = { slash: '🗡', pierce: '🏹', strike: '🔨', arcane: '✨' }

export function EnemyCard({
  enemy,
  inQuest,
  float,
  isTarget,
  active,
  onSelect,
  deepIntel,
  reserveIntel,
  statuses,
}: {
  enemy: Monster
  inQuest: boolean
  float?: { amount: number; key: number; crit?: boolean; weak?: boolean; resist?: boolean; missed?: boolean }
  /** This enemy is the currently selected/auto target (highlighted). */
  isTarget?: boolean
  /** It's this enemy's CTB turn (parity with the party sprite highlight). */
  active?: boolean
  /** Click to target this enemy (only wired during an ally's step-through turn). */
  onSelect?: (id: string) => void
  /** §25 deep mode: surface weakness/element intel chips. */
  deepIntel?: boolean
  /** Reserve the two-row intel slot even when this enemy has no chips — keeps baselines level
   *  across a multi-enemy team. Solo enemies skip the reservation (nothing to align with). */
  reserveIntel?: boolean
  /** Active status effects on this enemy. */
  statuses?: CombatStatus[]
}) {
  const name = enemy.displayName ?? t(enemy.nameKey)
  const downed = enemy.hp <= 0
  const pct = enemy.maxHp > 0 ? Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100)) : 0
  const low = pct <= 30
  const clickable = !downed && !!onSelect
  // §25 蓄力: the NEXT move of the rotation telegraphs — derivable statelessly. Shown in
  // BOTH modes (an icon-level warning is survival info, not a research decision).
  const windup = !downed ? enemy.pattern?.[(enemy.patternIdx ?? 0) % (enemy.pattern?.length || 1)]?.telegraph : undefined
  return (
    <div
      className={`enemy-card ${downed ? 'defeated' : ''} ${isTarget ? 'current-target' : ''} ${active ? 'acting' : ''} ${clickable ? 'selectable' : ''}`}
      data-fx-anchor={enemy.id}
      onClick={clickable ? () => onSelect?.(enemy.id) : undefined}
      role={clickable ? 'button' : undefined}
      aria-pressed={clickable ? Boolean(isTarget) : undefined}
      title={clickable ? `选择目标：${name}` : name}
    >
      <div className={`enemy-card-sprite ${low && !downed ? 'low' : ''}`} aria-hidden>
        {downed ? '💀' : enemyEmoji(name, inQuest)}
      </div>
      <div className="enemy-card-shadow" aria-hidden />
      {float && !downed && (
        <div className={`float ${float.crit ? 'crit' : ''} ${float.weak ? 'weak' : ''}`} key={float.key}>
          {float.missed
            ? '未命中'
            : `-${float.amount}${float.crit ? ' 会心!' : ''}${float.weak ? ' 拔群!' : float.resist ? ' 不佳…' : ''}`}
        </div>
      )}
      {windup && (
        <div className="enemy-windup" title={`${name} 正在${windup}——下一击非同小可！`}>
          ⚡{windup}
        </div>
      )}
      <div className="enemy-card-name">
        {name} <span className="enemy-card-lv">Lv.{enemy.level}</span>
      </div>
      {/* Rendered (possibly empty) for EVERY living enemy in a multi-enemy team in deep mode,
          so the reserved min-height keeps name/HP rows on one baseline across cards. */}
      {deepIntel && !downed && (reserveIntel || enemy.physWeak?.length || enemy.element) && (
        <div className={`enemy-intel ${reserveIntel ? 'reserve' : ''}`} aria-label="弱点情报">
          {enemy.element && <span className="intel-chip" title={`五行：${t(`element.${enemy.element}`)}`}>☯{t(`element.${enemy.element}`)}</span>}
          {enemy.physWeak?.map((k) => (
            <span key={k} className="intel-chip weak" title={`弱点：${t(`phys.${k}`)}（伤害 ×1.5，打这里！）`}>
              ▲{PHYS_ICON[k]}弱{t(`phys.${k}`)}
            </span>
          ))}
          {enemy.physResist?.map((k) => (
            <span key={`r-${k}`} className="intel-chip resist" title={`抗性：${t(`phys.${k}`)}（伤害 ×0.7）`}>
              ▼{PHYS_ICON[k]}抗{t(`phys.${k}`)}
            </span>
          ))}
        </div>
      )}
      <div className="hpbar enemy-card-hp">
        <div className={`hpbar-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
        <div className="hpbar-label">{downed ? '已击败' : `${enemy.hp} / ${enemy.maxHp}`}</div>
      </div>
      {statuses && statuses.length > 0 && (
        <div className="status-chip-row" aria-label="状态">
          {statuses.map((s) => {
            const meta = STATUS_META[s.kind]
            return (
              <span
                key={s.id}
                className="status-chip"
                title={`${meta?.label ?? s.kind}（剩余 ${s.roundsLeft} 回合）`}
                aria-label={`${meta?.label ?? s.kind} ${s.roundsLeft}回合`}
              >
                {meta?.icon ?? '?'}{s.roundsLeft}
              </span>
            )
          })}
        </div>
      )}
      {deepIntel && !downed && enemy.phases && (enemy.phaseIdx ?? 0) > 0 && (() => {
        const lastPhase = enemy.phases[(enemy.phaseIdx ?? 0) - 1]
        return lastPhase?.phaseLabel ? (
          <div className="phase-badge" aria-label={`当前阶段：${lastPhase.phaseLabel}`}>
            ⚠{lastPhase.phaseLabel}
          </div>
        ) : null
      })()}
    </div>
  )
}
