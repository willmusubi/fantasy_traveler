// Defeating an enemy aggregates a victory settlement (the prominent results window),
// with the enemy-scaled reward as the headline number.

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
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, victorySummary: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

describe('victory settlement', () => {
  it('is set when an enemy is defeated, with the enemy-scaled reward as the headline', async () => {
    await useGame.getState().seedNewGame('阿旅')
    expect(useGame.getState().victorySummary).toBeNull()

    // Hammer the training monster until it falls (§25 profiles: ~52 dmg/round vs 900 HP → ~18 rounds).
    let guard = 0
    while (!useGame.getState().victorySummary && guard < 30) {
      await useTodos.getState().add({ title: `t${guard}`, priority: 'high' })
      await useTodos.getState().complete(useTodos.getState().todos.find((t) => t.status === 'open')!.id)
      guard++
    }

    const vs = useGame.getState().victorySummary!
    expect(vs).toBeTruthy()
    expect(vs.enemy).toBe('拖延心魔') // the defeated training enemy, by name
    expect(vs.xp).toBeGreaterThan(100) // the defeat reward dominates the small chip XP
    expect(vs.gold).toBeGreaterThan(0)
  })

  it('does NOT set a settlement on a non-killing blow', async () => {
    await useGame.getState().seedNewGame('阿旅')
    await useTodos.getState().add({ title: '一击', priority: 'low' }) // tiny damage, enemy survives
    await useTodos.getState().complete(useTodos.getState().todos[0].id)
    expect(useGame.getState().victorySummary).toBeNull()
  })
})
