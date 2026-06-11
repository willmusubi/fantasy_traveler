// Typed repositories over IndexedDB. Intent-named methods; impl uses getAll()+filter
// for v1 (swap to indexed cursors later behind the same signatures). (§21)

import type {
  Affinity,
  CalendarEvent,
  Character,
  ChatMessage,
  ChatThread,
  DungeonRecord,
  GameState,
  Habit,
  JournalEntry,
  Quest,
  Settings,
  Todo,
} from '../domain/types'
import { withStatsDefaults } from '../companion/roster'
import { withMonsterDefaults } from '../game/combat'
import { getDB, SINGLETON } from './db'

export const charactersRepo = {
  async all(): Promise<Character[]> {
    return (await getDB()).getAll('characters').then((cs) => cs.map(withStatsDefaults))
  },
  async get(id: string): Promise<Character | undefined> {
    const c = await (await getDB()).get('characters', id)
    return c && withStatsDefaults(c)
  },
  async put(c: Character): Promise<void> {
    await (await getDB()).put('characters', c)
  },
  async putMany(cs: Character[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('characters', 'readwrite')
    await Promise.all(cs.map((c) => tx.store.put(c)))
    await tx.done
  },
}

export const todosRepo = {
  async all(): Promise<Todo[]> {
    return (await getDB()).getAll('todos')
  },
  async open(): Promise<Todo[]> {
    return (await getDB()).getAllFromIndex('todos', 'by_status', 'open')
  },
  async get(id: string): Promise<Todo | undefined> {
    return (await getDB()).get('todos', id)
  },
  async put(t: Todo): Promise<void> {
    await (await getDB()).put('todos', t)
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('todos', id)
  },
}

export const habitsRepo = {
  async all(): Promise<Habit[]> {
    // Plain getAll (not the by_order index): `order` is optional, and an index scan would
    // silently skip records whose key path is undefined. Callers sort in memory.
    return (await getDB()).getAll('habits')
  },
  async get(id: string): Promise<Habit | undefined> {
    return (await getDB()).get('habits', id)
  },
  async put(h: Habit): Promise<void> {
    await (await getDB()).put('habits', h)
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('habits', id)
  },
}

export const affinityRepo = {
  async all(): Promise<Affinity[]> {
    return (await getDB()).getAll('affinity')
  },
  async get(characterId: string): Promise<Affinity | undefined> {
    return (await getDB()).get('affinity', characterId)
  },
  async put(a: Affinity): Promise<void> {
    await (await getDB()).put('affinity', a)
  },
  async putMany(as: Affinity[]): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('affinity', 'readwrite')
    await Promise.all(as.map((a) => tx.store.put(a)))
    await tx.done
  },
}

/** Backfill §22 fields onto pre-v2 saves at read time (idempotent). Exported so the
 *  pipeline can normalize the raw gameState it reads inside its own transaction —
 *  otherwise an un-backfilled save would propagate back into the live store and crash
 *  renderers that assume the fields exist (e.g. PartyPanel's unlockedCompanionIds). */
export function withGameStateDefaults(s: GameState): GameState {
  const player = s.partyIds[0]
  // `enemies` is the new source of truth; synthesize from a legacy singular `monster` if absent.
  // (spd is backfilled for pre-speed saves — default = MONSTER_BASE_SPD; new spawns set it.)
  const legacyMonster = s.monster ? { ...s.monster, spd: s.monster.spd ?? 9 } : undefined
  // §25: withMonsterDefaults backfills matk/mdef/hit/eva/archetype/pattern on old saves.
  const enemies = (
    s.enemies && s.enemies.length > 0
      ? s.enemies.map((m) => ({ ...m, spd: m.spd ?? 9 }))
      : legacyMonster
        ? [legacyMonster]
        : []
  ).map(withMonsterDefaults)
  // A round snapshotted under the OLD shape (has enemyAtStart, no enemiesAtStart) cannot resume
  // safely against the multi-enemy resolver — clear it (a refresh mid-round just restarts the task).
  const ar = s.activeRound
  const staleRound = ar != null && (ar as { enemiesAtStart?: unknown }).enemiesAtStart === undefined
  return {
    ...s,
    encounterIndex: s.encounterIndex ?? 0,
    activeScriptId: s.activeScriptId, // §23: undefined on legacy saves → linear path (back-compat)
    currentChapterId: s.currentChapterId,
    scriptFlags: s.scriptFlags ?? {}, // §23: missing = no flags set yet
    completedScriptIds: s.completedScriptIds ?? [], // §24: missing on pre-§24 saves = nothing cleared yet
    unlockedCompanionIds: s.unlockedCompanionIds ?? s.partyIds.filter((id) => id !== player),
    ownedEquipment: s.ownedEquipment ?? [],
    resources: s.resources ?? {}, // missing per-char entry = full
    gold: s.gold ?? 0,
    partyBuffs: s.partyBuffs ?? [],
    combatLog: s.combatLog ?? [],
    charge: s.charge ?? {}, // persistent CTB gauges; missing entry = 0
    roundPlan: s.roundPlan ?? {}, // per-member planned action; missing entry = basic attack
    activeStatuses: s.activeStatuses ?? {}, // §26 — pre-status saves carry none
    enemies,
    monster: undefined, // collapse the legacy field so nothing reads it post-migration
    activeRound: staleRound ? undefined : ar,
  }
}

export const gameStateRepo = {
  async get(): Promise<GameState | undefined> {
    const s = await (await getDB()).get('gameState', SINGLETON)
    return s ? withGameStateDefaults(s) : undefined
  },
  async put(s: GameState): Promise<void> {
    await (await getDB()).put('gameState', s, SINGLETON)
  },
}

export const questsRepo = {
  async all(): Promise<Quest[]> {
    return (await getDB()).getAll('quests')
  },
  async get(id: string): Promise<Quest | undefined> {
    return (await getDB()).get('quests', id)
  },
  async byWorld(worldId: string): Promise<Quest[]> {
    return (await getDB()).getAllFromIndex('quests', 'by_world', worldId)
  },
  async active(): Promise<Quest | undefined> {
    const a = await (await getDB()).getAllFromIndex('quests', 'by_status', 'active')
    return a[0]
  },
  async put(q: Quest): Promise<void> {
    await (await getDB()).put('quests', q)
  },
}

/** §23: saved replayable 副本 (frozen ScriptDef snapshots). Mirrors questsRepo. */
export const dungeonsRepo = {
  async all(): Promise<DungeonRecord[]> {
    const db = await getDB()
    // Tolerate a DB that reached v4 without this store (concurrent-session version collision)
    // so boot doesn't hard-crash; the v5 upgrade backfills the store on next open.
    if (!db.objectStoreNames.contains('dungeons')) return []
    return db.getAll('dungeons')
  },
  async get(id: string): Promise<DungeonRecord | undefined> {
    return (await getDB()).get('dungeons', id)
  },
  async byWorld(worldId: string): Promise<DungeonRecord[]> {
    return (await getDB()).getAllFromIndex('dungeons', 'by_world', worldId)
  },
  async put(d: DungeonRecord): Promise<void> {
    await (await getDB()).put('dungeons', d)
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('dungeons', id)
  },
}

export const journalRepo = {
  async all(): Promise<JournalEntry[]> {
    return (await getDB()).getAll('journalEntries')
  },
  async byDate(date: string): Promise<JournalEntry[]> {
    return (await getDB()).getAllFromIndex('journalEntries', 'by_date', date)
  },
  async put(e: JournalEntry): Promise<void> {
    await (await getDB()).put('journalEntries', e)
  },
}

export const calendarRepo = {
  async all(): Promise<CalendarEvent[]> {
    return (await getDB()).getAll('calendarEvents')
  },
  async put(e: CalendarEvent): Promise<void> {
    await (await getDB()).put('calendarEvents', e)
  },
}

export const chatRepo = {
  async threads(): Promise<ChatThread[]> {
    return (await getDB()).getAll('chatThreads')
  },
  async putThread(t: ChatThread): Promise<void> {
    await (await getDB()).put('chatThreads', t)
  },
  async messages(threadId: string): Promise<ChatMessage[]> {
    const db = await getDB()
    const range = IDBKeyRange.bound([threadId, ''], [threadId, '￿'])
    return db.getAllFromIndex('chatMessages', 'by_thread', range)
  },
  async putMessage(m: ChatMessage): Promise<void> {
    await (await getDB()).put('chatMessages', m)
  },
}

const DEFAULT_SETTINGS: Settings = {
  model: 'claude-sonnet-4-6',
  language: 'zh-CN',
  theme: 'dusk',
}

export const settingsRepo = {
  async get(): Promise<Settings> {
    const s = await (await getDB()).get('settings', SINGLETON)
    return s ?? DEFAULT_SETTINGS
  },
  async put(s: Settings): Promise<void> {
    await (await getDB()).put('settings', s, SINGLETON)
  },
}
