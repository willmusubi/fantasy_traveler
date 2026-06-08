// Shared battle-sprite primitives (placeholder emoji until real pixel art lands), used by both the
// always-on MonsterHUD and the interactive RoundResolver overlay.

import type { CharResource, Character, ClassId, Monster } from '../domain/types'
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

export function MiniBar({ value, max, cls }: { value: number; max: number; cls: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`mini-bar ${cls}`}>
      <div className="mini-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function BattleSprite({
  char,
  isPlayer,
  res,
  charge,
  plan,
  active,
}: {
  char: Character
  isPlayer: boolean
  res: CharResource
  charge: number
  plan?: string
  /** Highlight this sprite as the one currently choosing an action (RoundResolver). */
  active?: boolean
}) {
  const downed = res.hp <= 0
  const emoji = downed ? '💫' : isPlayer ? CLASS_EMOJI[char.classId] ?? '⚔️' : '🙂'
  return (
    <div className={`bsprite ${downed ? 'downed' : ''} ${active ? 'acting' : ''}`}>
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

/** One enemy in the on-field team: sprite + name/Lv + its own HP bar. Shows a defeated state at
 *  hp≤0, a floating damage number, a current-target highlight, and (when onSelect is given and the
 *  enemy is alive) is clickable to pick it as the step-through target. */
export function EnemyCard({
  enemy,
  inQuest,
  float,
  isTarget,
  active,
  onSelect,
}: {
  enemy: Monster
  inQuest: boolean
  float?: { amount: number; key: number }
  /** This enemy is the currently selected/auto target (highlighted). */
  isTarget?: boolean
  /** It's this enemy's CTB turn (parity with the party sprite highlight). */
  active?: boolean
  /** Click to target this enemy (only wired during an ally's step-through turn). */
  onSelect?: (id: string) => void
}) {
  const name = enemy.displayName ?? t(enemy.nameKey)
  const downed = enemy.hp <= 0
  const pct = enemy.maxHp > 0 ? Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100)) : 0
  const low = pct <= 30
  const clickable = !downed && !!onSelect
  return (
    <div
      className={`enemy-card ${downed ? 'defeated' : ''} ${isTarget ? 'current-target' : ''} ${active ? 'acting' : ''} ${clickable ? 'selectable' : ''}`}
      onClick={clickable ? () => onSelect?.(enemy.id) : undefined}
      role={clickable ? 'button' : undefined}
      aria-pressed={clickable ? Boolean(isTarget) : undefined}
      title={clickable ? `选择目标：${name}` : name}
    >
      <div className={`enemy-card-sprite ${low && !downed ? 'low' : ''}`} aria-hidden>
        {downed ? '💀' : enemyEmoji(name, inQuest)}
      </div>
      <div className="enemy-card-shadow" aria-hidden />
      {float && !downed && <div className="float" key={float.key}>-{float.amount}</div>}
      <div className="enemy-card-name">
        {name} <span className="enemy-card-lv">Lv.{enemy.level}</span>
      </div>
      <div className="hpbar enemy-card-hp">
        <div className={`hpbar-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
        <div className="hpbar-label">{downed ? '已击败' : `${enemy.hp} / ${enemy.maxHp}`}</div>
      </div>
    </div>
  )
}
