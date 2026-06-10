// Combat log: each dispatched round appends a readable, numbered entry to
// gameState.combatLog (party ↔ enemy interactions), persisted with game state.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

const companionId = () => useGame.getState().characters.find((c) => c.kind === 'companion')!.id
const lastRound = () => {
  const log = useGame.getState().gameState!.combatLog
  return log[log.length - 1]
}
const texts = () => lastRound().lines.map((l) => l.text).join('\n')

describe('combat log', () => {
  it('records rounds (party attacks, enemy attack, XP, gold) as todos are completed', async () => {
    await useGame.getState().seedNewGame('阿旅')
    // Two completions — the enemy's gauge fills and it attacks on its turn by the second round.
    for (let i = 0; i < 2; i++) {
      await useTodos.getState().add({ title: `记一笔${i}`, priority: 'high' })
      await useTodos.getState().complete(useTodos.getState().todos.find((x) => x.status === 'open')!.id)
    }
    const all = useGame.getState().gameState!.combatLog.flatMap((r) => r.lines.map((l) => l.text)).join('\n')
    expect(all).toContain('→') // a party member struck the enemy ("米拉 → 拖延心魔 -40")
    expect(all).toContain('进攻') // the enemy attacked on its turn once charged
    expect(all).toContain('经验')
    expect(all).toContain('金币')
  })

  it('records the caster and skill name when a planned skill fires', async () => {
    await useGame.getState().seedNewGame('阿旅')
    await useGame.getState().setRoundAction(companionId(), 'liuguang') // plan 米拉 → 流光击
    await useTodos.getState().add({ title: '出击', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id) // executes the round
    expect(texts()).toContain('流光击') // 米拉's skill, by name
    expect(texts()).toContain('米拉')
  })

  it('keeps the log bounded across many rounds', async () => {
    await useGame.getState().seedNewGame('阿旅')
    for (let i = 0; i < 6; i++) {
      await useTodos.getState().add({ title: `t${i}`, priority: 'low' })
      await useTodos.getState().complete(useTodos.getState().todos.find((x) => x.status === 'open')!.id)
    }
    const log = useGame.getState().gameState!.combatLog
    expect(log.length).toBe(6) // one per completion (well under the cap)
    // survives a reload
    useGame.setState({ gameState: null, characters: [], affinities: {}, ready: false })
    await useGame.getState().hydrate()
    expect(useGame.getState().gameState!.combatLog.length).toBe(6)
  })
})
