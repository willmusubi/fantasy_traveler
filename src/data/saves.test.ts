// Save-slot layer over backup's snapshot engine: a slot round-trips the full game, slots are
// independent of each other (restoring one never wipes the others — the `saves` store is NOT in
// ALL_STORES), and restore preserves the LIVE api key by default so a rollback can't drop chat.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Character, GameState, Settings } from '../domain/types'
import { closeDb } from './db'
import { charactersRepo, gameStateRepo, settingsRepo } from './repositories'
import { createSave, deleteSave, renameSave, restoreSave, savesRepo } from './saves'

const player: Character = {
  id: 'p', name: '威尔', kind: 'player', classId: 'vanguard',
  stats: { level: 3, xp: 10, maxHp: 146, maxMp: 38, str: 18, vit: 15, wis: 14, spr: 14, spd: 13, skl: 14, hit: 14, eva: 10 },
  skills: [], portraitSet: 'player_default', createdAt: '2026-06-03',
}
const baseGame: GameState = {
  partyIds: ['p'],
  enemies: [{ id: 'm', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1 }],
  storyStage: 2, buffs: [], moodFlags: {}, lastResolvedAt: '', encounterIndex: 0,
  unlockedCompanionIds: [], ownedEquipment: [], resources: {}, gold: 42, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
}

async function seed(gold = 42) {
  await charactersRepo.put(player)
  await gameStateRepo.put({ ...baseGame, gold })
}

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
})

describe('save slots', () => {
  it('createSave captures the live game into a named, sized slot', async () => {
    await seed()
    const slot = await createSave('剧情前·序章')

    expect(slot.name).toBe('剧情前·序章')
    expect(slot.dbVersion).toBe(10) // Reality Oracle
    expect(slot.bytes).toBeGreaterThan(0)
    expect((slot.payload.gameState as GameState).gold).toBe(42)

    const list = await savesRepo.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('剧情前·序章')
  })

  it('blank name falls back to a timestamped default', async () => {
    await seed()
    const slot = await createSave('   ')
    expect(slot.name).toMatch(/^存档 \d\d-\d\d \d\d:\d\d$/)
  })

  it('round-trips: restore rolls the live game back to the snapshot', async () => {
    await seed(42)
    const slot = await createSave('快照')

    // Drift the live game away from the snapshot.
    await gameStateRepo.put({ ...baseGame, gold: 999 })
    await charactersRepo.put({ ...player, id: 'intruder', name: '入侵者' })
    expect((await gameStateRepo.get())!.gold).toBe(999)
    expect(await charactersRepo.all()).toHaveLength(2)

    await restoreSave(slot.id)
    expect((await gameStateRepo.get())!.gold).toBe(42)
    const chars = await charactersRepo.all()
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe('威尔')
  })

  it('restoring one slot leaves the OTHER slots intact (saves store is not wiped)', async () => {
    await seed(42)
    const a = await createSave('A')
    await gameStateRepo.put({ ...baseGame, gold: 999 })
    const b = await createSave('B')

    await restoreSave(a.id)

    const ids = (await savesRepo.list()).map((s) => s.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect((await gameStateRepo.get())!.gold).toBe(42) // A's snapshot
  })

  it('restore preserves the LIVE api key by default, but restores other settings', async () => {
    await seed()
    const atSave: Settings = { apiKey: 'KEY_AT_SAVE', model: 'claude-opus-4-8', language: 'zh-CN', theme: 'dusk' }
    await settingsRepo.put(atSave)
    const slot = await createSave('带设置')

    // Live key rotates after the save.
    await settingsRepo.put({ ...atSave, apiKey: 'LIVE_KEY', model: 'claude-haiku-4-5-20251001' })

    await restoreSave(slot.id) // keepApiKey defaults true
    const after = await settingsRepo.get()
    expect(after.apiKey).toBe('LIVE_KEY') // live key kept — chat never drops
    expect(after.model).toBe('claude-opus-4-8') // model rolled back to the slot's
  })

  it('keepApiKey:false restores the slot’s own api key', async () => {
    await seed()
    await settingsRepo.put({ apiKey: 'KEY_AT_SAVE', model: 'claude-opus-4-8', language: 'zh-CN', theme: 'dusk' })
    const slot = await createSave('带设置')
    await settingsRepo.put({ apiKey: 'LIVE_KEY', model: 'claude-opus-4-8', language: 'zh-CN', theme: 'dusk' })

    await restoreSave(slot.id, { keepApiKey: false })
    expect((await settingsRepo.get()).apiKey).toBe('KEY_AT_SAVE')
  })

  it('rename changes the name but not the snapshot time; delete removes the slot', async () => {
    await seed()
    const slot = await createSave('旧名')
    await renameSave(slot.id, '新名')
    const renamed = await savesRepo.get(slot.id)
    expect(renamed!.name).toBe('新名')
    expect(renamed!.savedAt).toBe(slot.savedAt)

    await deleteSave(slot.id)
    expect(await savesRepo.list()).toHaveLength(0)
  })

  // Regression: the reported "存档失败：…One of the specified object stores was not found".
  // A working tree shared by concurrent dev sessions had collided DB_VERSION bumps, landing the
  // DB at v7 yet missing a store. exportAll's all-stores transaction then hard-crashed on every
  // save. The v8 comprehensive self-heal must recreate whatever's missing on the next open.
  it('heals a v7 DB that is missing a store, so saving works again', async () => {
    // Build the broken pre-state: a v7 DB with NO `quests` store (and only a couple of stores).
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('fantasy-traveler', 7)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('characters', { keyPath: 'id' })
        db.createObjectStore('gameState')
        db.createObjectStore('saves', { keyPath: 'id' })
      }
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })

    // Re-opening via the app (getDB → v8) must heal the missing stores, not throw.
    await seed(77)
    const slot = await createSave('修复后')
    expect(slot.dbVersion).toBe(10) // Reality Oracle
    expect((slot.payload.gameState as GameState).gold).toBe(77)
    expect(slot.payload.quests).toEqual([]) // store was recreated, reads as empty
    expect(await savesRepo.list()).toHaveLength(1)
  })
})
