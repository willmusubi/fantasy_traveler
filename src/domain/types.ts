// Core domain entities for Fantasy Traveler. Shared across modules to avoid cycles.
// See docs/specs/2026-05-29-fantasy-traveler-design.md §6 and §21.

export type ID = string

// ---------- Characters & stat profiles ----------

/** LEGACY archetype tag. The class SYSTEM is gone (stats now come from per-character
 *  StatProfiles — §25); this id survives only as (a) a persisted field on old Character
 *  records, (b) a sprite/emoji pick, and (c) the fallback key mapping legacy content
 *  (e.g. local packs that still author `classId`) onto a profile template. */
export type ClassId =
  | 'vanguard'
  | 'guardian'
  | 'striker'
  | 'arcanist'
  | 'tactician'
  | 'medic'

export type SkillId = string // skill ids = nameKey suffix, e.g. "liuguang"

// ---------- §25 combat redesign: elements / weapon kinds ----------

/** 五行 — pure mechanics, never surfaced in story copy. 相克环: 木→土→水→火→金→木. */
export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth'

/** Physical damage category (斩/刺/打) + arcane (法 — basic attacks scale off matk). */
export type PhysKind = 'slash' | 'pierce' | 'strike' | 'arcane'

/** The 12 weapon kinds. Category derives via WEAPON_CATEGORY (config).
 *  匕首 (daggers) are authored as `sword` by convention. */
export type WeaponKind =
  | 'sword' | 'katana' | 'axe' // 剑→pierce 刺；刀 斧→slash 斩
  | 'spear' | 'halberd' | 'bow' // 枪 弓→pierce 刺；戟→slash 斩
  | 'fist' | 'hammer' | 'club' // 拳 锤 棍 → strike 打
  | 'rod' | 'fan' | 'qin' // 杖 扇 琴 → arcane 法

/** §25 ten-stat sheet. Persisted on Character; legacy 8-stat records are migrated by
 *  exact recompute from the owner's StatProfile (stats were always profile-derived —
 *  there is no manual allocation to lose). */
export interface Stats {
  level: number
  xp: number
  maxHp: number
  /** Magic resource pool (casters get more). */
  maxMp: number
  /** 力量 — physical attack (物攻 = effective str; weapon +str IS its attack power). */
  str: number
  /** 耐久 — physical defense (物防). */
  vit: number
  /** 智慧 — magic attack (魔攻); heals also scale off this. */
  wis: number
  /** 精神 — magic defense (魔防). */
  spr: number
  /** 速度 — CTB turn order (unchanged mechanics). */
  spd: number
  /** 技巧 — crit rate (player side only). */
  skl: number
  /** 命中 — hit rate vs target eva. */
  hit: number
  /** 闪避 — dodge rate vs attacker hit. */
  eva: number
}

/** Per-stat block of a profile (no level/xp bookkeeping). */
export type ProfileBlock = Omit<Stats, 'level' | 'xp'>

/** §25 character stat profile — REPLACES the class system. Stats express character
 *  identity directly (per-character authored); templates in config are authoring
 *  shorthands, not a gameplay concept. */
export interface StatProfile {
  base: ProfileBlock
  growth: ProfileBlock
  /** Equippable weapon kinds. 'all' = the traveler's cross-world privilege. */
  weaponKinds: WeaponKind[] | 'all'
  /** Display-only flavor (e.g. 「敏捷攻手」). Never mechanical. */
  role: string
  /** Innate 五行. Undefined = neutral (the player is ALWAYS neutral). */
  element?: Element
}

export type ExpressionKey =
  | 'neutral'
  | 'smile'
  | 'happy'
  | 'blush'
  | 'sad'
  | 'worried'
  | 'angry'
  | 'determined'
  | 'disdain'
  | 'sly'
  | 'surprised'
  | 'thinking'
  | 'heartthrob'
  | 'tired'

export interface CompanionPersona {
  /** Base personality block (zh) injected into the LLM system prompt. */
  systemPrompt: string
  /** Tone / speech-style cues. */
  speechStyle: string
  defaultExpression: ExpressionKey
}

export interface Character {
  id: ID
  name: string
  kind: 'player' | 'companion'
  /** LEGACY tag (sprite/emoji + profile-template fallback). Stats derive from the
   *  character's StatProfile via profileFor(), NOT from this. */
  classId: ClassId
  stats: Stats
  skills: SkillId[]
  /** Asset key prefix, e.g. "mira" → mira_neutral.png */
  portraitSet: string
  /** 专属烙印 signature name — display-only flavor in v1. */
  brand?: string
  /** Companions only — drives the LLM. */
  persona?: CompanionPersona
  /** World this character belongs to. Undefined for the player (a cross-world traveler). */
  worldId?: WorldId
  createdAt: string
}

// ---------- Productivity ----------

export type Priority = 'low' | 'med' | 'high'
export type TodoStatus = 'open' | 'done' // 'overdue' is derived (open && due passed)

/** 0 = Sunday … 6 = Saturday — matches Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RecurrenceRule =
  | { kind: 'none' } // back-compat: Todo.recurrence only ever stored this
  | { kind: 'daily' } // every day
  | { kind: 'weekly'; days: Weekday[] } // selected weekdays; empty = never due (UI forbids saving)

export interface Todo {
  id: ID
  title: string
  notes?: string
  /** ISO date (YYYY-MM-DD) or full datetime. */
  due?: string
  priority: Priority
  status: TodoStatus
  tags: string[]
  recurrence?: RecurrenceRule
  /** Manual sort position (ascending). Assigned on add, reassigned on drag-reorder.
   *  Optional for back-compat; backfilled on hydrate for pre-order saves. */
  order?: number
  createdAt: string
  completedAt?: string
  /** ISO time this todo first paid out its rewards. Set once and never cleared, so
   *  re-completing after an un-check does NOT grant rewards again (§ grant-once). */
  rewardedAt?: string
  /** YYYY-MM-DD (local) of the last day a TodoOverdue economy event fired. */
  lastOverdueOn?: string
  /** Optional countdown timer (Pomodoro-style, manual ▶ start). All three optional for
   *  back-compat. RUNNING iff `timerStartedAt` is set AND `timerFiredAt` is unset AND status
   *  is 'open'. On expiry the 心魔 lands one ordinary attack, then `timerFiredAt` is stamped
   *  (spent — never re-fires). Cleared on cancel / complete / reopen. */
  timerDurationMs?: number
  timerStartedAt?: string
  timerFiredAt?: string
}

/** A recurring daily-check (Habitica "Daily"). Completing one offers a buff choice (it does
 *  NOT attack the monster); missing a scheduled day breaks the streak + applies a random debuff.
 *  No `priority` — habits don't deal combat damage, so they need no priority multiplier. */
export interface Habit {
  id: ID
  title: string
  notes?: string
  /** When this habit is due — daily, or on selected weekdays. */
  schedule: RecurrenceRule
  /** Current consecutive-scheduled-day streak (0 when broken/new). */
  streak: number
  /** Highest streak ever reached — display only; never decreases. */
  bestStreak: number
  /** YYYY-MM-DD (local) of the last day this was checked off. Cleared on same-day un-check
   *  (visual only) — drives the "done today?" UI state. */
  lastCompletedOn?: string
  /** YYYY-MM-DD (local) of the last day this PAID OUT (offered a buff). Set on the first paid
   *  check of a day, NEVER cleared by un-check → re-checking the same day never re-offers. */
  rewardedOn?: string
  /** YYYY-MM-DD (local) the streak-break sweep last ran for this habit (once-per-day guard). */
  lastMissOn?: string
  /** §28 — milestone payouts already made: streak threshold (as string key, e.g. "7") → ISO
   *  date paid. Stamped by the store BEFORE dispatching HabitMilestone, so the reward can
   *  never double-fire. */
  milestoneRewardedAt?: Record<string, string>
  /** Manual sort position (ascending); backfilled on hydrate for pre-order saves. */
  order?: number
  createdAt: string
}

export type Mood = 'great' | 'good' | 'neutral' | 'down' | 'bad'

export interface JournalEntry {
  id: ID
  date: string // YYYY-MM-DD (local); one+ per day
  mood: Mood
  title?: string
  body: string
  createdAt: string
}

export interface CalendarEvent {
  id: ID
  title: string
  start: string
  end?: string
  allDay: boolean
  notes?: string
  linkedTodoId?: ID
  attendedAt?: string
}

// ---------- Affinity ----------

export type AffinityRank = 'none' | 'C' | 'B' | 'A' | 'S'

export interface Affinity {
  characterId: ID
  points: number
  rank: AffinityRank
  /** support-conversation ids already seen (fire-once). */
  unlockedSupports: string[]
  /** Daily-cap bookkeeping. */
  dailyGained: number
  dailyGainedOn: string // YYYY-MM-DD local
}

// ---------- §26 status effects ----------

/** §26 status kinds. poison/burn = DOT and regen = HOT (both resolve at ROUND END);
 *  sleep/paralysis = action skip — sleep additionally FREEZES an enemy's rotation
 *  (stalling a telegraphed heavy is the tactical reward) while paralysis lets the
 *  rotation advance silently; silence = skills locked (basic attacks only); slow = spd
 *  cut (CTB); guard = the 防御 stance (1-round, self-applied, halves incoming hits). */
export type StatusKind =
  | 'poison' | 'burn' | 'regen'
  | 'sleep' | 'paralysis' | 'silence' | 'slow'
  | 'guard' | 'taunt'

/** A live status on one combatant (party member or enemy), stored in
 *  GameState.activeStatuses keyed by combatant id. Durations tick down ONCE per round
 *  at round end (1 task = 1 round), so 「中毒 3 回合」 = three real tasks. */
export interface CombatStatus {
  id: ID
  kind: StatusKind
  /** Rounds remaining; decremented at round end, removed at 0. */
  roundsLeft: number
  /** Kind-specific strength, resolved FLAT at application time:
   *  poison/burn/regen = HP per round; slow = fraction of spd lost (0.3 = −30%). */
  magnitude?: number
  /** Who inflicted it (UI/flavor). */
  sourceId?: ID
}

/** An authored status infliction (skill / enemy move / boss phase). `chance` in [0,1]
 *  (default 1 — no RNG consumed); DOT/HOT magnitude defaults to a fraction of the
 *  TARGET's maxHp (config.STATUS_DOT_PCT), resolved flat at application time. */
export interface StatusEffectSpec {
  kind: StatusKind
  rounds: number
  magnitude?: number
  chance?: number
}

// ---------- Game state ----------

// §25: enemies have NO MP — they act on a fixed rotation (出招表). One entry per turn,
// cycling. `telegraph` marks the NEXT move as a wind-up: the HUD warns the round before.
export type EnemyArchetype = 'mook' | 'elite' | 'boss'

export interface EnemyMove {
  kind: 'attack' | 'heavy'
  /** Damage multiplier on the enemy's base swing (attack = 1). */
  mult?: number
  /** Wind-up banner text (e.g. 「蓄力」) — shown the round BEFORE this move lands. */
  telegraph?: string
  /** §26 — status this move tries to inflict on the struck target (on hit). */
  inflicts?: StatusEffectSpec
}

/** §26 boss phase transition — fires the moment the boss's HP first drops to/below the
 *  trigger (huge hits can cross several at once; authored DESCENDING by triggerHpPct).
 *  Authored on content bosses + clamped by coerceQuest for AI quests; spawned endless
 *  enemies have none. */
export interface BossPhase {
  /** hp/maxHp threshold in (0,1) — e.g. 0.5 fires at half HP. */
  triggerHpPct: number
  /** Replaces the move rotation (patternIdx resets to 0; an opening telegraph warns immediately). */
  newPattern?: EnemyMove[]
  /** Flat atk increase on transition. */
  atkBoost?: number
  /** Inflicted on every living party member at the transition. */
  inflicts?: StatusEffectSpec
  /** Deep-mode HUD badge, e.g. 「狂怒」. */
  phaseLabel?: string
  /** Banner/combat-log line at the flip. */
  narration?: string
}

export interface Monster {
  id: ID
  nameKey: string
  /** AI-generated display name for quest encounters (preferred over nameKey when set). */
  displayName?: string
  /** short flavor for the encounter banner/sprite */
  theme?: string
  level: number
  maxHp: number
  hp: number
  /** Physical attack (vs target pdef/vit). */
  atk: number
  /** Physical defense (vs party patk). */
  def: number
  /** CTB speed — fills the charge gauge; higher acts earlier each round and can lap (套圈) for
   *  extra turns. Set at spawn; backfilled for pre-speed saves. */
  spd: number
  /** flavor growth marker; combat scaling lives in config */
  growth: number
  // ---- §25 extension (all optional: pre-§25 saves backfill at read time) ----
  /** Magic attack (vs target mdef/spr); caster-type enemies swing with this. */
  matk?: number
  /** Magic defense (vs party matk). */
  mdef?: number
  hit?: number
  eva?: number
  /** 五行 (hash-assigned when unauthored). Undefined = neutral. */
  element?: Element
  /** Weakness tags ×1.5 — any of 斩/突/打/弱魔(arcane). */
  physWeak?: PhysKind[]
  /** Resist tags ×0.7. */
  physResist?: PhysKind[]
  archetype?: EnemyArchetype
  /** Fixed move rotation (no MP); index advances per enemy turn. */
  pattern?: EnemyMove[]
  patternIdx?: number
  /** §26 — authored phase transitions (DESCENDING triggerHpPct). Absent = single-phase. */
  phases?: BossPhase[]
  /** §26 — how many phases have fired (default 0). Survives saves so a flip never re-fires. */
  phaseIdx?: number
  /** §32 — battle-figure art key (/sprites/enemies/<artSet>.png). Defaults to the antagonist id
   *  at spawn; absent (old saves / unkeyed AI enemies) = emoji figure. */
  artSet?: string
}

// ---------- World / Quest (§22) ----------

export type WorldId = string

export interface OwnedEquipment {
  instanceId: ID
  defId: string // → EQUIPMENT_DEFS
  equippedBy?: ID // characterId, or undefined if in the stash
  acquiredAt: string
}

// ---------- §28 growth systems: rarity / affixes / talents ----------

/** §28 equipment rarity — display tier + affix-budget convention (no hidden mechanics:
 *  a rarity itself does nothing; its affixes do). Missing = 'common'. */
export type EquipRarity = 'common' | 'uncommon' | 'rare' | 'epic'

/** §28 equipment affix — a special property beyond flat stat bonuses. */
export type EquipAffix =
  /** Percentage stat boost, folded in effectiveStats after flat bonuses. */
  | { kind: 'pctStat'; stat: 'str' | 'vit' | 'wis' | 'spr' | 'spd'; pct: number }
  /** Heal the wielder for this many HP whenever they land a CRIT. */
  | { kind: 'onCritHeal'; amount: number }
  /** The wielder's BASIC attacks try to inflict this status on hit. */
  | { kind: 'statusOnHit'; status: StatusEffectSpec }
  /** Extra crit chance in percentage points (feeds rollDamage's critBonusPct). */
  | { kind: 'critBonus'; pct: number }

/** §28 one node of a character's talent tree (5–10 nodes, shallow prerequisites).
 *  Spent with talent points (1 per 5 levels). Exactly one effect field is set. */
export interface TalentNode {
  id: string
  name: string
  desc: string
  /** Talent points to learn. */
  cost: number
  /** Prerequisite node id (single chain link); absent = a root node. */
  requires?: string
  /** Flat stat bump folded into effectiveStats. */
  bonus?: Partial<ProfileBlock>
  /** Power multiplier for ONE skill: power × (1 + pct). */
  skillPower?: { skillId: SkillId; pct: number }
  /** Behavior unlock: counter = riposte at 50% power when dodging an enemy turn-attack;
   *  taunt = the 嘲讽 stance becomes plannable; mpDiscount = skills cost 20% less MP;
   *  critBonus = +5% crit chance. */
  passive?: 'counter' | 'taunt' | 'mpDiscount' | 'critBonus'
}

/** §28 a 羁绊连携技 — a paired ultimate unlocked by affinity rank. Both members must be
 *  on-field, alive, un-acted this round, and each pays mpCostEach. */
export interface DuoSkillDef {
  id: string
  nameKey: string
  desc: string
  /** The two companion/def ids (player participates via 'traveler'). */
  pair: [string, string]
  /** Minimum affinity rank BOTH members must have with you. */
  requiredRank: 'A' | 'S'
  kind: 'attack' | 'heal'
  /** Coefficient on the COMBINED offensive stat (attack) or wis sum (heal). */
  power: number
  target: 'enemy' | 'allEnemies' | 'allAllies'
  mpCostEach: number
  physKind?: PhysKind
  element?: Element
}

export interface EncounterSpec {
  index: number // 0-based position in the quest chain
  enemyName: string // canon antagonist or display name (not a locale key)
  enemyTheme: string
  /** Links to a WorldDef antagonist (canon grounding); filled when enemyName matches the roster. */
  antagonistId?: string
  hpScale: number // ~0.8–1.6 (clamped on coerce)
  defScale: number // ~0.8–1.4
  narrationIntro: string
  narrationVictory: string
  /** Escort enemies spawned alongside the primary — this encounter becomes a TEAM. Optional →
   *  back-compat: an encounter with no `adds` is a single enemy exactly as before. Each add carries
   *  its own scaling knobs. Authored statically (AI-generated quests do not populate this in V1). */
  adds?: EncounterAdd[]
  // ---- §25 (all optional; unauthored → deterministic hash assignment) ----
  /** Enemy 五行 — the AI generator assigns thematically (火怪=fire). */
  element?: Element
  /** Weakness tags (弱斩/弱突/弱打/弱魔). */
  physWeak?: PhysKind[]
  physResist?: PhysKind[]
  /** Difficulty archetype → TTK budget + move rotation. Default: primary=elite, adds=mook. */
  archetype?: EnemyArchetype
  /** §26 — phase transitions for the PRIMARY enemy (clamped on coerce; escorts never get phases). */
  phases?: BossPhase[]
  /** §32 — battle-figure art key override. Unauthored → the antagonist id (canon enemies get art
   *  for free once a file lands at /sprites/enemies/<antagonistId>.png). */
  artSet?: string
}

/** One escort enemy in a team encounter (the primary's fields live on EncounterSpec). */
export interface EncounterAdd {
  enemyName: string
  enemyTheme: string
  antagonistId?: string
  hpScale: number
  defScale: number
  element?: Element
  physWeak?: PhysKind[]
  physResist?: PhysKind[]
  archetype?: EnemyArchetype
  /** §32 — battle-figure art key override (see EncounterSpec.artSet). */
  artSet?: string
}

export interface QuestReward {
  equipmentDefIds: string[] // → EQUIPMENT_DEFS (validated; unknown dropped)
  unlockCompanionIds: string[] // → COMPANION_DEFS (validated to the world's roster)
  playerXp?: number
}

/** A generated/authored quest before runtime fields are assigned. */
export interface QuestBlueprint {
  title: string
  lore: string
  encounters: Omit<EncounterSpec, 'index'>[]
  reward: QuestReward
}

// ---------- Script (branching campaign, §23) ----------

/** One selectable option after a boss, in a ScriptChoice. */
export interface ScriptChoiceOption {
  id: string
  label: string
  description: string
  /** Chapter id to advance to; null ends the campaign on this option. */
  nextChapterId: string | null
  /** Persistent story flags this option sets (merged into GameState.scriptFlags). */
  setFlags?: Record<string, string | boolean>
  /** Companions this option recruits (e.g. a rescued character becomes joinable). */
  unlockCompanionIds?: string[]
  /** Equipment this option grants. */
  equipmentDefIds?: string[]
}

/** A post-boss branch point: prompt + 2–4 options. */
export interface ScriptChoice {
  prompt: string
  options: ScriptChoiceOption[]
}

/** A chapter in a script = a QuestBlueprint (so it runs through the EXISTING quest pipeline
 *  unchanged) plus an id and a transition. `next`:
 *  - string       → linear advance to that chapter id
 *  - ScriptChoice → pause for a player choice after the chapter's final boss
 *  - null         → campaign finale (ends properly; no endless spawn). */
export interface ScriptChapter extends QuestBlueprint {
  id: string
  next: string | ScriptChoice | null
}

/** Declares a meaningful persistent flag + its narrative meaning, for AI injection + UI. */
export interface ScriptFlagDef {
  key: string
  /** Human/AI-facing meaning, e.g. 「蕾贝卡是否生还」. */
  description: string
  /** Optional enumerated values with meaning, e.g. { rescued: '被救下，成为可招募同伴', dead: '战死' }. */
  values?: Record<string, string>
}

/** A branching campaign skeleton for a world (authored; the in-app AI improvises within it). */
export interface ScriptDef {
  id: string
  worldId: WorldId
  title: string
  synopsis: string
  startChapterId: string
  chapters: Record<string, ScriptChapter>
  /** The meaningful persistent flags, declared so the AI + UI know what they mean. */
  flags?: ScriptFlagDef[]
}

/** A saved, replayable 副本 = a frozen ScriptDef snapshot + library metadata. */
export interface DungeonRecord {
  id: ID
  /** The frozen script this dungeon replays (snapshot at save time). */
  script: ScriptDef
  worldId: WorldId
  label: string
  savedAt: string
  /** The flag-state the player ended with (for the library card summary; NOT replayed). */
  completedFlags?: Record<string, string | boolean>
}

export type QuestStatus = 'available' | 'active' | 'completed'

export interface Quest {
  id: ID
  worldId: WorldId
  title: string
  lore: string
  encounters: EncounterSpec[] // ordered
  reward: QuestReward
  status: QuestStatus
  generatedAt: string
  generatedByModel: string
  schemaVersion: 1
}

export interface Buff {
  id: ID
  kind: string
  magnitude: number
  expiresAfterBattles: number
}

/** Finite companion mood-flag set (§21). Biases next greeting/canned line + expression. */
export type MoodFlag = 'idle' | 'worried' | 'proud' | 'concerned'

/** Current combat resources for one character. A MISSING entry in GameState.resources
 *  means "full" — so new characters, recruits, and pre-resource saves all read as full. */
export interface CharResource {
  hp: number
  mp: number
}

/** A party-wide combat modifier. Skill buffs decay over N todo completions (`turnsLeft`);
 *  habit buffs/debuffs persist until the next victory (`untilVictory`). A NEGATIVE magnitude
 *  is a debuff of the same kind. atkPct is applied in the attack mult; def/spd/magPct flow
 *  through effectiveStats. */
export interface PartyBuff {
  id: ID
  kind: 'atkPct' | 'defPct' | 'spdPct' | 'magPct'
  magnitude: number
  /** Remaining todo-completions before it expires (skill buffs). Omitted for `untilVictory`. */
  turnsLeft?: number
  /** Habit buff/debuff: cleared on the next battle victory; ignored by completion-decay. */
  untilVictory?: boolean
  /** Companion who cast it (skill buffs, for flavor/UI). */
  sourceId?: ID
  /** Display label for habit buffs/debuffs (e.g. 「利刃」). */
  label?: string
}

/** One rendered line in a combat-log round (display strings resolved at log time). */
export interface CombatLogLine {
  icon: string
  text: string
  tone?: 'good' | 'bad' | 'info'
}

/** One round of combat history (a single dispatch), shown in the expandable log. */
export interface CombatLogEntry {
  id: ID
  at: string // ISO time the round resolved
  enemy: string // resolved enemy name this round
  lines: CombatLogLine[]
}

/** One actor in the CTB turn order: a party member or the enemy. */
export interface TurnActor {
  side: 'party' | 'enemy'
  id: ID
}

/** A combat/economy effect emitted by the reducer (consumed by the store for floats/toasts and
 *  by the combat log). Lives here (rather than in the reducer) so GameState.activeRound can
 *  reference it without a domain→game import. */
export type GameEffect =
  // §25 flags on damage: missed (真实Miss, amount 0), crit (会心), typeMult (≠1 → 效果拔群/不佳)
  | { type: 'damage'; amount: number; monsterHpAfter: number; actorId: ID; targetId: ID; fromSkill?: boolean; missed?: boolean; crit?: boolean; typeMult?: number }
  | { type: 'monsterGrew'; hpDelta: number; atkDelta: number }
  | { type: 'affinity'; characterId: ID; amount: number; rankedUpTo: string | null }
  | { type: 'charXp'; characterId: ID; amount: number; levelsGained: number }
  | { type: 'victory'; defeatedMonsterId: ID; storyStage: number; nextEnemyHp?: number }
  | { type: 'mood'; characterId: ID; flag: MoodFlag }
  // Active combat (skills / enemy turn-attacks / resources)
  | { type: 'skillCast'; skillId: SkillId; casterId: ID; skillKind: 'attack' | 'heal' | 'buff' | 'debuff'; amount: number; monsterHpAfter?: number; targetId?: ID; missed?: boolean; crit?: boolean; typeMult?: number }
  | { type: 'heal'; targetId: ID; amount: number }
  | { type: 'enemyAttack'; targetId: ID; amount: number; missed?: boolean; heavy?: boolean; enemyId?: ID } // §32 enemyId = the striker (absent on sourceless penalty hits)
  // §25: the enemy's NEXT move is a telegraphed wind-up (HUD warning banner).
  | { type: 'enemyTelegraph'; enemyId: ID; text: string }
  | { type: 'downed'; characterId: ID }
  | { type: 'partyWiped'; monsterHealed?: number; monsterHpAfter?: number }
  // Worldview / storyline (§22)
  | { type: 'encounterCleared'; questId: ID; encounterIndex: number; victoryText?: string; nextEnemy?: string }
  | { type: 'questCompleted'; questId: ID; reward: QuestReward }
  | { type: 'recruited'; companionId: ID }
  | { type: 'equipmentGranted'; defId: string; instanceId: ID }
  // Script branching (§23)
  | { type: 'scriptChoiceOffered'; prompt: string; options: ScriptChoiceOption[] }
  | { type: 'scriptChapterAdvanced'; chapterId: string; firstEnemy?: string }
  | { type: 'scriptCompleted'; scriptId: string; flags: Record<string, string | boolean> }
  // §28 growth systems
  | { type: 'talentLearned'; characterId: ID; nodeId: string }
  | { type: 'duoSkillCast'; skillId: string; casterIds: [ID, ID]; amount: number; targetId?: ID; missed?: boolean; crit?: boolean }
  | { type: 'habitMilestone'; habitId: ID; streak: number; rewardText: string }
  /** §28 counter riposte: the dodger strikes back at the attacking enemy. */
  | { type: 'counter'; characterId: ID; targetId: ID; amount: number; missed?: boolean }
  // §26 status effects + boss phases
  | { type: 'statusApplied'; targetId: ID; kind: StatusKind; rounds: number; sourceId?: ID }
  /** DOT damage / HOT heal resolved at round end. amount = HP lost (poison/burn) or gained (regen). */
  | { type: 'statusTick'; targetId: ID; kind: StatusKind; amount: number; hpAfter: number }
  | { type: 'statusExpired'; targetId: ID; kind: StatusKind }
  /** A slept/paralyzed combatant lost its action this round. */
  | { type: 'statusSkipped'; targetId: ID; kind: StatusKind }
  /** A member took the 防御 stance (1-round guard status; halves incoming hits). */
  | { type: 'guarded'; characterId: ID }
  | { type: 'bossPhase'; enemyId: ID; phaseLabel?: string; narration?: string }

/** An in-progress interactive (FF-style step-through) round. Present only while the player is
 *  resolving turns; cleared at finalize. Persisted in GameState so a refresh mid-round resumes. */
export interface ActiveRound {
  priority: Priority
  /** Basic-attack damage multiplier, frozen at round start. */
  mult: number
  /** Full CTB order for the round (party + enemy + laps). */
  order: TurnActor[]
  /** Post-round persistent CTB gauges, committed at finalize. */
  charges: Record<ID, number>
  /** partyBuffs at round start — the frozen combat context for every turn this round. */
  buffsAtStart: PartyBuff[]
  /** §26 — activeStatuses snapshot at round start. STAT folds (slow→spd) read this frozen
   *  view so the step-through matches the sync path exactly; ACTION gates (sleep/guard)
   *  read live state. Optional for save-compat (missing → falls back to live state). */
  statusesAtStart?: Record<ID, CombatStatus[]>
  /** Index of the next turn to resolve (0..order.length). */
  index: number
  /** Party ids that have taken their first turn this round (distinguishes skill from lap). */
  actedFirstTurn: ID[]
  /** Combat effects accumulated across steps → built into one combat-log entry at finalize. */
  effects: GameEffect[]
  /** gold + enemy-team snapshots at round start (for the finalize combat-log line). */
  goldAtStart: number
  enemiesAtStart: Monster[]
  /** The todo whose completion owns this round. */
  todoId: ID
}

export interface GameState {
  partyIds: ID[] // player + companions; partyIds[0]=player, partyIds[1]=lead; ≤6
  /** @deprecated migration-only — read via gs.enemies. Backfilled into enemies[0] then collapsed. */
  monster?: Monster
  /** Source of truth for the current encounter's enemy team. enemies[0] = primary/boss; rest = adds. */
  enemies: Monster[]
  /** Monotonic difficulty dial feeding spawnMonster (NOT the narrative pointer). */
  storyStage: number
  /** Idempotent guard for the WHOLE-TEAM clear payout: `${activeQuestId ?? 'endless'}:${encounterIndex}`.
   *  Set when an encounter's clear cascade fires; checked before re-firing (replaces defeatedMonsterId). */
  clearedEncounterKey?: ID
  buffs: Buff[]
  /** companionId -> current mood flag */
  moodFlags: Record<ID, MoodFlag>
  lastResolvedAt: string
  /** YYYY-MM-DD local of last greeting shown. */
  lastGreetedDate?: string
  /** YYYY-MM-DD local of the last day journaling paid its reward (XP/affinity). The first
   *  entry of a new day pays; later same-day entries are free to write (no farming). */
  lastJournalRewardOn?: string

  // --- Worldview / storyline (§22) ---
  activeWorldId?: WorldId
  activeQuestId?: ID
  /** Active branching script (§23). When set, supersedes the linear storyChapters path. */
  activeScriptId?: string
  /** Current chapter id within the active script (§23). */
  currentChapterId?: string
  /** Persistent story flags for the whole campaign — injected into ALL AI context. Default {}. */
  scriptFlags: Record<string, string | boolean>
  /** §24: scriptIds whose finale (finishScript) has been reached at least once. Drives the
   *  「已通过」badge and gates startQuest's defaultScriptId auto-redirect so a cleared campaign
   *  is NOT silently relaunched — replay must be explicit. Survives replays (never cleared here).
   *  Default []. */
  completedScriptIds: string[]
  /** Narrative pointer into the active quest's encounters. */
  encounterIndex: number
  /** All recruited companions (superset of companions in partyIds). */
  unlockedCompanionIds: ID[]
  ownedEquipment: OwnedEquipment[]

  // --- Active combat + economy (skills/MP/HP/gold) ---
  /** Current HP/MP per character. Missing entry = full (max from the character's stats). */
  resources: Record<ID, CharResource>
  /** Spendable currency, earned from todos/victories/quests, spent in the shop. */
  gold: number
  /** Active party-wide combat buffs from skills (decay over completions). */
  partyBuffs: PartyBuff[]
  /** Append-only combat history (capped); each entry is one resolved round. */
  combatLog: CombatLogEntry[]
  /** Persistent charge-time gauges per combatant (character or monster id). Each fills by spd
   *  and CARRIES ACROSS completions (the turn-order timeline loops). Missing entry = 0. */
  charge: Record<ID, number>
  /** Per party member: the action performed when the next completed task executes the round —
   *  a chosen SkillId, the GUARD_ACTION sentinel ('guard' = 防御), or a MISSING entry = basic
   *  attack. Persists across tasks (set-and-forget); a planned skill that can't be paid at
   *  execution falls back to a basic attack. */
  roundPlan: Record<ID, SkillId>
  /** §26 — live statuses per combatant id (party members AND enemies). Missing/empty = none.
   *  Optional for save-compat; withGameStateDefaults backfills {}. */
  activeStatuses?: Record<ID, CombatStatus[]>
  /** §28 — learned talent node ids per character. Optional; backfilled {}. */
  learnedTalents?: Record<ID, string[]>
  /** §28 — unspent talent points per character (1 earned per 5 levels). Optional; backfilled {}. */
  talentPoints?: Record<ID, number>
  /** An interactive round mid-resolution (FF-style step-through). Absent when idle. */
  activeRound?: ActiveRound
}

// ---------- Chat ----------

export interface ChatThread {
  id: ID
  type: 'solo' | 'group'
  memberIds: ID[] // companion ids (player is implicit)
  title?: string
  createdAt: string
}

export interface ChatMessage {
  id: ID
  threadId: ID
  sender: 'player' | 'system' | ID // ID = companion id
  text: string
  /** companion senders only */
  expression?: ExpressionKey
  createdAt: string
}

// ---------- Settings ----------

export interface Settings {
  apiKey?: string
  model: string
  language: 'zh-CN' | 'en'
  theme: string
  /** §25 layered depth — UI-ONLY switch (the full engine always runs underneath):
   *  'simple' (default) hides advanced stats/weakness intel; 'deep' surfaces the
   *  10-stat sheet, derived 物攻/物防/魔攻/魔防, enemy weakness icons + 蓄力 banner. */
  combatDepth?: 'simple' | 'deep'
  /** §26 smart auto tactics (效率优先): when ON, members with NO explicit plan/choice pick
   *  sensible defaults on their own — heal the hurt, cleanse the afflicted, guard at low HP,
   *  burst a sleeping enemy — so light players are never asked to micromanage. An explicit
   *  roundPlan/choice always wins. Backfilled to true by the settings store. */
  autoTactics?: boolean
  /** §27 battle FX overlay (PixiJS particles + screen shake). Default ON; prefers-reduced-motion
   *  always wins. Off = the DOM battle stage exactly as before. */
  battleFx?: boolean
  /** §27 synth SFX volume 0–100 (default 70; 0 = silent). */
  sfxVolume?: number
  /** §30 chiptune BGM volume 0–100. Default 0 (OFF — a productivity app must not sing
   *  uninvited); the settings slider opts in. */
  bgmVolume?: number
  /** §29 cumulative token usage since `since` (cost meter; reset from the settings panel). */
  tokenUsage?: { input: number; output: number; cacheRead: number; cacheWrite: number; since: string }
}

// ---------- Save / backup ----------

/** A full snapshot of every IndexedDB store — the unit of file export/import (backup.ts)
 *  and the frozen body of a save slot. Fields are `unknown[]`/`unknown` so this type stays
 *  decoupled from each store's evolving shape; read-time defaulting backfills on restore. */
export interface BackupPayload {
  app: 'fantasy-traveler'
  dbVersion: number
  exportedAt: string
  characters: unknown[]
  todos: unknown[]
  journalEntries: unknown[]
  calendarEvents: unknown[]
  affinity: unknown[]
  chatThreads: unknown[]
  chatMessages: unknown[]
  quests: unknown[]
  habits: unknown[]
  dungeons: unknown[]
  gameState: unknown | null
  settings: unknown | null
  meta: unknown | null
}

/** A named in-app save slot: a frozen BackupPayload plus metadata. Lives in its own `saves`
 *  store, which is deliberately NOT in backup.ts's ALL_STORES — so restoring one slot (or
 *  清空数据) never wipes the OTHER slots, and file exports don't recurse into the slots. */
export interface SaveSlot {
  id: ID
  name: string
  createdAt: string
  savedAt: string // last time the live game state was captured into this slot
  dbVersion: number
  bytes: number // approx UTF-8 size of the payload, shown as a UI hint
  payload: BackupPayload
}
