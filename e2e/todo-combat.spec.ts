// The CORE loop, end to end: complete a real todo → an interactive combat round opens
// (the adventure zone steps through turns) → 全部自动 resolves it → the enemy lost HP
// and the productivity reward landed. This is the contract everything else hangs off.

import { expect, test } from '@playwright/test'
import { addTodo, freshGame } from './helpers'

test('completing a todo fights one round and hurts the enemy', async ({ page }) => {
  await freshGame(page)

  // The training enemy starts at full HP: "<hp> / <maxHp>" with hp === maxHp.
  const hpLabel = page.locator('.enemy-card .hpbar-label').first()
  const before = (await hpLabel.textContent()) ?? ''
  const [hp0, max0] = before.split('/').map((s) => parseInt(s.trim(), 10))
  expect(hp0).toBe(max0)

  await addTodo(page, '写一段决定性的代码')
  await page.locator('.todo-check').first().click()

  // Adventure zone = FF-style step-through: the TurnPicker pauses on the first ally.
  // ⚡全部自动 is the light player's path — the whole round resolves with defaults.
  const autoBtn = page.getByRole('button', { name: /全部自动/ })
  await expect(autoBtn).toBeVisible({ timeout: 10_000 })
  await autoBtn.click()

  // Round resolved: picker gone, enemy HP strictly below max.
  await expect(autoBtn).toBeHidden({ timeout: 10_000 })
  await expect
    .poll(async () => {
      const txt = (await hpLabel.textContent()) ?? ''
      const [hp] = txt.split('/').map((s) => parseInt(s.trim(), 10))
      return hp
    }, { timeout: 10_000 })
    .toBeLessThan(max0)

  // The todo is checked off and the round is in the combat log.
  await expect(page.locator('.todo-item.done').first()).toBeVisible()
})
