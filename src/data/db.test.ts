// Regression for the v8 comprehensive self-heal (ensureAllStores). A working tree shared by
// concurrent dev sessions could collide DB_VERSION bumps so the DB landed at a high version while
// the create-block for some store never ran — which crashed boot / exportAll with "object store
// not found". The v5/v6/v7 piecemeal heals only ever rescued `dungeons` / `saves`; v8 recreates
// ANY missing store from STORE_SPECS. This pins that behaviour (the bug the comments describe had
// no test reproducing the broken pre-state).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetDbForTests, closeDb, getDB } from './db'

const DB_NAME = 'fantasy-traveler'

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

/** Open a DELIBERATELY incomplete DB at `version`, creating only `stores` — simulating a version
 *  collision that skipped create-blocks for everything else. */
function openBroken(version: number, stores: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of stores) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

beforeEach(async () => {
  await closeDb()
  _resetDbForTests()
  await deleteDb()
})

describe('db self-heal (v8 ensureAllStores)', () => {
  it('recreates every store missing from a broken lower-version DB', async () => {
    // A v7 DB that only ever got `characters` — quests/habits/dungeons/saves/… never created.
    await openBroken(7, ['characters'])
    _resetDbForTests()

    const db = await getDB() // upgrades 7 → 8, ensureAllStores recreates whatever's missing
    for (const store of ['todos', 'affinity', 'quests', 'habits', 'dungeons', 'saves', 'gameState', 'realityQuests'] as const) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }

    // A read through a recreated store no longer throws "object store not found".
    const tx = db.transaction('quests', 'readonly')
    expect(await tx.objectStore('quests').getAll()).toEqual([])
  })

  it('leaves a healthy fresh DB intact (self-heal is a no-op)', async () => {
    const db = await getDB() // fresh create at v8
    // Every declared store is present after a clean open.
    for (const store of ['characters', 'todos', 'journalEntries', 'calendarEvents', 'affinity', 'gameState', 'chatThreads', 'chatMessages', 'settings', 'meta', 'quests', 'habits', 'dungeons', 'saves', 'realityQuests'] as const) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })
})
