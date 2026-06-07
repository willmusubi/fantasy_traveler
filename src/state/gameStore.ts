import { create } from 'zustand'
import { rankForPoints } from '../companion/affinity'
import { COMPANION_DEFS, createCompanionCharacter, createPlayer, PRIMARY_COMPANION_ID } from '../companion/roster'
import { SKILL_DEFS } from '../companion/skills'
import { affinityRepo, charactersRepo, gameStateRepo, questsRepo } from '../data/repositories'
import { HABIT_BUFF_ACTIVE_CAP, HABIT_BUFF_CHOICES, HABIT_BUFF_POOL, HABIT_DEBUFF_POOL, type HabitBuffDef } from '../domain/config'
import { localDateKey } from '../domain/dates'
import type { Affinity, Character, ClassId, ExpressionKey, GameState, ID, PartyBuff, Quest, SkillId, WorldId } from '../domain/types'
import { spawnMonster } from '../game/combat'
import type { ReducerResult } from '../game/reducer'
import { t } from '../i18n'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { SHOP_POTIONS } from '../world/shop'

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
  lastDamage: { amount: number; key: number } | null
  activeQuest: Quest | null
  /** Set by ingestResult when a quest is completed/recruit happens, for the UI to show. */
  recruitedId: string | null
  /** Set by ingestResult when an enemy is defeated — drives the victory settlement window. */
  victorySummary: VictorySummary | null
  /** Queue of pending habit buff drafts (one per habit completion). Transient — not persisted. */
  pendingBuffChoices: BuffChoice[]

  hydrate: () => Promise<void>
  seedNewGame: (name: string, classId: ClassId) => Promise<void>
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
  /** Apply one random debuff (untilVictory) — fired when a habit's streak breaks. */
  applyRandomDebuff: () => Promise<void>
  /** Plan a party member's action for the next task-executed round: a SkillId, or null = basic
   *  attack. Persists; fires when the next todo completes (no instant cast). */
  setRoundAction: (memberId: ID, skillId: SkillId | null) => Promise<void>
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
  lastDamage: null,
  activeQuest: null,
  recruitedId: null,
  victorySummary: null,
  pendingBuffChoices: [],

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

  async seedNewGame(name, classId) {
    const now = new Date()
    const today = localDateKey(now)
    const player = createPlayer(name, classId, now, () => crypto.randomUUID())
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

    const monster = spawnMonster(0, 0, () => crypto.randomUUID())
    const gameState: GameState = {
      partyIds: [player.id, companion.id],
      monster,
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
    let damageAmount = 0
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

    for (const e of result.effects) {
      if (e.type === 'damage') {
        damageAmount += e.amount
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
      const enemy = prev.gameState ? prev.gameState.monster.displayName ?? t(prev.gameState.monster.nameKey) : '敌人'
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
      toasts: [...prev.toasts, ...toasts],
      lastDamage: damageAmount > 0 ? { amount: damageAmount, key: ++reactionKey } : prev.lastDamage,
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
