// Save export / import — a user-facing backup so a save can never be trapped or lost again
// (and the vehicle to restore data recovered from disk). Reads/writes every IndexedDB store
// directly via getDB(); the app's read-time defaulting (withGameStateDefaults / withStatsDefaults)
// backfills any fields missing from an older or recovered payload.

import type { BackupPayload } from '../domain/types'
import { getDB, SINGLETON, STORE_SPECS } from './db'

// BackupPayload now lives in domain/types.ts (shared with SaveSlot); re-exported here so
// existing `import { ..., type BackupPayload } from '../data/backup'` sites keep working.
export type { BackupPayload }

// Backup store list is DERIVED from db.ts's STORE_SPECS (single source of truth), minus `saves`:
// the named save slots must survive a restore/清空 of game data, and a file export must not
// recurse into the slots. Deriving here means a newly-added store can't silently be dropped from
// backups — add it to STORE_SPECS and it flows in automatically (remember to add its field to the
// exportAll payload literal below too). Keyed stores export as arrays; keyPath:null = singletons.
const BACKUP_SPECS = STORE_SPECS.filter((spec) => spec.name !== 'saves')
const KEYED_STORES = BACKUP_SPECS.filter((spec) => spec.keyPath !== null).map((spec) => spec.name)
const SINGLETON_STORES = BACKUP_SPECS.filter((spec) => spec.keyPath === null).map((spec) => spec.name)
const ALL_STORES = [...KEYED_STORES, ...SINGLETON_STORES]

/** Snapshot every store into one serialisable payload (consistent: single readonly tx).
 *  Only stores that actually exist are included in the transaction — a DB left missing a store
 *  by a concurrent-session version collision degrades to an empty array instead of throwing
 *  "object store not found" (the v8 self-heal recreates them, this is belt-and-suspenders). */
export async function exportAll(): Promise<BackupPayload> {
  const db = await getDB()
  const present = ALL_STORES.filter((name) => db.objectStoreNames.contains(name))
  const tx = db.transaction(present, 'readonly')
  const has = (name: string) => db.objectStoreNames.contains(name as 'characters')
  const s = (name: (typeof ALL_STORES)[number]) => tx.objectStore(name as 'characters')
  const getAll = async (name: (typeof KEYED_STORES)[number]) => (has(name) ? s(name).getAll() : [])
  const payload: BackupPayload = {
    app: 'fantasy-traveler',
    dbVersion: db.version,
    exportedAt: new Date().toISOString(),
    characters: await getAll('characters'),
    todos: await getAll('todos'),
    journalEntries: await getAll('journalEntries'),
    calendarEvents: await getAll('calendarEvents'),
    affinity: await getAll('affinity'),
    chatThreads: await getAll('chatThreads'),
    chatMessages: await getAll('chatMessages'),
    quests: await getAll('quests'),
    habits: await getAll('habits'),
    dungeons: await getAll('dungeons'),
    realityQuests: await getAll('realityQuests'),
    gameState: (has('gameState') ? await tx.objectStore('gameState').get(SINGLETON) : null) ?? null,
    settings: (has('settings') ? await tx.objectStore('settings').get(SINGLETON) : null) ?? null,
    meta: (has('meta') ? await tx.objectStore('meta').get(SINGLETON) : null) ?? null,
  }
  await tx.done
  return payload
}

/** Trigger a browser download of the full save as a pretty-printed JSON file.
 *  The live Anthropic API key is stripped from the downloadable copy — exportAll() snapshots the
 *  settings store (which holds apiKey), but a file written to disk must never carry a billing
 *  credential. In-app save slots still keep the key (createSave/exportAll), so chat survives a
 *  rollback; and clearAll()'s pre-wipe auto-backup routes through here, so "清空数据" can't
 *  silently dump the key either. */
export async function downloadBackup(): Promise<void> {
  const payload = await exportAll()
  const settings = payload.settings as { apiKey?: string } | null
  const safe = settings ? { ...payload, settings: { ...settings, apiKey: undefined } } : payload
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' })
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

/** §31 structural validation — catches a corrupt/foreign file BEFORE the atomic import
 *  clears every store (an exception mid-import aborts the tx, but the error it surfaces
 *  is cryptic; this names the problem). Empty result = valid. Missing store fields are
 *  fine (older payloads predate newer stores); present ones must be arrays of records
 *  carrying the store's primary key. */
export function validateBackupPayload(data: unknown): string[] {
  if (!data || typeof data !== 'object') return ['文件不是 JSON 对象']
  const d = data as Record<string, unknown>
  const errs: string[] = []
  if (d.app !== 'fantasy-traveler') errs.push('不是幻想旅人的存档文件')
  for (const spec of BACKUP_SPECS) {
    if (spec.keyPath === null) continue
    const arr = d[spec.name]
    if (arr === undefined) continue
    if (!Array.isArray(arr)) {
      errs.push(`「${spec.name}」损坏：应为数组`)
      continue
    }
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object' || (rec as Record<string, unknown>)[spec.keyPath] == null) {
        errs.push(`「${spec.name}」中存在缺少主键「${spec.keyPath}」的记录`)
        break
      }
    }
  }
  return errs
}

/** Parse + validate an uploaded backup file. */
export async function readBackupFile(file: File): Promise<BackupPayload> {
  const data = JSON.parse(await file.text())
  const problems = validateBackupPayload(data)
  if (problems.length > 0) throw new Error(`文件不是有效的幻想旅人存档：${problems[0]}`)
  return data as BackupPayload
}

/** Replace ALL stores with the payload's contents (atomic). Caller should reload afterwards. */
export async function importAll(payload: BackupPayload): Promise<{ records: number }> {
  const problems = validateBackupPayload(payload)
  if (problems.length > 0) throw new Error(`文件不是有效的幻想旅人存档：${problems[0]}`)
  const db = await getDB()
  const present = ALL_STORES.filter((name) => db.objectStoreNames.contains(name))
  const tx = db.transaction(present, 'readwrite')
  const data = payload as unknown as Record<string, unknown>
  let records = 0

  for (const name of KEYED_STORES) {
    if (!db.objectStoreNames.contains(name)) continue
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
    if (!db.objectStoreNames.contains(name)) continue
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
