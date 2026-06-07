import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/ftqa_phaseCD'
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:5173/'
const b = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:7890', bypass: 'localhost,127.0.0.1,::1,[::1]' } })
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, locale: 'zh-CN' })
const p = await ctx.newPage()
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await p.goto(URL, { waitUntil: 'domcontentloaded' })
await p.evaluate(async () => { try { localStorage.clear() } catch {}; const ds = (await indexedDB.databases?.()) || [{ name: 'fantasy-traveler' }]; await Promise.all(ds.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r() }))) })
await p.reload({ waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready).catch(() => {})
await p.waitForSelector('.modal')
await p.fill('input[placeholder="旅人"]', '阿旅')
await p.locator('.modal-actions button', { hasText: '开始冒险' }).click()
await p.waitForSelector('.todo-add')

// Start a quest (offline fallback)
await p.locator('.tabbar button', { hasText: '副本' }).click()
await p.locator('button', { hasText: '开始副本' }).click()
await p.waitForSelector('.quest-card', { timeout: 15000 })
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(400)
await p.screenshot({ path: `${OUT}/quest-started.png` })
const enemy0 = await p.locator('.boss-name').innerText()
const narration0 = await p.locator('.stage-narration').count()

// Hammer high-priority todos until the recruit modal appears.
let recruited = false
let i = 0
for (; i < 45; i++) {
  await p.fill('.todo-add input[placeholder*="要完成"]', `任务${i}`)
  await p.selectOption('.todo-add select', 'high')
  await p.locator('.todo-add button', { hasText: '添加' }).click()
  await p.locator('.todo-check:not([disabled])').first().click()
  await p.waitForTimeout(180)
  if (await p.locator('.recruit-modal').count()) { recruited = true; break }
}

await p.waitForTimeout(300)
await p.screenshot({ path: `${OUT}/recruit-modal.png` })
const recruitName = recruited ? await p.locator('.recruit-name').innerText() : '(none)'

if (recruited) {
  await p.locator('.recruit-modal button', { hasText: '加入队伍' }).click()
  await p.waitForTimeout(300)
}

// Party tab → should now include the recruit
await p.locator('.tabbar button', { hasText: '队伍' }).click()
await p.waitForSelector('.party-list')
await p.screenshot({ path: `${OUT}/party-after.png` })
const partyText = (await p.locator('.party-list').allInnerTexts()).join(' | ')

console.log('first enemy (boss name):', enemy0)
console.log('narration shown at quest start:', narration0 > 0)
console.log('completions to finish quest:', i + 1)
console.log('recruited:', recruited, '->', recruitName.replace(/\n/g, ' '))
console.log('party after:', partyText.replace(/\n/g, ' '))
console.log('console errors:', errors.length, errors.slice(0, 5))
await b.close()
