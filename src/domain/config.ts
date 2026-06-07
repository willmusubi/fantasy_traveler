// Tunable game-balance constants. All in ONE place (§7, §21) so the economy is
// easy to retune and unit tests reference the same source of truth.

import type { ClassId, PartyBuff, Priority, Stats } from './types'

// ---------- XP / leveling ----------

/** XP required to go from level n to n+1. */
export function xpForLevel(n: number): number {
  return 80 * n + 20 * n * n
}

// ---------- Combat ----------

export const PRIORITY_MULT: Record<Priority, number> = {
  low: 1,
  med: 1.5,
  high: 2.5,
}

/** Small "chip" XP per todo (immediate feedback); the bulk comes from defeating enemies. */
export const TODO_XP: Record<Priority, number> = {
  low: 3,
  med: 5,
  high: 8,
}

/** Party-wide XP for journaling (reflection). Granted once per local day — the first entry
 *  pays; later same-day entries are free to write (no farming). */
export const JOURNAL_XP = 10

// Tuned so a base fight is ~10-15 high-priority task completions (party ≈67 dmg/high task vs
// def 14) and the enemy's now-per-round turn-attack (below) actually threatens a wipe. All dials.
export const MONSTER_BASE_HP = 900
export const HP_PER_OPEN_HIGH = 110
export const HP_PER_STAGE = 180
export const MONSTER_BASE_DEF = 14
export const MONSTER_DEF_PER_STAGE = 3
export const MONSTER_BASE_ATK = 20

/** On overdue the 心魔 feeds on procrastination — it grows AND hits the party. sweepOverdue fires
 *  ONE TodoOverdue per overdue todo, so these already scale with backlog size (no extra multiplier
 *  needed). Tuned heavy: each overdue regrows ≈ one high task's progress. atk growth is permanent
 *  and compounds into every future enemy attack, so it stays modest while HP/party-dmg carry the bite. */
export const OVERDUE_HP_GROW = 70
export const OVERDUE_ATK_GROW = 2

/** Affinity gained when an enemy is defeated. */
export const VICTORY_AFFINITY = 20
/** Enemy-scaled DEFEAT reward — the main XP/gold payout. Tougher enemies (more HP, higher
 *  level) pay more: xp = round(maxHp*PER_HP + level*PER_LEVEL); gold likewise. */
export const DEFEAT_XP_PER_HP = 0.35
export const DEFEAT_XP_PER_LEVEL = 25
export const DEFEAT_GOLD_PER_HP = 0.08
export const DEFEAT_GOLD_PER_LEVEL = 6

// ---------- Active combat: MP / HP / enemy turn-attack (skills) ----------

/** MP restored to each on-field character per todo completion (productivity charges mana). */
export const MP_REGEN_TODO: Record<Priority, number> = { low: 6, med: 10, high: 16 }
/** Fraction of max MP / HP restored to the party on a victory (a breather). */
export const VICTORY_MP_RESTORE_PCT = 0.5
export const VICTORY_HP_RESTORE_PCT = 0.3

/** The enemy's TURN attack: when its CTB gauge crosses during a round it strikes the sturdiest
 *  on-field member. This is its NORMAL damage — it has its own turn, so it does NOT need to
 *  "counter" to hurt you. (A reactive counter-on-hit is a separate, RARE per-enemy trait, not a
 *  universal mechanic.) Damage = max(1, round(enemyAtk * ATK_MULT − targetDef * DEF_SOAK)). */
export const ENEMY_ATK_MULT = 1.25
export const ENEMY_DEF_SOAK = 0.5
/** Extra hit the monster lands on the party for each overdue todo it feeds on. */
export const OVERDUE_PARTY_DMG = 40

/** All on-field members downed → setback: revive party to this HP fraction, monster heals back. */
export const WIPE_REVIVE_HP_PCT = 0.4
export const WIPE_MONSTER_HEAL_PCT = 0.3

/** Skill effect scaling. attack dmg = round(atk * power * ATK_MULT) − monsterDef;
 *  heal = round(mag * power * HEAL_MULT); buff lasts BUFF_TURNS completions. */
export const SKILL_ATK_MULT = 3
export const SKILL_HEAL_MULT = 2.2
export const SKILL_BUFF_TURNS = 3

// ---------- Speed: persistent charge-time battle (CTB) ----------
// Speed drives a PERSISTENT turn-order timeline. Every combatant has a charge gauge that fills
// at its effective spd and CARRIES ACROSS completions (it loops; never resets per round).
// Completing a todo advances the shared clock by ONE ROUND (ctbRound): a window wide enough that
// every living unit acts once in speed order, and a unit fast enough crosses again → it laps
// (套圈) for a bonus action. Gauges carry across completions. They live in
// GameState.charge (missing entry = 0).
export const MONSTER_BASE_SPD = 12
export const MONSTER_SPD_PER_STAGE = 1
/** Charge needed to act. A gauge fills by its spd per unit of virtual time; on acting it drops
 *  by this much (overflow is kept, so the timeline keeps cycling). */
export const CTB_THRESHOLD = 100

// ---------- Economy: gold ----------

/** Small "chip" gold per todo; the bulk comes from defeating enemies (DEFEAT_GOLD_*). */
export const GOLD_TODO: Record<Priority, number> = { low: 1, med: 2, high: 3 }
/** Bonus gold for clearing a whole quest chapter (on top of the boss's defeat reward). */
export const GOLD_QUEST_CLEAR = 120

/** Max combat-log rounds kept in game state (older rounds trimmed). */
export const COMBAT_LOG_CAP = 100

// ---------- Habit buffs / debuffs ----------
// Completing a daily habit offers a "choose 1 of N" buff draft (it does NOT attack the
// monster); missing a scheduled day applies one random debuff. Both persist until the next
// battle victory, then clear. A debuff is just a negative-magnitude PartyBuff of the same kind.

export const HABIT_BUFF_CHOICES = 3
/** Max simultaneously-active habit buffs/debuffs (untilVictory). Oldest evicted FIFO. */
export const HABIT_BUFF_ACTIVE_CAP = 4

export interface HabitBuffDef {
  id: string
  kind: PartyBuff['kind']
  magnitude: number // + = buff, − = debuff
  label: string
  icon: string
  desc: string
}

/** Buff draft pool — completing a habit draws HABIT_BUFF_CHOICES distinct options from here. */
export const HABIT_BUFF_POOL: HabitBuffDef[] = [
  { id: 'edge', kind: 'atkPct', magnitude: 0.2, label: '利刃', icon: '⚔', desc: '任务攻击伤害 +20%' },
  { id: 'wall', kind: 'defPct', magnitude: 0.2, label: '铁壁', icon: '🛡', desc: '减少心魔进攻伤害' },
  { id: 'gale', kind: 'spdPct', magnitude: 0.25, label: '疾风', icon: '➤', desc: '战斗中更频繁行动' },
  { id: 'psi', kind: 'magPct', magnitude: 0.25, label: '灵能', icon: '✦', desc: '强化治疗与法术技能' },
]

/** Debuff pool — missing a scheduled day applies one random entry. */
export const HABIT_DEBUFF_POOL: HabitBuffDef[] = [
  { id: 'dull', kind: 'atkPct', magnitude: -0.15, label: '钝刃', icon: '⚔', desc: '任务攻击伤害 −15%' },
  { id: 'crack', kind: 'defPct', magnitude: -0.15, label: '破甲', icon: '🛡', desc: '更易受到攻击' },
  { id: 'slow', kind: 'spdPct', magnitude: -0.15, label: '迟缓', icon: '➤', desc: '行动变慢' },
  { id: 'haze', kind: 'magPct', magnitude: -0.15, label: '心神不宁', icon: '✦', desc: '法术 / 治疗减弱' },
]

// ---------- Affinity ----------

export const AFFINITY_DAILY_CAP = 30
export const AFFINITY_TODO_COMPLETE = 5
export const AFFINITY_JOURNAL_TOTAL = 8 // split among present companions
export const AFFINITY_ONBOARDING_MEETING = 20

export const AFFINITY_THRESHOLDS = {
  C: 0,
  B: 100,
  A: 250,
  S: 500,
} as const

// ---------- Class definitions (L1 base + per-level growth) ----------

export interface ClassDef {
  id: ClassId
  nameKey: string
  role: string
  base: Omit<Stats, 'level' | 'xp'>
  growth: Omit<Stats, 'level' | 'xp'>
}

export const CLASS_DEFS: Record<ClassId, ClassDef> = {
  vanguard: {
    id: 'vanguard',
    nameKey: 'class.vanguard',
    role: '平衡战士',
    base: { maxHp: 120, maxMp: 24, atk: 18, def: 12, spd: 10, mag: 6 },
    growth: { maxHp: 14, maxMp: 3, atk: 3, def: 2, spd: 1, mag: 1 },
  },
  guardian: {
    id: 'guardian',
    nameKey: 'class.guardian',
    role: '重装',
    base: { maxHp: 150, maxMp: 20, atk: 12, def: 18, spd: 7, mag: 5 },
    growth: { maxHp: 18, maxMp: 2, atk: 2, def: 3, spd: 1, mag: 1 },
  },
  striker: {
    id: 'striker',
    nameKey: 'class.striker',
    role: '敏捷暴击',
    base: { maxHp: 95, maxMp: 24, atk: 20, def: 8, spd: 16, mag: 6 },
    growth: { maxHp: 10, maxMp: 3, atk: 3, def: 1, spd: 2, mag: 1 },
  },
  arcanist: {
    id: 'arcanist',
    nameKey: 'class.arcanist',
    role: '法术范围',
    base: { maxHp: 85, maxMp: 70, atk: 7, def: 7, spd: 11, mag: 20 },
    growth: { maxHp: 9, maxMp: 9, atk: 1, def: 1, spd: 1, mag: 3 },
  },
  tactician: {
    id: 'tactician',
    nameKey: 'class.tactician',
    role: '控制·攻辅',
    base: { maxHp: 90, maxMp: 56, atk: 10, def: 9, spd: 14, mag: 16 },
    growth: { maxHp: 10, maxMp: 6, atk: 2, def: 1, spd: 2, mag: 2 },
  },
  medic: {
    id: 'medic',
    nameKey: 'class.medic',
    role: '治疗·辅助',
    base: { maxHp: 100, maxMp: 60, atk: 8, def: 12, spd: 10, mag: 17 },
    growth: { maxHp: 12, maxMp: 7, atk: 1, def: 2, spd: 1, mag: 2 },
  },
}

/** AI chat defaults. */
export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const MAX_GROUP_RESPONDERS = 2
export const CHAT_MAX_TOKENS = 220
export const CHAT_TIMEOUT_MS = 12_000
