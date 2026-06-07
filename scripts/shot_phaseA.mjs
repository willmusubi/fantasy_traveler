import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/ftqa_phaseA'
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:5173/'
const b = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:7890', bypass: 'localhost,127.0.0.1,::1,[::1]' } })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
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
// keep default vanguard (base atk 18)
await p.locator('.modal-actions button', { hasText: '开始冒险' }).click()
await p.waitForSelector('.todo-add')

// Equipment tab
await p.locator('.tabbar button', { hasText: '装备' }).click()
await p.waitForSelector('.gear-stats')
await p.screenshot({ path: `${OUT}/gear-before.png` })
const atkBefore = await p.locator('.gear-stat').first().innerText()
// equip the starter dagger from 背包
await p.locator('.gear-row .btn', { hasText: '装备' }).first().click()
await p.waitForTimeout(400)
await p.screenshot({ path: `${OUT}/gear-after.png` })
const atkAfter = await p.locator('.gear-stat').first().innerText()
const hasDelta = await p.locator('.gear-delta').count()

// Party tab
await p.locator('.tabbar button', { hasText: '队伍' }).click()
await p.waitForSelector('.party-list')
await p.screenshot({ path: `${OUT}/party.png` })
const partyText = await p.locator('.party-list').first().innerText()

console.log('ATK before:', atkBefore.replace(/\n/g, ' '))
console.log('ATK after :', atkAfter.replace(/\n/g, ' '))
console.log('delta shown:', hasDelta > 0)
console.log('party:', partyText.replace(/\n/g, ' | '))
console.log('console errors:', errors.length, errors.slice(0, 5))
await b.close()
