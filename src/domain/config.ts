// Tunable game-balance constants. All in ONE place (§7, §21, §25) so the economy is
// easy to retune and unit tests reference the same source of truth.

import type { ClassId, Element, EnemyArchetype, EnemyMove, PartyBuff, PhysKind, Priority, StatProfile, StatusKind, WeaponKind } from './types'

// ---------- XP / leveling ----------

/** XP required to go from level n to n+1. */
export function xpForLevel(n: number): number {
  return 80 * n + 20 * n * n
}

/** §25 hard level cap — keeps linear growth bounded so multiplier stacks can't run away.
 *  Enemy stage curves clamp to the same horizon. */
export const MAX_LEVEL = 60

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

// ---------- §25 enemy curves (TTK-budget derived — NOT free constants) ----------
// Design rule: defense/hit/eva are TEXTURE dials (linear, modest); HP is the DIFFICULTY
// knob, derived as TTK_target × expected party damage-per-round. The simulator
// (scripts/sim-balance.ts + sim.guard.test.ts) is the verification gate: retune by
// editing these curves and re-running — formulas stay put.

export const ENEMY_PDEF = (stage: number) => Math.round(10 + 2.5 * clampStage(stage))
export const ENEMY_MDEF = (stage: number) => Math.round(ENEMY_PDEF(stage) * 0.8)
export const ENEMY_HIT = (stage: number) => 8 + clampStage(stage)
export const ENEMY_EVA = (stage: number) => Math.round(6 + 0.6 * clampStage(stage))
export const ENEMY_ATK = (stage: number) => 16 + 2 * clampStage(stage)
export const ENEMY_MATK = (stage: number) => Math.round(ENEMY_ATK(stage) * 0.9)

/** Stages share the level horizon (MAX_LEVEL) so enemy curves are bounded too. */
export function clampStage(stage: number): number {
  return Math.min(Math.max(0, stage), 59)
}

/** Rounds-of-real-tasks each archetype should take for an at-level neutral party. */
export const TTK_TARGET: Record<EnemyArchetype, number> = { mook: 4, elite: 6, boss: 10 }

/** Real play beats basic-only play via skills + CTB laps — folded into the HP budget. */
export const ENGAGEMENT_FACTOR = 1.25
/** The "neutral" anchor: a player completing ordinary (med) tasks, no weakness play. */
export const NEUTRAL_PRIORITY_MULT = 1.5

/** Extra HP per open high-priority todo at spawn (backlog pressure). */
export const HP_PER_OPEN_HIGH = 70

/** Expected at-stage party damage per round: traveler + an attacker companion +
 *  half-time support, modest shop weapons, med-priority tasks, soak + chip floor. */
export function expectedPartyDPR(stage: number): number {
  const s = clampStage(stage)
  const L = Math.min(s + 1, MAX_LEVEL)
  const patk = (p: StatProfile, weapon: number) => p.base.str + p.growth.str * (L - 1) + weapon
  const pdef = ENEMY_PDEF(s)
  const hitOf = (pow: number) =>
    Math.max(pow * NEUTRAL_PRIORITY_MULT * 0.1, pow * NEUTRAL_PRIORITY_MULT - pdef * 0.5)
  const traveler = hitOf(patk(PROFILE_TEMPLATES.balanced, 2))
  const attacker = hitOf(patk(PROFILE_TEMPLATES.attacker, 3))
  const support = hitOf(patk(PROFILE_TEMPLATES.support, 1)) * 0.5
  return (traveler + attacker + support) * ENGAGEMENT_FACTOR
}

/** The §25 HP budget: how much HP gives the target TTK at this stage. */
export function enemyHpBudget(stage: number, archetype: EnemyArchetype): number {
  return Math.round(TTK_TARGET[archetype] * expectedPartyDPR(stage))
}

/** Fixed move rotations (no MP — §25). Boss heavy is telegraphed the round before;
 *  its damage is additionally capped at BOSS_HEAVY_POOL_CAP × current party HP pool
 *  and the rotation resets off the heavy slot on a wipe (death-spiral guards). */
export const ARCHETYPE_PATTERNS: Record<EnemyArchetype, EnemyMove[]> = {
  mook: [{ kind: 'attack' }],
  elite: [{ kind: 'attack' }, { kind: 'attack' }, { kind: 'heavy', mult: 1.4 }],
  boss: [
    { kind: 'attack' },
    { kind: 'heavy', mult: 1.4 },
    { kind: 'attack' },
    { kind: 'heavy', mult: 2.0, telegraph: '蓄力' },
  ],
}
export const BOSS_HEAVY_POOL_CAP = 0.6

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
export const SKILL_HEAL_MULT = 2.5 // §25: up from 2.2 vs the larger HP pools/heavier hits
export const SKILL_BUFF_TURNS = 3

// ---------- §26 status effects / guard / smart tactics ----------

/** DOT/HOT default magnitude as a fraction of the TARGET's maxHp per round. Resolved to a
 *  FLAT amount at application time (an explicit StatusEffectSpec.magnitude overrides). */
export const STATUS_DOT_PCT: Partial<Record<StatusKind, number>> = {
  poison: 0.05,
  burn: 0.06,
  regen: 0.06,
}
/** slow's default spd cut when unauthored (0.3 = −30%). */
export const SLOW_DEFAULT_PCT = 0.3
/** 防御 stance: incoming enemy TURN damage × (1 − this) while guarding. Penalty hits
 *  (overdue/timer — dealToParty) ignore guard: a real-life punishment never whiffs. */
export const GUARD_DAMAGE_REDUCTION = 0.5
/** The reserved roundPlan/choice sentinel for the 防御 stance (not a real skill id). */
export const GUARD_ACTION = 'guard'
/** Smart tactics (§26): auto-guard when a member's HP falls below this fraction… */
export const SMART_GUARD_HP_PCT = 0.3
/** …and auto-heal when any ally falls below this fraction (healers act first on it). */
export const SMART_HEAL_HP_PCT = 0.45

/** Display meta per status kind — battle HUD chips + combat log share it. */
export const STATUS_META: Record<StatusKind, { label: string; icon: string }> = {
  poison: { label: '中毒', icon: '☠' },
  burn: { label: '灼烧', icon: '🔥' },
  regen: { label: '再生', icon: '🌿' },
  sleep: { label: '睡眠', icon: '💤' },
  paralysis: { label: '麻痹', icon: '⚡' },
  silence: { label: '沉默', icon: '🤐' },
  slow: { label: '迟缓', icon: '🐌' },
  guard: { label: '防御', icon: '🛡' },
  taunt: { label: '嘲讽', icon: '🎯' },
}

// ---------- §28 growth systems ----------

/** A talent point is earned every N levels (lv 5, 10, … MAX_LEVEL → 12 points total). */
export const TALENT_POINT_EVERY_LEVELS = 5
/** The 嘲讽 stance: a 1-round status; enemies strike the taunter instead of the sturdiest. */
export const TAUNT_ACTION = 'taunt'
/** counter passive: riposte power as a fraction of a basic attack when dodging a turn-hit. */
export const COUNTER_POWER_PCT = 0.5
/** mpDiscount passive: skills cost this fraction less MP. */
export const MP_DISCOUNT_PCT = 0.2
/** critBonus passive: extra crit chance in percentage points. */
export const TALENT_CRIT_BONUS = 5
/** §28 duo techs: combined-stat coefficient share per partner. */
export const DUO_POW_SHARE = 0.6
/** Rarity display meta (color tokens live in CSS as .rarity-*). */
export const RARITY_META: Record<'common' | 'uncommon' | 'rare' | 'epic', { label: string }> = {
  common: { label: '普通' },
  uncommon: { label: '精良' },
  rare: { label: '稀有' },
  epic: { label: '史诗' },
}
/** §28 habit milestones: streak thresholds → reward description (reducer implements). */
export const HABIT_MILESTONES = [7, 30, 100] as const

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

// ---------- §25 weapons & elements (static data) ----------

/** Weapon kind → physical damage category. Arcane weapons swing with matk.
 *  Convention: 匕首 (daggers) are authored as `sword` → 刺. */
export const WEAPON_CATEGORY: Record<WeaponKind, PhysKind> = {
  katana: 'slash', axe: 'slash', halberd: 'slash',
  sword: 'pierce', spear: 'pierce', bow: 'pierce',
  fist: 'strike', hammer: 'strike', club: 'strike',
  rod: 'arcane', fan: 'arcane', qin: 'arcane',
}

/** 五行相克: attacker BEATS defender → ×ELEM_ADV; defender beats attacker → ×ELEM_DISADV.
 *  木克土, 土克水, 水克火, 火克金, 金克木. */
export const ELEMENT_BEATS: Record<Element, Element> = {
  wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood',
}

// ---------- §25 damage pipeline constants ----------

/** hitRate% = clamp(HIT_BASE + (hit − eva) × HIT_SLOPE, HIT_FLOOR, 100). */
export const HIT_BASE = 88
export const HIT_SLOPE = 1.2
export const HIT_FLOOR = 55
/** critRate% = min(CRIT_CAP, CRIT_BASE + skl × CRIT_PER_SKL). Player side ONLY —
 *  enemies never crit (bosses use telegraphed heavy moves instead). */
export const CRIT_BASE = 5
export const CRIT_PER_SKL = 0.3
export const CRIT_CAP = 45
export const CRIT_MULT = 1.6
/** §35 准时暴击: a task completed on or before its deadline grants this many EXTRA crit-rate
 *  percentage points to the WHOLE round its completion drives. No deadline OR overdue → 0.
 *  Stacks with talent/affix critBonus and is clamped by CRIT_CAP in critRate, so it rewards
 *  BOTH setting a deadline and meeting it without ever guaranteeing a crit. */
export const DEADLINE_CRIT_BONUS = 15
/** Universal defense soak (was 1.0 for party hits / 0.5 for enemy hits — now uniform). */
export const DEF_SOAK = 0.5
/** Chip floor: damage never drops below this fraction of the pre-mitigation raw. */
export const CHIP_FLOOR_PCT = 0.1
/** Weakness / resist multipliers (phys kind tags incl. arcane 弱魔). */
export const PHYS_WEAK_MULT = 1.5
export const PHYS_RESIST_MULT = 0.7
/** 五行 advantage multipliers. */
export const ELEM_ADV_MULT = 1.3
export const ELEM_DISADV_MULT = 0.8
/** Combined phys×elem multiplier clamp. Crit + variance apply OUTSIDE this clamp. */
export const TYPE_MULT_MIN = 0.5
export const TYPE_MULT_MAX = 2.0
/** Damage variance: uniform in [1−V, 1+V]. */
export const DMG_VARIANCE = 0.08

// ---------- §25 stat profiles (REPLACES the class system) ----------
// Stats express character identity directly. Templates are authoring shorthands only —
// "职业" no longer exists as a player-facing or mechanical concept.

const block = (
  maxHp: number, maxMp: number, str: number, vit: number, wis: number, spr: number,
  spd: number, skl: number, hit: number, eva: number,
) => ({ maxHp, maxMp, str, vit, wis, spr, spd, skl, hit, eva })

export type ProfileTemplateId = 'attacker' | 'tank' | 'caster' | 'trickster' | 'support' | 'balanced'

export const PROFILE_TEMPLATES: Record<ProfileTemplateId, StatProfile> = {
  /** 敏捷攻手 — high str/skl/spd, frail. */
  attacker: {
    role: '敏捷攻手',
    base: block(95, 24, 18, 8, 6, 7, 15, 14, 14, 10),
    growth: block(10, 3, 3, 1, 1, 1, 2, 3, 1, 2),
    weaponKinds: ['katana', 'fist', 'bow'],
  },
  /** 重装壁垒 — top HP/vit, slow. */
  tank: {
    role: '重装壁垒',
    base: block(150, 20, 12, 17, 5, 13, 7, 6, 11, 5),
    growth: block(17, 2, 2, 3, 1, 2, 1, 1, 1, 1),
    weaponKinds: ['axe', 'hammer', 'club'],
  },
  /** 法术爆发 — top wis/MP, frail. */
  caster: {
    role: '法术爆发',
    base: block(85, 70, 6, 7, 18, 10, 11, 8, 12, 8),
    growth: block(9, 8, 1, 1, 3, 2, 1, 1, 1, 1),
    weaponKinds: ['rod', 'qin'],
  },
  /** 策士攻辅 — hybrid wis/spd control. */
  trickster: {
    role: '策士攻辅',
    base: block(90, 56, 9, 9, 15, 11, 14, 10, 13, 9),
    growth: block(10, 6, 1, 1, 2, 2, 2, 2, 1, 1),
    weaponKinds: ['fan', 'bow', 'qin'],
  },
  /** 治疗支援 — top spr, sturdy caster. */
  support: {
    role: '治疗支援',
    base: block(100, 60, 8, 11, 15, 14, 10, 7, 12, 7),
    growth: block(11, 7, 1, 2, 2, 3, 1, 1, 1, 1),
    weaponKinds: ['rod', 'fan', 'club'],
  },
  /** 全能 — the traveler's even spread. */
  balanced: {
    role: '全能旅人',
    base: block(120, 30, 14, 11, 10, 10, 11, 10, 12, 8),
    growth: block(13, 4, 2, 2, 2, 2, 1, 2, 1, 1),
    weaponKinds: 'all',
  },
}

/** The player's profile — cross-world traveler: balanced spread, every weapon, NO element. */
export const TRAVELER_PROFILE: StatProfile = PROFILE_TEMPLATES.balanced

/** Shipped companion profiles (观星会). Identity = stats + element + weapons.
 *  Content packs may author `CompanionDef.profile` directly; absent that, legacy
 *  `classId` falls through CLASS_TEMPLATE_MAP below. */
export const COMPANION_PROFILES: Record<string, StatProfile> = {
  mira: { ...PROFILE_TEMPLATES.attacker, element: 'fire' },
  vela: { ...PROFILE_TEMPLATES.trickster, element: 'water' },
  nova: { ...PROFILE_TEMPLATES.support, element: 'wood' },
}

/** Legacy classId → template, for old Character records and packs that still author
 *  classId (e.g. the gitignored local pack). Keeps them compiling AND playing sensibly. */
export const CLASS_TEMPLATE_MAP: Record<ClassId, ProfileTemplateId> = {
  vanguard: 'balanced',
  guardian: 'tank',
  striker: 'attacker',
  arcanist: 'caster',
  tactician: 'trickster',
  medic: 'support',
}

/** AI chat defaults. */
export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const MAX_GROUP_RESPONDERS = 2
export const CHAT_MAX_TOKENS = 220
export const CHAT_TIMEOUT_MS = 12_000
