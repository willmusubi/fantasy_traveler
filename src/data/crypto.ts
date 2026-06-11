// §31 at-rest API-key encryption (AES-GCM via SubtleCrypto). Threat model: casual
// inspection/exfil of the IndexedDB `settings` store (extensions, copied profile dirs,
// shared machines) — NOT a determined attacker with code execution on this device (the
// device key lives in the adjacent `keystore` store as an extractable JWK; fully
// protecting against local code execution would need a backend, which this app
// deliberately doesn't have). Backups/save-slots never include the keystore, so an
// exported file's encrypted key is undecryptable elsewhere → reads as "no key set".

import { getDB, SINGLETON } from './db'

const PREFIX = 'enc1:'

export const isEncrypted = (s: string): boolean => s.startsWith(PREFIX)

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

let keyPromise: Promise<CryptoKey> | null = null

/** Get-or-create the device key (persisted as JWK — fake-indexeddb can't clone CryptoKey). */
function deviceKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const db = await getDB()
      const existing = await db.get('keystore', SINGLETON)
      if (existing) {
        return crypto.subtle.importKey('jwk', existing, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
      }
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
      const jwk = await crypto.subtle.exportKey('jwk', key)
      await db.put('keystore', jwk, SINGLETON)
      return key
    })()
  }
  return keyPromise
}

/** Encrypt a string → `enc1:<iv>:<ciphertext>` (both base64; fresh IV per call). */
export async function encryptString(plain: string): Promise<string> {
  const key = await deviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return `${PREFIX}${b64(iv)}:${b64(ct)}`
}

/** Decrypt an `enc1:` string; undefined when malformed, tampered, or sealed by another
 *  device's key (e.g. a save slot restored on a different machine). */
export async function decryptString(sealed: string): Promise<string | undefined> {
  if (!isEncrypted(sealed)) return sealed
  const [ivB64, ctB64] = sealed.slice(PREFIX.length).split(':')
  if (!ivB64 || !ctB64) return undefined
  try {
    const key = await deviceKey()
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) as BufferSource },
      key,
      unb64(ctB64) as BufferSource,
    )
    return new TextDecoder().decode(plain)
  } catch {
    return undefined
  }
}

/** Test hook: drop the cached key promise (after DB resets). */
export function _resetCryptoForTests(): void {
  keyPromise = null
}
