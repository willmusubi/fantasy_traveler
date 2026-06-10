import { create } from 'zustand'
import { rankForPoints } from '../companion/affinity'
import { COMPANION_DEFS, createCompanionCharacter, createPlayer, PRIMARY_COMPANION_ID } from '../companion/roster'
import { SKILL_DEFS } from '../companion/skills'
import { affinityRepo, charactersRepo, dungeonsRepo, gameStateRepo, questsRepo } from '../data/repositories'
import { HABIT_BUFF_ACTIVE_CAP, HABIT_BUFF_CHOICES, HABIT_BUFF_POOL, HABIT_DEBUFF_POOL, type HabitBuffDef } from '../domain/config'
import { localDateKey } from '../domain/dates'
import type { Affinity, Character, DungeonRecord, ExpressionKey, GameState, ID, PartyBuff, Priority, Quest, ScriptChoiceOption, SkillId, Todo, WorldId } from '../domain/types'
import { materializeQuest } from '../ai/storyline'
import { spawnMonster, teamFromEncounter } from '../game/combat'
import { dispatchEvent } from '../game/pipeline'
import type { ReducerResult } from '../game/reducer'
import { t } from '../i18n'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { SHOP_POTIONS } from '../world/shop'
import { registerRuntimeScript, scriptDefFor } from '../world/worlds'
import { useSettings } from './settingsStore'
import { fireCompletionReaction, useTodos } from './todoStore'

export interface Toast {
  id: string
  kind: 'victory' | 'levelup' | 'rankup' | 'warn' | 'info' | 'recruit' | 'loot' | 'quest'
  text: string
}

export interface Reaction {
  key: number
  companionId: string
  text: string
  expression: ExpressionKey
  affinityDelta: number
}

/** Aggregated rewards from defeating an enemy — drives the victory settlement window. */
export interface VictorySummary {
  key: number
  enemy: string
  xp: number
  gold: number
  levelUps: { name: string; level: number }[]
  loot: string[]
  recruits: string[]
  narration?: string
  nextEnemy?: string
  questComplete: boolean
}

/** A pending "choose 1 of N buffs" draft, offered when a daily habit is completed. */
export interface BuffChoice {
  key: number
  options: HabitBuffDef[]
}

interface GameStore {
  ready: boolean
  gameState: GameState | null
  characters: Character[]
  affinities: Record<string, Affinity>
  reaction: Reaction | null
  toasts: Toast[]
  /** Per-enemy floating damage: enemyId → latest {amount,key} (+§25 flags: 会心/拔群/不佳/未命中).
   *  Keyed so each card re-animates. */
  lastDamageByEnemy: Record<ID, { amount: number; key: number; crit?: boolean; weak?: boolean; resist?: boolean; missed?: boolean }>
  /** Transient (NOT persisted) target the player picked for the current step-through turn. The
   *  step-through picker + enemy cards read/write it; passed to advanceRound for single-target acts. */
  combatTargetId: ID | null
  activeQuest: Quest | null
  /** Set by ingestResult when a quest is completed/recruit happens, for the UI to show. */
  recruitedId: string | null
  /** Set by ingestResult when an enemy is defeated — drives the victory settlement window. */
  victorySummary: VictorySummary | null
  /** Queue of pending habit buff drafts (one per habit completion). Transient — not persisted. */
  pendingBuffChoices: BuffChoice[]
  /** A pending post-boss branch choice (§23). Transient — surfaced by a scriptChoiceOffered effect. */
  pendingScriptChoice: { prompt: string; options: ScriptChoiceOption[] } | null
  /** Set when a campaign finishes (§23) — drives the save-as-副本 / replay / return prompt. */
  scriptCompletion: { scriptId: string; flags: Record<string, string | boolean> } | null

  hydrate: () => Promise<void>
  seedNewGame: (name: string) => Promise<void>
  ingestResult: (result: ReducerResult) => { affinityDelta: number }
  showReaction: (r: Omit<Reaction, 'key'>) => void
  clearReaction: () => void
  clearRecruited: () => void
  clearVictory: () => void
  removeToast: (id: string) => void
  /** Offer a buff draft (draw HABIT_BUFF_CHOICES from the pool) — enqueued for the modal. */
  offerBuffChoice: () => void
  /** Apply the chosen buff from the head draft (untilVictory, FIFO-capped) and dequeue it. */
  chooseBuff: (optionId: string) => Promise<void>
  /** Dequeue the head draft without applying (forfeit). */
  dismissBuffChoice: () => void
  /** §23: resolve a post-boss branch choice (dispatch ScriptChoicePicked; hydrate on recruit/advance). */
  chooseScriptOption: (optionId: string) => Promise<void>
  /** §23: dismiss the campaign-complete prompt. */
  clearScriptCompletion: () => void
  /** §23: save the active (or just-finished) campaign as a replayable 副本. */
  saveActiveAsDungeon: (label: string) => Promise<void>
  /** §23: enter/replay a saved 副本 from its start (resets script progress + flags). */
  enterDungeon: (id: string) => Promise<void>
  /** Apply one random debuff (untilVictory) — fired when a habit's streak breaks. */
  applyRandomDebuff: () => Promise<void>
  /** Plan a party member's action for the next task-executed round: a SkillId, or null = basic
   *  attack. Persists; used as the default in the step-through picker and by auto-resolve. */
  setRoundAction: (memberId: ID, skillId: SkillId | null) => Promise<void>
  /** Whether combat resolves as an interactive step-through (FF-style). Enabled by the running app;
   *  left false in tests/headless so completion uses the synchronous whole-round path. */
  steppingEnabled: boolean
  setSteppingEnabled: (on: boolean) => void
  /** Begin an interactive round for a just-completed (already marked done) todo. */
  beginInteractiveRound: (todo: Todo) => Promise<void>
  /** Resolve the paused ally's turn with `choice` (a SkillId or 'basic') against `targetId` (the
   *  chosen enemy; omit for AoE / to auto-target), then auto-run enemy/lap turns to the next
   *  decision or finalize. */
  advanceRound: (choice?: SkillId | 'basic', targetId?: ID) => Promise<void>
  /** Resolve all remaining turns of the active round using each member's roundPlan default. */
  autoResolveRound: () => Promise<void>
  /** Set (or clear) the transient step-through target the player picked. */
  setCombatTarget: (id: ID | null) => void
  // Worldview management (§22)
  setParty: (companionIds: ID[]) => Promise<void>
  /** Switch the active world (the story IP). Disallowed mid-quest. */
  setWorld: (worldId: WorldId) => Promise<void>
  equip: (instanceId: ID, characterId: ID) => Promise<void>
  unequip: (instanceId: ID) => Promise<void>
  // Shop (gold sink)
  buyPotion: (potionId: string) => Promise<void>
  buyEquipment: (defId: string) => Promise<void>
}

let reactionKey = 0
function tid(): string {
  return `${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

/** Draw HABIT_BUFF_CHOICES distinct buff options (Fisher-Yates on a copy). */
function drawBuffOptions(): HabitBuffDef[] {
  const pool = [...HABIT_BUFF_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, HABIT_BUFF_CHOICES)
}

/** Append a habit buff/debuff, enforcing the active cap (FIFO-evict the oldest untilVictory). */
function withCappedBuff(partyBuffs: PartyBuff[], buff: PartyBuff): PartyBuff[] {
  const next = [...partyBuffs, buff]
  const run = next.filter((b) => b.untilVictory)
  if (run.length <= HABIT_BUFF_ACTIVE_CAP) return next
  const oldest = run[0]
  return next.filter((b) => b !== oldest)
}

export function selectPlayer(s: GameStore): Character | undefined {
  return s.characters.find((c) => c.kind === 'player')
}
export function selectPrimaryCompanion(s: GameStore): Character | undefined {
  return (
    s.characters.find((c) => c.id === PRIMARY_COMPANION_ID) ??
    s.characters.find((c) => c.kind === 'companion')
  )
}
/** All on-field companions, in party order (the pool a random reaction is drawn from). */
export function selectPartyCompanions(s: GameStore): Character[] {
  const gs = s.gameState
  if (!gs) return []
  return gs.partyIds
    .map((id) => s.characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c) && c!.kind === 'companion')
}

/** The lead companion = first companion in party order (the reaction/chat focus). */
export function selectLeadCompanion(s: GameStore): Character | undefined {
  const gs = s.gameState
  if (!gs) return selectPrimaryCompanion(s)
  for (const id of gs.partyIds) {
    const c = s.characters.find((ch) => ch.id === id)
    if (c?.kind === 'companion') return c
  }
  return selectPrimaryCompanion(s)
}

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  gameState: null,
  characters: [],
  affinities: {},
  reaction: null,
  toasts: [],
  lastDamageByEnemy: {},
  combatTargetId: null,
  activeQuest: null,
  recruitedId: null,
  victorySummary: null,
  pendingBuffChoices: [],
  pendingScriptChoice: null,
  scriptCompletion: null,
  steppingEnabled: false,

  async hydrate() {
    const [characters, gameState, affList, activeQuest] = await Promise.all([
      charactersRepo.all(),
      gameStateRepo.get(),
      affinityRepo.all(),
      questsRepo.active(),
    ])
    const affinities = Object.fromEntries(affList.map((a) => [a.characterId, a]))
    set({ characters, gameState: gameState ?? null, affinities, activeQuest: activeQuest ?? null, ready: true })
  },

  async seedNewGame(name) {
    const now = new Date()
    const today = localDateKey(now)
    const player = createPlayer(name, now, () => crypto.randomUUID())
    const companion = createCompanionCharacter(PRIMARY_COMPANION_ID, now)

    // Demo seed: primary companion starts near the B threshold so a couple of
    // completions trigger a visible rank-up (success criterion #3).
    const seededPoints = 90
    const affinity: Affinity = {
      characterId: companion.id,
      points: seededPoints,
      rank: rankForPoints(seededPoints, true),
      unlockedSupports: [],
      dailyGained: 0,
      dailyGainedOn: today,
    }

    const enemies = [spawnMonster(0, 0, () => crypto.randomUUID())]
    const gameState: GameState = {
      partyIds: [player.id, companion.id],
      enemies,
      storyStage: 0,
      buffs: [],
      moodFlags: {},
      lastResolvedAt: now.toISOString(),
      activeWorldId: companion.worldId,
      encounterIndex: 0,
      unlockedCompanionIds: [companion.id],
      ownedEquipment: [
        { instanceId: crypto.randomUUID(), defId: 'practice_dagger', acquiredAt: now.toISOString() },
      ],
      resources: {}, // everyone starts full
      gold: 0,
      partyBuffs: [],
      combatLog: [],
      charge: {}, // CTB gauges start empty
      roundPlan: {}, // every member basic-attacks until you assign a skill
      scriptFlags: {}, // §23: no story flags at start
      completedScriptIds: [], // §24: no campaigns cleared yet
    }

    await charactersRepo.putMany([player, companion])
    await affinityRepo.put(affinity)
    await gameStateRepo.put(gameState)

    set({
      characters: [player, companion],
      affinities: { [companion.id]: affinity },
      gameState,
      ready: true,
    })
  },

  ingestResult(result) {
    const prev = get()
    const characters = prev.characters.map((c) =>
      result.characterStats[c.id] ? { ...c, stats: result.characterStats[c.id] } : c,
    )
    const affinities = { ...prev.affinities, ...result.affinities }

    // An enemy was defeated this round → its rewards are folded into the victory
    // settlement window instead of firing individual corner toasts.
    const isDefeat = result.effects.some((e) => e.type === 'victory' || e.type === 'encounterCleared')
    const playerId = characters.find((c) => c.kind === 'player')?.id

    const toasts: Toast[] = []
    let affinityDelta = 0
    const dmgByEnemy: Record<string, number> = {}
    const dmgMeta: Record<string, { crit?: boolean; weak?: boolean; resist?: boolean; missed?: boolean }> = {}
    let recruitedId: string | null = null
    // Settlement accumulators.
    let victoryXp = 0
    const victoryGold = Math.max(0, result.gameState.gold - (prev.gameState?.gold ?? 0))
    const leveledIds = new Set<string>()
    const loot: string[] = []
    const recruits: string[] = []
    let narration: string | undefined
    let nextEnemy: string | undefined
    let questComplete = false
    let scriptChoice: { prompt: string; options: ScriptChoiceOption[] } | null = null
    let scriptDone: { scriptId: string; flags: Record<string, string | boolean> } | null = null

    for (const e of result.effects) {
      if (e.type === 'damage') {
        dmgByEnemy[e.targetId] = (dmgByEnemy[e.targetId] ?? 0) + e.amount
        // §25 float flags (per-enemy, per-round): any crit/weak hit wins; missed only counts
        // when nothing landed on that enemy this round.
        const meta = (dmgMeta[e.targetId] ??= {})
        if (e.crit) meta.crit = true
        if (e.typeMult !== undefined && e.typeMult > 1) meta.weak = true
        if (e.typeMult !== undefined && e.typeMult < 1) meta.resist = true
        if (e.missed) meta.missed = true
      } else if (e.type === 'enemyTelegraph') {
        toasts.push({ id: tid(), kind: 'warn', text: `⚡ 敌人正在${e.text}——下一击非同小可！` })
      } else if (e.type === 'affinity') {
        affinityDelta += e.amount
        if (e.rankedUpTo) {
          const comp = characters.find((c) => c.id === e.characterId)
          toasts.push({ id: tid(), kind: 'rankup', text: `💗 与${comp?.name ?? '伙伴'}的羁绊提升到 ${e.rankedUpTo}！` })
        }
      } else if (e.type === 'charXp') {
        if (e.characterId === playerId) victoryXp += e.amount
        if (e.levelsGained > 0) {
          leveledIds.add(e.characterId)
          if (!isDefeat) {
            const who = characters.find((c) => c.id === e.characterId)
            toasts.push({ id: tid(), kind: 'levelup', text: `🎉 ${who?.name ?? '你'} 升到了 Lv.${who?.stats.level}！` })
          }
        }
      } else if (e.type === 'monsterGrew') {
        toasts.push({ id: tid(), kind: 'warn', text: `⚠️ 拖延让对手更强了，还趁机反扑！` })
      } else if (e.type === 'encounterCleared') {
        if (e.victoryText) narration = e.victoryText
        if (e.nextEnemy) nextEnemy = e.nextEnemy
      } else if (e.type === 'questCompleted') {
        questComplete = true
      } else if (e.type === 'scriptChoiceOffered') {
        scriptChoice = { prompt: e.prompt, options: e.options } // §23: surface the post-boss modal
      } else if (e.type === 'scriptChapterAdvanced') {
        if (e.firstEnemy) nextEnemy = e.firstEnemy // §23: next chapter's first foe (victory window)
      } else if (e.type === 'scriptCompleted') {
        scriptDone = { scriptId: e.scriptId, flags: e.flags } // §23: drives the campaign-complete prompt
      } else if (e.type === 'recruited') {
        recruitedId = e.companionId
        recruits.push(COMPANION_DEFS[e.companionId]?.name ?? e.companionId)
      } else if (e.type === 'equipmentGranted') {
        loot.push(t(EQUIPMENT_DEFS[e.defId]?.nameKey ?? e.defId))
      } else if (e.type === 'victory') {
        // folded into the settlement window
      } else if (e.type === 'skillCast') {
        const name = t(SKILL_DEFS[e.skillId]?.nameKey ?? e.skillId)
        const who = characters.find((c) => c.id === e.casterId)?.name ?? '伙伴'
        const detail =
          e.skillKind === 'attack' ? `造成 ${e.amount} 伤害`
          : e.skillKind === 'heal' ? `恢复 ${e.amount} HP`
          : e.skillKind === 'buff' ? `全队攻击 +${e.amount}%`
          : `敌方防御 -${e.amount}%`
        toasts.push({ id: tid(), kind: 'info', text: `✦ ${who} 施放「${name}」，${detail}` })
      } else if (e.type === 'downed') {
        const who = characters.find((c) => c.id === e.characterId)?.name ?? '伙伴'
        toasts.push({ id: tid(), kind: 'warn', text: `✖ ${who} 被击倒了！` })
      } else if (e.type === 'partyWiped') {
        toasts.push({ id: tid(), kind: 'warn', text: `队伍被击溃，撤退重整旗鼓…` })
      }
    }

    let victorySummary = prev.victorySummary
    if (isDefeat) {
      const team = prev.gameState?.enemies ?? []
      const lead = team[0]
      const leadName = lead ? (lead.displayName ?? t(lead.nameKey)) : '敌人'
      const enemy = team.length > 1 ? `${leadName} 等` : leadName
      victorySummary = {
        key: ++reactionKey,
        enemy,
        xp: victoryXp,
        gold: victoryGold,
        levelUps: [...leveledIds].map((id) => {
          const c = characters.find((ch) => ch.id === id)
          return { name: c?.name ?? '伙伴', level: c?.stats.level ?? 1 }
        }),
        loot,
        recruits,
        narration,
        nextEnemy,
        questComplete,
      }
    }

    set({
      gameState: result.gameState,
      characters,
      affinities,
      activeQuest: result.gameState.activeQuestId ? prev.activeQuest : null,
      recruitedId: recruitedId ?? prev.recruitedId,
      victorySummary,
      pendingScriptChoice: scriptChoice ?? prev.pendingScriptChoice,
      scriptCompletion: scriptDone ?? prev.scriptCompletion,
      toasts: [...prev.toasts, ...toasts],
      lastDamageByEnemy: Object.keys(dmgByEnemy).length
        ? {
            ...prev.lastDamageByEnemy,
            ...Object.fromEntries(Object.entries(dmgByEnemy).map(([id, a]) => {
              const m = dmgMeta[id] ?? {}
              return [id, { amount: a, key: ++reactionKey, crit: m.crit, weak: m.weak, resist: m.resist, missed: a === 0 && m.missed ? true : undefined }]
            })),
          }
        : prev.lastDamageByEnemy,
    })
    return { affinityDelta }
  },

  showReaction(r) {
    set({ reaction: { ...r, key: ++reactionKey } })
  },
  clearReaction() {
    set({ reaction: null })
  },
  clearRecruited() {
    set({ recruitedId: null })
  },
  clearVictory() {
    set({ victorySummary: null })
  },
  removeToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  offerBuffChoice() {
    set({ pendingBuffChoices: [...get().pendingBuffChoices, { key: ++reactionKey, options: drawBuffOptions() }] })
  },

  async chooseBuff(optionId) {
    const gs = get().gameState
    const queue = get().pendingBuffChoices
    if (!gs || queue.length === 0) return
    const def = queue[0].options.find((o) => o.id === optionId)
    if (!def) return
    const buff: PartyBuff = {
      id: crypto.randomUUID(),
      kind: def.kind,
      magnitude: def.magnitude,
      untilVictory: true,
      label: def.label,
    }
    const next = { ...gs, partyBuffs: withCappedBuff(gs.partyBuffs, buff) }
    await gameStateRepo.put(next)
    set({
      gameState: next,
      pendingBuffChoices: queue.slice(1),
      toasts: [...get().toasts, { id: tid(), kind: 'loot', text: `${def.icon} 获得增益「${def.label}」：${def.desc}` }],
    })
  },

  dismissBuffChoice() {
    const queue = get().pendingBuffChoices
    if (queue.length === 0) return
    set({ pendingBuffChoices: queue.slice(1) })
  },

  async chooseScriptOption(optionId) {
    if (!get().pendingScriptChoice) return
    set({ pendingScriptChoice: null }) // optimistic close
    const result = await dispatchEvent({ type: 'ScriptChoicePicked', optionId })
    get().ingestResult(result)
    // A recruit (rescued character), a chapter materialize, or the finale → reload chars/quest/state.
    if (result.effects.some((e) => e.type === 'recruited' || e.type === 'scriptChapterAdvanced' || e.type === 'scriptCompleted')) {
      await get().hydrate()
    }
  },

  clearScriptCompletion() {
    set({ scriptCompletion: null })
  },

  async saveActiveAsDungeon(label) {
    const gs = get().gameState
    const completion = get().scriptCompletion
    const script = scriptDefFor(gs?.activeScriptId ?? completion?.scriptId)
    if (!gs || !script) return
    const record: DungeonRecord = {
      id: crypto.randomUUID(),
      script,
      worldId: script.worldId,
      label: label.trim() || script.title,
      savedAt: new Date().toISOString(),
      completedFlags: completion?.flags ?? gs.scriptFlags,
    }
    await dungeonsRepo.put(record)
    registerRuntimeScript(script) // keep it resolvable for an immediate replay
    set({ toasts: [...get().toasts, { id: tid(), kind: 'quest', text: `📜 已收藏副本「${record.label}」` }] })
  },

  async enterDungeon(id) {
    const gs = get().gameState
    const rec = await dungeonsRepo.get(id)
    if (!gs || !rec) return
    const script = rec.script
    const startCh = script.chapters[script.startChapterId]
    if (!startCh) return
    registerRuntimeScript(script) // so the pipeline can resolve this script's chapter transitions
    const openHigh = useTodos.getState().todos.filter((td) => td.status === 'open' && td.priority === 'high').length
    const model = useSettings.getState().settings.model
    const quest = materializeQuest(startCh, script.worldId, new Date(), () => crypto.randomUUID(), model)
    const enemies = teamFromEncounter(quest.encounters[0], gs.storyStage, openHigh, () => crypto.randomUUID())
    await questsRepo.put(quest)
    const next: GameState = {
      ...gs,
      activeWorldId: script.worldId,
      activeScriptId: script.id,
      currentChapterId: script.startChapterId,
      activeQuestId: quest.id,
      encounterIndex: 0,
      scriptFlags: {}, // fresh replay — clear the alternate history
      clearedEncounterKey: undefined,
      enemies,
    }
    await gameStateRepo.put(next)
    set({ scriptCompletion: null, pendingScriptChoice: null })
    await get().hydrate()
  },

  async applyRandomDebuff() {
    const gs = get().gameState
    if (!gs) return
    const def = HABIT_DEBUFF_POOL[Math.floor(Math.random() * HABIT_DEBUFF_POOL.length)]
    const debuff: PartyBuff = {
      id: crypto.randomUUID(),
      kind: def.kind,
      magnitude: def.magnitude,
      untilVictory: true,
      label: def.label,
    }
    const next = { ...gs, partyBuffs: withCappedBuff(gs.partyBuffs, debuff) }
    await gameStateRepo.put(next)
    set({ gameState: next, toasts: [...get().toasts, { id: tid(), kind: 'warn', text: `${def.icon} 漏了打卡，染上「${def.label}」…` }] })
  },

  async setRoundAction(memberId, skillId) {
    const gs = get().gameState
    if (!gs) return
    const roundPlan = { ...gs.roundPlan }
    if (skillId) roundPlan[memberId] = skillId
    else delete roundPlan[memberId] // null = basic attack (missing entry)
    const next = { ...gs, roundPlan }
    await gameStateRepo.put(next)
    set({ gameState: next })
  },

  setSteppingEnabled(on) {
    set({ steppingEnabled: on })
  },

  async beginInteractiveRound(todo) {
    // Marks the todo done in the SAME tx (like TodoCompleted) and sets up gs.activeRound, auto-running
    // any leading enemy turns and pausing at the first ally decision (the RoundResolver overlay takes over).
    const result = await dispatchEvent(
      { type: 'RoundBegan', todo },
      { prewrite: async ({ todos }) => void (await todos.put(todo)) },
    )
    get().ingestResult(result)
    await onRoundResolved(result, todo.priority) // no living ally to decide → finalized at begin
  },

  async advanceRound(choice, targetId) {
    const before = get().gameState?.activeRound
    if (!before) return
    const result = await dispatchEvent({ type: 'RoundAdvanced', choice, targetId })
    get().ingestResult(result)
    await onRoundResolved(result, before.priority)
  },

  setCombatTarget(id) {
    set({ combatTargetId: id })
  },

  async autoResolveRound() {
    const before = get().gameState?.activeRound
    if (!before) return
    const result = await dispatchEvent({ type: 'RoundAdvanced', auto: true })
    get().ingestResult(result)
    await onRoundResolved(result, before.priority)
  },

  async setParty(companionIds) {
    const gs = get().gameState
    if (!gs) return
    const player = gs.partyIds[0]
    const partyIds = [player, ...companionIds.filter((id) => id !== player)].slice(0, 6)
    const next = { ...gs, partyIds }
    await gameStateRepo.put(next)
    set({ gameState: next })
  },

  async setWorld(worldId) {
    const gs = get().gameState
    if (!gs || gs.activeQuestId || gs.activeWorldId === worldId) return // not mid-quest
    const next = { ...gs, activeWorldId: worldId }
    await gameStateRepo.put(next)
    set({ gameState: next })
  },

  async equip(instanceId, characterId) {
    const gs = get().gameState
    if (!gs) return
    const item = gs.ownedEquipment.find((e) => e.instanceId === instanceId)
    const def = item && EQUIPMENT_DEFS[item.defId]
    if (!def) return
    const ownedEquipment = gs.ownedEquipment.map((e) => {
      if (e.instanceId === instanceId) return { ...e, equippedBy: characterId }
      // Unequip any other item in the same slot on the same character.
      if (e.equippedBy === characterId && EQUIPMENT_DEFS[e.defId]?.slot === def.slot) {
        return { ...e, equippedBy: undefined }
      }
      return e
    })
    const next = { ...gs, ownedEquipment }
    await gameStateRepo.put(next)
    set({ gameState: next })
  },

  async unequip(instanceId) {
    const gs = get().gameState
    if (!gs) return
    const ownedEquipment = gs.ownedEquipment.map((e) =>
      e.instanceId === instanceId ? { ...e, equippedBy: undefined } : e,
    )
    const next = { ...gs, ownedEquipment }
    await gameStateRepo.put(next)
    set({ gameState: next })
  },

  async buyPotion(potionId) {
    const gs = get().gameState
    const item = SHOP_POTIONS.find((p) => p.id === potionId)
    if (!gs || !item || gs.gold < item.price) return
    const resources = { ...gs.resources }
    for (const id of gs.partyIds) {
      const c = get().characters.find((ch) => ch.id === id)
      if (!c) continue
      const cur = resources[id] ?? { hp: c.stats.maxHp, mp: c.stats.maxMp }
      let hp = cur.hp
      let mp = cur.mp
      if (item.effect.hp) hp = Math.min(c.stats.maxHp, hp + item.effect.hp)
      if (item.effect.mp) mp = Math.min(c.stats.maxMp, mp + item.effect.mp)
      if (item.effect.revive && hp <= 0) hp = Math.round(c.stats.maxHp * 0.5)
      resources[id] = { hp, mp }
    }
    const next = { ...gs, gold: gs.gold - item.price, resources }
    await gameStateRepo.put(next)
    set({ gameState: next, toasts: [...get().toasts, { id: tid(), kind: 'loot', text: `🧪 使用了 ${item.name}` }] })
  },

  async buyEquipment(defId) {
    const gs = get().gameState
    const def = EQUIPMENT_DEFS[defId]
    if (!gs || !def?.price || gs.gold < def.price) return
    const next = {
      ...gs,
      gold: gs.gold - def.price,
      ownedEquipment: [
        ...gs.ownedEquipment,
        { instanceId: crypto.randomUUID(), defId, acquiredAt: new Date().toISOString() },
      ],
    }
    await gameStateRepo.put(next)
    set({ gameState: next, toasts: [...get().toasts, { id: tid(), kind: 'loot', text: `◆ 购买了 ${t(def.nameKey)}` }] })
  },
}))

/** Side-effects when an interactive round closes (activeRound cleared): the felt-reward companion
 *  reaction (once per task, with the finalize result's affinity delta) + a hydrate to load any
 *  recruited companion / completed quest. No-op while the round is still mid-resolution. */
async function onRoundResolved(result: ReducerResult, priority: Priority): Promise<void> {
  if (result.gameState.activeRound) return
  fireCompletionReaction(result, priority)
  if (result.effects.some((e) => e.type === 'recruited' || e.type === 'questCompleted')) {
    await useGame.getState().hydrate()
  }
}

/** §23: register every saved 副本's frozen script for runtime resolution. Call once at boot so a
 *  dungeon whose script isn't in the static content pack still advances chapters after a reload. */
export async function registerSavedDungeonScripts(): Promise<void> {
  for (const d of await dungeonsRepo.all()) registerRuntimeScript(d.script)
}
