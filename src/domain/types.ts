// Core domain entities for Fantasy Traveler. Shared across modules to avoid cycles.
// See docs/specs/2026-05-29-fantasy-traveler-design.md §6 and §21.

export type ID = string

// ---------- Characters & classes ----------

export type ClassId =
  | 'vanguard'
  | 'guardian'
  | 'striker'
  | 'arcanist'
  | 'tactician'
  | 'medic'

export type SkillId = string // skill ids = nameKey suffix, e.g. "liuguang"

export interface Stats {
  level: number
  xp: number
  maxHp: number
  /** Magic resource pool. Bound to the class's magic focus (casters get more). */
  maxMp: number
  atk: number
  def: number
  spd: number
  /** Magic attack power (spell damage), distinct from the maxMp pool. */
  mag: number
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

// ---------- Game state ----------

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
  atk: number
  def: number
  /** CTB speed — fills the charge gauge; higher acts earlier each round and can lap (套圈) for
   *  extra turns. Set at spawn; backfilled for pre-speed saves. */
  spd: number
  /** flavor growth marker; combat scaling lives in config */
  growth: number
}

// ---------- World / Quest (§22) ----------

export type WorldId = string

export interface OwnedEquipment {
  instanceId: ID
  defId: string // → EQUIPMENT_DEFS
  equippedBy?: ID // characterId, or undefined if in the stash
  acquiredAt: string
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
}

/** One escort enemy in a team encounter (the primary's fields live on EncounterSpec). */
export interface EncounterAdd {
  enemyName: string
  enemyTheme: string
  antagonistId?: string
  hpScale: number
  defScale: number
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
  | { type: 'damage'; amount: number; monsterHpAfter: number; actorId: ID; targetId: ID; fromSkill?: boolean }
  | { type: 'monsterGrew'; hpDelta: number; atkDelta: number }
  | { type: 'affinity'; characterId: ID; amount: number; rankedUpTo: string | null }
  | { type: 'charXp'; characterId: ID; amount: number; levelsGained: number }
  | { type: 'victory'; defeatedMonsterId: ID; storyStage: number; nextEnemyHp?: number }
  | { type: 'mood'; characterId: ID; flag: MoodFlag }
  // Active combat (skills / enemy turn-attacks / resources)
  | { type: 'skillCast'; skillId: SkillId; casterId: ID; skillKind: 'attack' | 'heal' | 'buff' | 'debuff'; amount: number; monsterHpAfter?: number; targetId?: ID }
  | { type: 'heal'; targetId: ID; amount: number }
  | { type: 'enemyAttack'; targetId: ID; amount: number }
  | { type: 'downed'; characterId: ID }
  | { type: 'partyWiped'; monsterHealed?: number; monsterHpAfter?: number }
  // Worldview / storyline (§22)
  | { type: 'encounterCleared'; questId: ID; encounterIndex: number; victoryText?: string; nextEnemy?: string }
  | { type: 'questCompleted'; questId: ID; reward: QuestReward }
  | { type: 'recruited'; companionId: ID }
  | { type: 'equipmentGranted'; defId: string; instanceId: ID }

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
   *  a chosen SkillId, or a MISSING entry = basic attack. Persists across tasks (set-and-forget);
   *  a planned skill that can't be paid at execution falls back to a basic attack. */
  roundPlan: Record<ID, SkillId>
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
}
