// Habit loop end to end: add a daily habit → check it → the roguelike buff draft opens
// → pick one → the buff badge shows on the battle stage. (§ habit design: habits never
// attack; the draft IS the reward.)

import { expect, test } from '@playwright/test'
import { freshGame } from './helpers'

test('completing a habit offers the buff draft; picking one shows the badge', async ({ page }) => {
  await freshGame(page)

  // Add a habit through the real form (the 习惯 panel sits under the todo panel).
  await page.getByPlaceholder(/养成一个习惯/).fill('晨间拉伸')
  await page.keyboard.press('Enter')
  const habitRow = page.locator('.habit-item', { hasText: '晨间拉伸' }).first()
  await expect(habitRow).toBeVisible()

  // Check it off → the choose-1-of-3 draft modal appears.
  await habitRow.locator('.todo-check').click()
  const modal = page.locator('.buff-modal').first()
  await expect(modal).toBeVisible({ timeout: 10_000 })

  // Pick the first buff option.
  await modal.locator('.buff-card').first().click()
  await expect(modal).toBeHidden({ timeout: 5_000 })

  // The party-wide buff badge appears on the battle stage.
  await expect(page.locator('.buff-band .buff-badge').first()).toBeVisible({ timeout: 5_000 })
})
