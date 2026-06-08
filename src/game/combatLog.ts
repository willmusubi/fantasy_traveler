// Builds one combat-log round from a reducer's effects, resolving display names/numbers
// at log time (so the history records who hit whom for how much — party ↔ NPC). Pure;
// called by the pipeline, which appends the entry to gameState.combatLog.

import { COMPANION_DEFS } from '../companion/roster'
import { SKILL_DEFS } from '../companion/skills'
import type { Character, CombatLogEntry, CombatLogLine, ID, Monster } from '../domain/types'
import { t } from '../i18n'
import { EQUIPMENT_DEFS } from '../world/equipment'
import type { DomainEvent } from './events'
import type { GameEffect } from './reducer'

export interface LogContext {
  characters: Character[]
  /** The enemy TEAM fought this round (snapshot at the start of the round/dispatch). */
  enemies: Monster[]
  source: DomainEvent['type']
  /** gold gained this round (result.gold − prev gold). */
  goldDelta: number
  at: string
  id: ID
}

export function buildLogEntry(effects: GameEffect[], ctx: LogContext): CombatLogEntry | null {
  const nameOf = (id: ID): string =>
    ctx.characters.find((c) => c.id === id)?.name ?? COMPANION_DEFS[id]?.name ?? '伙伴'
  const enemyNameById = (id: ID): string => {
    const m = ctx.enemies.find((e) => e.id === id)
    return m ? (m.displayName ?? t(m.nameKey)) : '敌人'
  }
  const primary = ctx.enemies[0]
  const primaryName = primary ? (primary.displayName ?? t(primary.nameKey)) : '敌方'
  // The round's team label: primary name + 「等」 when there are escorts, else the single name.
  const teamLabel = ctx.enemies.length > 1 ? `${primaryName} 等` : primaryName
  const skillName = (id: ID): string => t(SKILL_DEFS[id]?.nameKey ?? id)

  const lines: CombatLogLine[] = []
  const xpByChar = new Map<ID, number>()
  const leveled = new Set<ID>()

  for (const e of effects) {
    switch (e.type) {
      case 'skillCast': {
        const caster = nameOf(e.casterId)
        const sk = skillName(e.skillId)
        if (e.skillKind === 'attack') lines.push({ icon: '✦', text: `${caster} 施放「${sk}」→ ${e.targetId ? enemyNameById(e.targetId) : '全体敌人'}  -${e.amount}${e.monsterHpAfter != null ? `（剩 ${e.monsterHpAfter}）` : ''}`, tone: 'good' })
        else if (e.skillKind === 'heal') lines.push({ icon: '✦', text: `${caster} 施放「${sk}」，恢复 ${e.amount} HP`, tone: 'good' })
        else if (e.skillKind === 'buff') lines.push({ icon: '✦', text: `${caster} 施放「${sk}」，全队攻击 +${e.amount}%`, tone: 'good' })
        else lines.push({ icon: '✦', text: `${caster} 施放「${sk}」，敌方防御 -${e.amount}%`, tone: 'good' })
        break
      }
      case 'damage':
        // One line per individual basic-attack hit (the speed-ordered round), naming who struck.
        // A planned skill's damage is tagged `fromSkill` — its paired skillCast line covers it.
        if (!e.fromSkill) lines.push({ icon: '⚔', text: `${nameOf(e.actorId)} → ${enemyNameById(e.targetId)}  -${e.amount}（剩 ${e.monsterHpAfter}）`, tone: 'good' })
        break
      case 'enemyAttack':
        lines.push({ icon: '💥', text: `${teamLabel} 进攻 ${nameOf(e.targetId)}  -${e.amount}`, tone: 'bad' })
        break
      case 'monsterGrew':
        lines.push({ icon: '⚠', text: `拖延让 ${primaryName} 更强了（HP +${e.hpDelta}，攻击 +${e.atkDelta}）`, tone: 'bad' })
        break
      case 'downed':
        lines.push({ icon: '✖', text: `${nameOf(e.characterId)} 倒下了！`, tone: 'bad' })
        break
      case 'partyWiped':
        lines.push({
          icon: '💀',
          text: e.monsterHealed
            ? `队伍被击溃，撤退重整旗鼓…（${primaryName} 趁机回复 ${e.monsterHealed}，剩 ${e.monsterHpAfter}）`
            : '队伍被击溃，撤退重整旗鼓…',
          tone: 'bad',
        })
        break
      case 'affinity':
        lines.push({ icon: '💗', text: `与 ${nameOf(e.characterId)} 的羁绊 +${e.amount}${e.rankedUpTo ? `（升至 ${e.rankedUpTo}）` : ''}`, tone: 'good' })
        break
      case 'charXp':
        xpByChar.set(e.characterId, (xpByChar.get(e.characterId) ?? 0) + e.amount)
        if (e.levelsGained > 0) leveled.add(e.characterId)
        break
      case 'victory':
        lines.push({ icon: '🏆', text: `击败了 ${teamLabel}！冒险推进到第 ${e.storyStage} 阶段`, tone: 'good' })
        if (e.nextEnemyHp != null) lines.push({ icon: '➡', text: `新的心魔现身（HP ${e.nextEnemyHp}）`, tone: 'info' })
        break
      case 'encounterCleared':
        if (e.victoryText) lines.push({ icon: '🎬', text: e.victoryText, tone: 'good' })
        if (e.nextEnemy) lines.push({ icon: '➡', text: `下一个对手：${e.nextEnemy}`, tone: 'info' })
        break
      case 'questCompleted':
        lines.push({ icon: '🏆', text: '副本通关！', tone: 'good' })
        break
      case 'recruited':
        lines.push({ icon: '★', text: `招募了新伙伴：${COMPANION_DEFS[e.companionId]?.name ?? e.companionId}`, tone: 'good' })
        break
      case 'equipmentGranted':
        lines.push({ icon: '◆', text: `获得装备：${t(EQUIPMENT_DEFS[e.defId]?.nameKey ?? e.defId)}`, tone: 'good' })
        break
      // 'heal' (per-target) is summarised by the skillCast line; 'mood' isn't logged.
    }
  }

  // Everyone gains the same XP per grant → one party line; level-ups called out per member.
  const partyXp = xpByChar.size ? Math.max(...xpByChar.values()) : 0
  if (partyXp > 0) lines.push({ icon: '✨', text: `全队 +${partyXp} 经验`, tone: 'good' })
  for (const id of leveled) lines.push({ icon: '⭐', text: `${nameOf(id)} 升级了！`, tone: 'good' })
  if (ctx.goldDelta > 0) lines.push({ icon: '🪙', text: `获得 ${ctx.goldDelta} 金币`, tone: 'good' })

  if (lines.length === 0) return null
  return { id: ctx.id, at: ctx.at, enemy: teamLabel, lines }
}
