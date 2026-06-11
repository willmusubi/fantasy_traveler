// §31 — at-rest API-key encryption. Round-trip, tamper rejection, legacy passthrough,
// and the settingsRepo seal/unseal seam (raw store value must never hold plaintext).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDB, SINGLETON } from './db'
import { _resetCryptoForTests, decryptString, encryptString, isEncrypted } from './crypto'
import { settingsRepo } from './repositories'

beforeEach(async () => {
  await closeDb()
  _resetCryptoForTests()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
})

describe('encryptString / decryptString', () => {
  it('round-trips a key with a fresh IV every call', async () => {
    const a = await encryptString('sk-ant-test-123')
    const b = await encryptString('sk-ant-test-123')
    expect(isEncrypted(a)).toBe(true)
    expect(a).not.toBe(b) // fresh IV → different ciphertext
    expect(await decryptString(a)).toBe('sk-ant-test-123')
    expect(await decryptString(b)).toBe('sk-ant-test-123')
  })

  it('tampered ciphertext fails CLOSED (undefined, never garbage)', async () => {
    const sealed = await encryptString('sk-ant-secret')
    const tampered = sealed.slice(0, -4) + 'AAAA'
    expect(await decryptString(tampered)).toBeUndefined()
  })

  it('a legacy plaintext value passes through decryptString unchanged', async () => {
    expect(await decryptString('sk-ant-plaintext')).toBe('sk-ant-plaintext')
  })

  it('malformed enc1: payloads fail closed', async () => {
    expect(await decryptString('enc1:not-valid')).toBeUndefined()
  })
})

describe('settingsRepo §31 seal/unseal seam', () => {
  it('put seals the apiKey (raw store never holds plaintext); get unseals it', async () => {
    await settingsRepo.put({ model: 'm', language: 'zh-CN', theme: 'dusk', apiKey: 'sk-ant-live' })
    const raw = await (await getDB()).get('settings', SINGLETON)
    expect(raw?.apiKey).toBeDefined()
    expect(raw!.apiKey!.startsWith('enc1:')).toBe(true)
    expect(raw!.apiKey).not.toContain('sk-ant-live')

    const read = await settingsRepo.get()
    expect(read.apiKey).toBe('sk-ant-live')
  })

  it('a key sealed by ANOTHER device reads as undefined (fail closed, app still boots)', async () => {
    // Seal with the current device key, then rotate the keystore (simulates a foreign device).
    await settingsRepo.put({ model: 'm', language: 'zh-CN', theme: 'dusk', apiKey: 'sk-ant-live' })
    const db = await getDB()
    await db.delete('keystore', SINGLETON)
    _resetCryptoForTests() // next deviceKey() generates a NEW key
    const read = await settingsRepo.get()
    expect(read.apiKey).toBeUndefined()
    expect(read.model).toBe('m') // the rest of the settings survive
  })

  it('settings without a key are stored untouched', async () => {
    await settingsRepo.put({ model: 'm', language: 'zh-CN', theme: 'dusk' })
    const raw = await (await getDB()).get('settings', SINGLETON)
    expect(raw?.apiKey).toBeUndefined()
  })
})
