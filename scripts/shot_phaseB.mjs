import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/ftqa_phaseB'
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

// Quest tab
await p.locator('.tabbar button', { hasText: '副本' }).click()
await p.waitForSelector('.quest-empty', { timeout: 5000 })
await p.screenshot({ path: `${OUT}/quest-empty.png` })

// Start quest (no API key → offline fallback)
await p.locator('.quest-empty button', { hasText: '开始副本' }).click()
await p.waitForSelector('.quest-card', { timeout: 15000 })
await p.waitForTimeout(300)
await p.screenshot({ path: `${OUT}/quest-card.png` })

const title = await p.locator('.quest-title').innerText()
const encounters = await p.locator('.quest-encounters li').count()
const rewards = await p.locator('.reward-chip').allInnerTexts()

// Persistence: reload, return to quest tab, expect the same quest.
await p.reload({ waitUntil: 'networkidle' })
await p.waitForSelector('.todo-add')
await p.locator('.tabbar button', { hasText: '副本' }).click()
await p.waitForSelector('.quest-card', { timeout: 5000 })
const titleAfter = await p.locator('.quest-title').innerText()

console.log('quest title:', title)
console.log('encounters:', encounters)
console.log('rewards:', rewards.join(' / '))
console.log('persisted title after reload:', titleAfter, '(same:', title === titleAfter, ')')
console.log('console errors:', errors.length, errors.slice(0, 5))
await b.close()
