// Save export / import — a user-facing backup so a save can never be trapped or lost again
// (and the vehicle to restore data recovered from disk). Reads/writes every IndexedDB store
// directly via getDB(); the app's read-time defaulting (withGameStateDefaults / withStatsDefaults)
// backfills any fields missing from an older or recovered payload.

import { getDB, SINGLETON } from './db'

/** Keyed (in-line key) stores — each exported as an array of records. */
const KEYED_STORES = [
  'characters', 'todos', 'journalEntries', 'calendarEvents', 'affinity',
  'chatThreads', 'chatMessages', 'quests', 'habits',
] as const
/** Out-of-line singleton stores — each exported as a single value under the SINGLETON key. */
const SINGLETON_STORES = ['gameState', 'settings', 'meta'] as const
const ALL_STORES = [...KEYED_STORES, ...SINGLETON_STORES]

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
  gameState: unknown | null
  settings: unknown | null
  meta: unknown | null
}

/** Snapshot every store into one serialisable payload (consistent: single readonly tx). */
export async function exportAll(): Promise<BackupPayload> {
  const db = await getDB()
  const tx = db.transaction([...ALL_STORES], 'readonly')
  const s = (name: (typeof ALL_STORES)[number]) => tx.objectStore(name as 'characters')
  const payload: BackupPayload = {
    app: 'fantasy-traveler',
    dbVersion: db.version,
    exportedAt: new Date().toISOString(),
    characters: await s('characters').getAll(),
    todos: await s('todos').getAll(),
    journalEntries: await s('journalEntries').getAll(),
    calendarEvents: await s('calendarEvents').getAll(),
    affinity: await s('affinity').getAll(),
    chatThreads: await s('chatThreads').getAll(),
    chatMessages: await s('chatMessages').getAll(),
    quests: await s('quests').getAll(),
    habits: await s('habits').getAll(),
    gameState: (await tx.objectStore('gameState').get(SINGLETON)) ?? null,
    settings: (await tx.objectStore('settings').get(SINGLETON)) ?? null,
    meta: (await tx.objectStore('meta').get(SINGLETON)) ?? null,
  }
  await tx.done
  return payload
}

/** Trigger a browser download of the full save as a pretty-printed JSON file. */
export async function downloadBackup(): Promise<void> {
  const payload = await exportAll()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const a = document.createElement('a')
  a.href = url
  a.download = `fantasy-traveler-存档-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Parse + lightly validate an uploaded backup file. */
export async function readBackupFile(file: File): Promise<BackupPayload> {
  const data = JSON.parse(await file.text())
  if (!data || data.app !== 'fantasy-traveler' || !Array.isArray(data.characters)) {
    throw new Error('文件不是有效的幻想旅人存档')
  }
  return data as BackupPayload
}

/** Replace ALL stores with the payload's contents (atomic). Caller should reload afterwards. */
export async function importAll(payload: BackupPayload): Promise<{ records: number }> {
  if (!payload || payload.app !== 'fantasy-traveler') throw new Error('文件不是有效的幻想旅人存档')
  const db = await getDB()
  const tx = db.transaction([...ALL_STORES], 'readwrite')
  const data = payload as unknown as Record<string, unknown>
  let records = 0

  for (const name of KEYED_STORES) {
    const store = tx.objectStore(name) as unknown as { clear(): Promise<void>; put(v: unknown): Promise<unknown> }
    await store.clear()
    const arr = data[name]
    if (Array.isArray(arr)) {
      for (const rec of arr) {
        await store.put(rec)
        records++
      }
    }
  }
  for (const name of SINGLETON_STORES) {
    const store = tx.objectStore(name) as unknown as { clear(): Promise<void>; put(v: unknown, k: string): Promise<unknown> }
    await store.clear()
    const val = data[name]
    if (val != null) {
      await store.put(val, SINGLETON)
      records++
    }
  }
  await tx.done
  return { records }
}
