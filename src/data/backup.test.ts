// Export/import round-trip against a real (faked) IndexedDB: a full snapshot survives a wipe
// and restores every store, import REPLACES (not merges), and foreign files are rejected.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Affinity, Character, GameState, Habit, JournalEntry, Todo } from '../domain/types'
import { exportAll, importAll, type BackupPayload } from './backup'
import { closeDb } from './db'
import { affinityRepo, charactersRepo, gameStateRepo, habitsRepo, journalRepo, todosRepo } from './repositories'

const EMPTY: BackupPayload = {
  app: 'fantasy-traveler', dbVersion: 3, exportedAt: '',
  characters: [], todos: [], journalEntries: [], calendarEvents: [], affinity: [],
  chatThreads: [], chatMessages: [], quests: [], habits: [], gameState: null, settings: null, meta: null,
}

const player: Character = {
  id: 'p', name: '威尔', kind: 'player', classId: 'vanguard',
  stats: { level: 3, xp: 10, maxHp: 120, maxMp: 24, atk: 18, def: 12, spd: 10, mag: 6 },
  skills: [], portraitSet: 'player_default', createdAt: '2026-06-03',
}
const todo: Todo = { id: 't1', title: '写测试', priority: 'high', status: 'open', tags: [], createdAt: '2026-06-03' }
const habit: Habit = { id: 'h1', title: '起床', schedule: { kind: 'daily' }, streak: 2, bestStreak: 5, order: 1, createdAt: '2026-06-03' }
const affinity: Affinity = { characterId: 'raisei_hitomi', points: 90, rank: 'C', unlockedSupports: [], dailyGained: 0, dailyGainedOn: '2026-06-03' }
const journal: JournalEntry = { id: 'j1', date: '2026-06-03', mood: 'good', body: '测试日记', createdAt: '2026-06-03' }
const gameState: GameState = {
  partyIds: ['p', 'raisei_hitomi'],
  monster: { id: 'm', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1 },
  storyStage: 2, buffs: [], moodFlags: {}, lastResolvedAt: '', encounterIndex: 0,
  unlockedCompanionIds: ['raisei_hitomi'], ownedEquipment: [], resources: {}, gold: 42, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {},
}

async function seed() {
  await charactersRepo.put(player)
  await todosRepo.put(todo)
  await habitsRepo.put(habit)
  await affinityRepo.put(affinity)
  await journalRepo.put(journal)
  await gameStateRepo.put(gameState)
}

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
})

describe('backup export/import', () => {
  it('exportAll captures every store', async () => {
    await seed()
    const p = await exportAll()
    expect(p.app).toBe('fantasy-traveler')
    expect(p.dbVersion).toBe(3)
    expect(p.characters).toHaveLength(1)
    expect(p.todos).toHaveLength(1)
    expect(p.habits).toHaveLength(1)
    expect(p.affinity).toHaveLength(1)
    expect(p.journalEntries).toHaveLength(1)
    expect((p.gameState as GameState).gold).toBe(42)
    expect((p.gameState as GameState).storyStage).toBe(2)
  })

  it('round-trips: a wipe then import restores everything', async () => {
    await seed()
    const snapshot = await exportAll()

    // Wipe to empty, confirm gone.
    await importAll(EMPTY)
    expect(await charactersRepo.all()).toHaveLength(0)
    expect(await todosRepo.all()).toHaveLength(0)
    expect(await gameStateRepo.get()).toBeUndefined()

    // Restore from the snapshot.
    const { records } = await importAll(snapshot)
    expect(records).toBe(6) // player + todo + habit + affinity + journal + gameState
    expect((await charactersRepo.all())[0].name).toBe('威尔')
    expect((await todosRepo.all())[0].title).toBe('写测试')
    expect((await habitsRepo.all())[0].streak).toBe(2)
    expect((await affinityRepo.all())[0].points).toBe(90)
    expect((await journalRepo.all())[0].body).toBe('测试日记')
    expect((await gameStateRepo.get())!.gold).toBe(42)
  })

  it('import REPLACES, not merges (stores are cleared first)', async () => {
    await seed()
    const snapshot = await exportAll()
    // Add a different character that is NOT in the snapshot.
    await charactersRepo.put({ ...player, id: 'intruder', name: '入侵者' })
    expect(await charactersRepo.all()).toHaveLength(2)

    await importAll(snapshot)
    const chars = await charactersRepo.all()
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe('威尔')
  })

  it('rejects a file that is not a fantasy-traveler save', async () => {
    await expect(importAll({ app: 'something-else' } as unknown as BackupPayload)).rejects.toThrow()
  })

  it('exports an empty DB without error', async () => {
    const p = await exportAll()
    expect(p.characters).toEqual([])
    expect(p.gameState).toBeNull()
  })
})
