import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.env.FTQA_OUT || '/tmp/ftqa'
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:5173/'

// Route external requests (the Zpix webfont) through the dev proxy, but keep
// localhost direct so we can reach the Vite dev server.
const browser = await chromium.launch({
  headless: true,
  proxy: { server: 'http://127.0.0.1:7890', bypass: 'localhost,127.0.0.1,::1,[::1]' },
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-CN' })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`shot: ${name}`)
}

async function clearState() {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    try { localStorage.clear() } catch {}
    const dbs = (await indexedDB.databases?.()) || [{ name: 'fantasy-traveler' }]
    await Promise.all(
      dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res() })),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(400)
}

try {
  await clearState()
  await page.waitForSelector('.modal', { timeout: 8000 })
  await shot('01-onboarding')

  // Onboarding: name + pick a class + start.
  await page.fill('input[placeholder="旅人"]', '测试旅人')
  await page.locator('.class-card', { hasText: '影刺' }).click()
  await shot('02-onboarding-filled')
  await page.locator('.modal-actions button', { hasText: '开始冒险' }).click()

  await page.waitForSelector('.todo-add', { timeout: 8000 })
  await shot('03-dashboard-empty')

  // Add a few todos.
  const addTodo = async (title, prio) => {
    await page.fill('.todo-add input[placeholder*="要完成"]', title)
    await page.selectOption('.todo-add select', prio)
    await page.locator('.todo-add button', { hasText: '添加' }).click()
  }
  await addTodo('打败拖延心魔', 'high')
  await addTodo('写晨间计划', 'high')
  await addTodo('喝水休息', 'low')
  await page.waitForSelector('.todo-item')
  await shot('04-todos')

  // Complete one → reaction.
  await page.locator('.todo-check:not([disabled])').first().click()
  await page.waitForSelector('.reaction-bubble', { timeout: 8000 })
  await shot('05-reaction')

  // Complete second → expect rank-up toast.
  await page.locator('.todo-check:not([disabled])').first().click()
  await page.waitForTimeout(900)
  await shot('06-after-second')

  // Chat without API key → error banner.
  await page.fill('.chat-input input', '今天我该先做什么？')
  await page.locator('.chat-input button', { hasText: '发送' }).click()
  await page.waitForTimeout(700)
  await shot('07-chat-nokey')

  // Settings modal.
  await page.locator('header button', { hasText: '设置' }).click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  await shot('08-settings')
  await page.locator('.modal-actions button', { hasText: '取消' }).click()

  // Mobile viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await shot('09-mobile')

  // Report a few computed facts.
  const facts = await page.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth,
    innerW: window.innerWidth,
    hp: document.querySelector('.hpbar-label')?.textContent,
    rank: document.querySelector('.affinity-rank')?.textContent,
    chip: document.querySelector('.chip')?.textContent,
  }))
  console.log('FACTS', JSON.stringify(facts))
} catch (e) {
  console.log('SCRIPT ERROR:', e.message)
  await shot('99-error-state')
} finally {
  console.log('CONSOLE ISSUES:', errors.length)
  errors.forEach((e) => console.log('  ' + e))
  await browser.close()
}
