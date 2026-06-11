// §31 — the API key must NEVER sit in IndexedDB as plaintext. This drives the real
// settings UI, then reads the RAW settings store from the page and asserts the seal.

import { expect, test } from '@playwright/test'
import { freshGame } from './helpers'

// The settings modal outgrew the default viewport (§29/§30 added usage + volume fields);
// a taller window keeps 保存 reachable without fighting the modal's internal scroll.
test.use({ viewport: { width: 1440, height: 1500 } })

test('saved API key is sealed at rest (enc1:, no plaintext in the store)', async ({ page }) => {
  await freshGame(page)

  await page.getByRole('button', { name: /设置/ }).first().click()
  const keyInput = page.locator('input[placeholder^="sk-ant"]').first()
  await expect(keyInput).toBeVisible()
  await keyInput.fill('sk-ant-e2e-secret-123')
  await page.getByRole('button', { name: '保存' }).click()
  // 保存 is async (encrypt → put → close): wait for the modal to dismiss before reading raw.
  await expect(keyInput).toBeHidden({ timeout: 10_000 })

  const raw = await page.evaluate(
    () =>
      new Promise<{ apiKey?: string } | undefined>((resolve, reject) => {
        const req = indexedDB.open('fantasy-traveler')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('settings', 'readonly')
          const get = tx.objectStore('settings').get('singleton')
          get.onsuccess = () => {
            db.close()
            resolve(get.result as { apiKey?: string } | undefined)
          }
          get.onerror = () => reject(get.error)
        }
      }),
  )

  expect(raw?.apiKey).toBeDefined()
  expect(raw!.apiKey!.startsWith('enc1:')).toBe(true)
  expect(raw!.apiKey).not.toContain('sk-ant-e2e-secret-123')

  // …and the app still reads it back decrypted (reload → settings shows the masked key).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.battle-stage')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /设置/ }).first().click()
  const visibleValue = await page.locator('input[placeholder^="sk-ant"]').first().inputValue()
  expect(visibleValue).toContain('sk-ant')
  expect(visibleValue.startsWith('enc1:')).toBe(false) // the UI sees plaintext, never the sealed blob
})
