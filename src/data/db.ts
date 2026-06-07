// IndexedDB schema (§6, §21). Full v1 schema declared up front so no upgrade is
// needed until the schema actually changes. IndexedDB is the source of truth.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Affinity,
  CalendarEvent,
  Character,
  ChatMessage,
  ChatThread,
  GameState,
  Habit,
  JournalEntry,
  Quest,
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
}

const DB_NAME = 'fantasy-traveler'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<FTSchema>> | null = null

export function getDB(): Promise<IDBPDatabase<FTSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FTSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
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
