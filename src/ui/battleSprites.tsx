// Shared battle-sprite primitives (placeholder emoji until real pixel art lands), used by both the
// always-on MonsterHUD and the interactive RoundResolver overlay.

import type { CharResource, Character, ClassId } from '../domain/types'

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
