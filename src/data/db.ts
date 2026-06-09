// IndexedDB schema (§6, §21). Full v1 schema declared up front so no upgrade is
// needed until the schema actually changes. IndexedDB is the source of truth.

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'
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
  SaveSlot,
  Settings,
  Todo,
} from '../domain/types'

export const SINGLETON = 'singleton'

export interface FTSchema extends DBSchema {
  characters: { key: string; value: Character }
  todos: { key: string; value: Todo; indexes: { by_status: string; by_due: string } }
  journalEntries: { key: string; value: JournalEntry; indexes: { by_date: string } }
  calendarEvents: { key: string; value: CalendarEvent; indexes: { by_start: string } }
  affinity: { key: string; value: Affinity } // keyed on characterId
  gameState: { key: string; value: GameState } // out-of-line, key = SINGLETON
  chatThreads: { key: string; value: ChatThread }
  chatMessages: { key: string; value: ChatMessage; indexes: { by_thread: [string, string] } }
  settings: { key: string; value: Settings } // out-of-line, key = SINGLETON
  meta: { key: string; value: { schemaVersion: number } } // out-of-line, key = SINGLETON
  // v2 (§22): worldview / storyline
  quests: { key: string; value: Quest; indexes: { by_world: string; by_status: string } }
  // v3: recurring daily habits (separate from one-time todos)
  habits: { key: string; value: Habit; indexes: { by_order: number } }
  // v4 (§23): saved replayable 副本 — frozen ScriptDef snapshots
  dungeons: { key: string; value: DungeonRecord; indexes: { by_world: string } }
  // v6: named in-app save slots (full-DB snapshots). Deliberately NOT in backup.ts's
  // ALL_STORES, so restoring/clearing game data never wipes the slots themselves.
  saves: { key: string; value: SaveSlot }
}

const DB_NAME = 'fantasy-traveler'
const DB_VERSION = 8

let dbPromise: Promise<IDBPDatabase<FTSchema>> | null = null

/** Declarative spec of every store + its indexes. Single source of truth for the
 *  comprehensive self-heal (`ensureAllStores`) AND for backup.ts's store list (it derives
 *  KEYED/SINGLETON from this, excluding `saves`). `keyPath: null` ⇒ out-of-line store. */
export const STORE_SPECS: Array<{
  // StoreNames<FTSchema>, not keyof FTSchema: DBSchema's index signature widens `keyof` to
  // `string`, which idb's contains/objectStore/createObjectStore reject (they want the literal union).
  name: StoreNames<FTSchema>
  keyPath: string | null
  indexes?: Array<{ name: string; keyPath: string | string[] }>
}> = [
  { name: 'characters', keyPath: 'id' },
  { name: 'todos', keyPath: 'id', indexes: [{ name: 'by_status', keyPath: 'status' }, { name: 'by_due', keyPath: 'due' }] },
  { name: 'journalEntries', keyPath: 'id', indexes: [{ name: 'by_date', keyPath: 'date' }] },
  { name: 'calendarEvents', keyPath: 'id', indexes: [{ name: 'by_start', keyPath: 'start' }] },
  { name: 'affinity', keyPath: 'characterId' },
  { name: 'gameState', keyPath: null },
  { name: 'chatThreads', keyPath: 'id' },
  { name: 'chatMessages', keyPath: 'id', indexes: [{ name: 'by_thread', keyPath: ['threadId', 'createdAt'] }] },
  { name: 'settings', keyPath: null },
  { name: 'meta', keyPath: null },
  { name: 'quests', keyPath: 'id', indexes: [{ name: 'by_world', keyPath: 'worldId' }, { name: 'by_status', keyPath: 'status' }] },
  { name: 'habits', keyPath: 'id', indexes: [{ name: 'by_order', keyPath: 'order' }] },
  { name: 'dungeons', keyPath: 'id', indexes: [{ name: 'by_world', keyPath: 'worldId' }] },
  { name: 'saves', keyPath: 'id' },
]

/** Create any missing store (and any missing index on an existing store). Idempotent and
 *  existence-guarded, so it's a no-op for a healthy DB. This is the catch-all self-heal for a
 *  working tree shared by concurrent dev sessions, where colliding DB_VERSION bumps could land
 *  the DB at a high version while skipping the create-block for an arbitrary store — leaving
 *  exportAll's multi-store transaction to hard-crash with "object store not found". */
function ensureAllStores(
  db: IDBPDatabase<FTSchema>,
  tx: IDBPTransaction<FTSchema, ArrayLike<StoreNames<FTSchema>>, 'versionchange'>,
): void {
  for (const spec of STORE_SPECS) {
    // Both branches yield an object exposing indexNames + createIndex; cast to a minimal shape so
    // the union of idb's create-mode / version-change store types doesn't fight the call below.
    const store = (
      db.objectStoreNames.contains(spec.name)
        ? tx.objectStore(spec.name)
        : db.createObjectStore(spec.name, spec.keyPath ? { keyPath: spec.keyPath } : undefined)
    ) as unknown as { indexNames: DOMStringList; createIndex(name: string, keyPath: string | string[]): unknown }
    for (const idx of spec.indexes ?? []) {
      if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath)
    }
  }
}

export function getDB(): Promise<IDBPDatabase<FTSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FTSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('characters', { keyPath: 'id' })

          const todos = db.createObjectStore('todos', { keyPath: 'id' })
          todos.createIndex('by_status', 'status')
          todos.createIndex('by_due', 'due')

          const journal = db.createObjectStore('journalEntries', { keyPath: 'id' })
          journal.createIndex('by_date', 'date')

          const cal = db.createObjectStore('calendarEvents', { keyPath: 'id' })
          cal.createIndex('by_start', 'start')

          db.createObjectStore('affinity', { keyPath: 'characterId' })
          db.createObjectStore('gameState')

          db.createObjectStore('chatThreads', { keyPath: 'id' })
          const msgs = db.createObjectStore('chatMessages', { keyPath: 'id' })
          msgs.createIndex('by_thread', ['threadId', 'createdAt'])

          db.createObjectStore('settings')
          db.createObjectStore('meta')
        }
        if (oldVersion < 2) {
          // §22 worldview/storyline. GameState's new fields are backfilled at
          // READ time (gameStateRepo.get → withDefaults), not rewritten here.
          const quests = db.createObjectStore('quests', { keyPath: 'id' })
          quests.createIndex('by_world', 'worldId')
          quests.createIndex('by_status', 'status')
        }
        if (oldVersion < 3) {
          // Recurring daily habits. New store starts empty — no backfill needed. The
          // by_order index is for future cursor use; repos read getAll() + sort in memory
          // (order is optional → an index scan would skip un-ordered rows).
          const habits = db.createObjectStore('habits', { keyPath: 'id' })
          habits.createIndex('by_order', 'order')
        }
        if (oldVersion < 4) {
          // §23 saved 副本 library. New store starts empty — no backfill. GameState's new
          // script fields (activeScriptId/currentChapterId/scriptFlags) are backfilled at
          // READ time (withGameStateDefaults), not rewritten here.
          const dungeons = db.createObjectStore('dungeons', { keyPath: 'id' })
          dungeons.createIndex('by_world', 'worldId')
        }
        if (oldVersion < 5) {
          // v5 self-heal: a concurrent dev session sharing this working tree bumped the DB to
          // v4 with a schema that lacked `dungeons` (both sessions touched DB_VERSION), so the
          // `oldVersion < 4` block never ran and reads of the store hard-crash boot. Guard by
          // existence so this is a no-op for fresh installs (already created above) and for
          // correctly-migrated v4 saves, and only creates the store on the broken-v4 state.
          if (!db.objectStoreNames.contains('dungeons')) {
            const dungeons = db.createObjectStore('dungeons', { keyPath: 'id' })
            dungeons.createIndex('by_world', 'worldId')
          }
        }
        if (oldVersion < 6) {
          // v6 save slots. New store starts empty — no backfill. Existence-guarded like the
          // v5 self-heal so a working tree shared by concurrent dev sessions (which may have
          // already created it under a colliding version) doesn't throw on re-create.
          if (!db.objectStoreNames.contains('saves')) {
            db.createObjectStore('saves', { keyPath: 'id' })
          }
        }
        if (oldVersion < 7) {
          // v7 self-heal (same class as the v5 fix): during development the DB was bumped to v6
          // and the page loaded (via HMR/refresh) BEFORE the `oldVersion < 6` create-block above
          // existed, leaving a v6 DB with NO `saves` store. Once at v6, `oldVersion < 6` never
          // runs again, so the store could never appear and writes threw "object store not found".
          // Existence-guarded create — no-op for fresh installs and correctly-migrated v6 saves.
          if (!db.objectStoreNames.contains('saves')) {
            db.createObjectStore('saves', { keyPath: 'id' })
          }
        }
        if (oldVersion < 8) {
          // v8 comprehensive self-heal. The piecemeal per-store heals above only ever rescued
          // `dungeons` and `saves`. But a working tree shared by concurrent dev sessions could
          // collide DB_VERSION bumps such that the DB lands at a high version while skipping the
          // create-block for ANY store (e.g. `quests`/`habits` missing on a v7 DB) — which made
          // exportAll's all-stores transaction hard-crash "object store not found" on every save.
          // ensureAllStores recreates whatever's missing from one declarative spec. No-op when healthy.
          ensureAllStores(db, tx)
        }
      },
      blocked() {
        console.warn('[db] upgrade blocked by another open tab')
      },
      blocking() {
        // Another tab wants to upgrade — close so it isn't blocked.
        void dbPromise?.then((db) => db.close())
        dbPromise = null
      },
    })
  }
  return dbPromise
}

/** Close the active connection (so another tab/test can delete or upgrade). */
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

/** Test/util: reset the cached connection reference without closing. */
export function _resetDbForTests(): void {
  dbPromise = null
}
