// Named in-app save slots — "存档槽". A slot is just the full-DB snapshot that backup.ts
// already produces (exportAll), stored in its own `saves` store under a name + timestamp.
// Restore = feed the frozen payload back through importAll (the same atomic replace the file
// import uses), then the caller reloads. Built for quick demo/recording rollbacks: snapshot
// before a story beat, record a branch, restore, record another.
//
// The `saves` store is intentionally absent from backup.ts's ALL_STORES, which buys two things
// for free: importAll (restore OR 清空数据) clears every OTHER store but leaves the slots intact,
// and file exports don't recurse a backup-of-backups into themselves.

import type { BackupPayload, SaveSlot, Settings } from '../domain/types'
import { exportAll, importAll } from './backup'
import { getDB } from './db'
import { settingsRepo } from './repositories'

const byteLen = (s: string): number => new TextEncoder().encode(s).length

export const savesRepo = {
  /** All slots, newest snapshot first. Tolerates a DB that reached v6 without the store
   *  (concurrent-session version collision) the same way dungeonsRepo does. */
  async list(): Promise<SaveSlot[]> {
    const db = await getDB()
    if (!db.objectStoreNames.contains('saves')) return []
    const all = await db.getAll('saves')
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  },
  async get(id: string): Promise<SaveSlot | undefined> {
    return (await getDB()).get('saves', id)
  },
  async put(slot: SaveSlot): Promise<void> {
    await (await getDB()).put('saves', slot)
  },
  async delete(id: string): Promise<void> {
    await (await getDB()).delete('saves', id)
  },
}

/** Capture the current game into a new named slot. */
export async function createSave(name: string): Promise<SaveSlot> {
  const payload = await exportAll()
  const now = new Date().toISOString()
  const slot: SaveSlot = {
    id: crypto.randomUUID(),
    name: name.trim() || defaultSaveName(now),
    createdAt: now,
    savedAt: now,
    dbVersion: payload.dbVersion,
    bytes: byteLen(JSON.stringify(payload)),
    payload,
  }
  await savesRepo.put(slot)
  return slot
}

/** Replace the live game with a slot's snapshot. Caller MUST reload afterwards (boot re-hydrates
 *  every store from IndexedDB). By default the live API key is preserved across the restore so a
 *  mid-recording rollback to an older slot never silently drops chat connectivity. */
export async function restoreSave(id: string, opts: { keepApiKey?: boolean } = {}): Promise<void> {
  const { keepApiKey = true } = opts
  const slot = await savesRepo.get(id)
  if (!slot) throw new Error('存档不存在')
  let payload: BackupPayload = slot.payload
  if (keepApiKey) {
    const live = await settingsRepo.get()
    const base = (payload.settings as Settings | null) ?? live
    payload = { ...payload, settings: { ...base, apiKey: live.apiKey } }
  }
  await importAll(payload)
}

/** Rename a slot in place (does not touch its snapshot or savedAt). */
export async function renameSave(id: string, name: string): Promise<void> {
  const slot = await savesRepo.get(id)
  if (!slot) throw new Error('存档不存在')
  const trimmed = name.trim()
  if (!trimmed) return
  await savesRepo.put({ ...slot, name: trimmed })
}

export async function deleteSave(id: string): Promise<void> {
  await savesRepo.delete(id)
}

/** Default slot name from a timestamp, e.g. "存档 06-08 14:20". */
export function defaultSaveName(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `存档 ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
