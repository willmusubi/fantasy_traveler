// Shared e2e helpers: every spec starts from a FRESH IndexedDB (each Playwright test
// gets an isolated browser context, so no cross-test bleed) and walks onboarding.

import { expect, type Page } from '@playwright/test'

/** Load the app and create a new game (fresh context ⇒ onboarding always shows). */
export async function freshGame(page: Page, name = '测试旅人'): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const nameInput = page.getByPlaceholder('旅人') // the label isn't htmlFor-associated
  await expect(nameInput).toBeVisible({ timeout: 15_000 })
  await nameInput.fill(name)
  await page.getByRole('button', { name: '开始冒险' }).click()
  // The adventure dashboard is up once the battle stage panel renders.
  await expect(page.locator('.battle-stage')).toBeVisible({ timeout: 15_000 })
}

/** Add a todo through the real form. */
export async function addTodo(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder('要完成什么？（完成它来攻击心魔）').fill(title)
  await page.keyboard.press('Enter')
  await expect(page.locator('.todo-item', { hasText: title })).toBeVisible()
}
