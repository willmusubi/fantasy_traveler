// Interactive (FF-style) step-through, driven through the real stores + a faked IndexedDB:
// completing a task opens a round, the player steps each ally's turn, and the round finalizes as
// ONE logged round with a single reward payout. Also covers victory-at-finalize, the concurrency
// guard, and resume-after-reload (activeRound is persisted).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { gameStateRepo } from '../data/repositories'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, victorySummary: null, steppingEnabled: false, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

const openId = () => useTodos.getState().todos.find((t) => t.status === 'open')!.id
const ar = () => useGame.getState().gameState!.activeRound

/** Step every ally decision with a basic attack until the round finalizes. */
async function stepToEnd(choice: 'basic' = 'basic') {
  let guard = 0
  while (useGame.getState().gameState!.activeRound && guard++ < 30) {
    await useGame.getState().advanceRound(choice)
  }
}

describe('interactive round (step-through)', () => {
  it('opens a round on completion and resolves it as ONE logged round, paid once', async () => {
    await useGame.getState().seedNewGame('阿旅')
    useGame.getState().setSteppingEnabled(true)
    await useTodos.getState().add({ title: '出击', priority: 'high' })

    await useTodos.getState().complete(openId())
    expect(ar()).toBeTruthy() // paused, waiting for the first ally decision
    const hpBefore = useGame.getState().gameState!.enemies[0].hp

    await stepToEnd()

    const gs = useGame.getState().gameState!
    expect(gs.activeRound).toBeUndefined() // finalized
    expect(gs.enemies[0].hp).toBeLessThan(hpBefore) // the party struck it
    expect(gs.combatLog.length).toBe(1) // exactly one entry for the whole round
    expect(useTodos.getState().completionCount).toBe(1) // the felt-reward reaction fired once
  })

  it('shows the victory settlement once when the killing blow lands mid-round', async () => {
    await useGame.getState().seedNewGame('阿旅')
    useGame.getState().setSteppingEnabled(true)
    // Weaken the enemy to 1 HP in IDB (the dispatch reads game state from the DB, not the store).
    const gs0 = useGame.getState().gameState!
    const weak = { ...gs0, enemies: [{ ...gs0.enemies[0], hp: 1 }] }
    await gameStateRepo.put(weak)
    useGame.setState({ gameState: weak })

    await useTodos.getState().add({ title: '终结', priority: 'high' })
    await useTodos.getState().complete(openId())
    await stepToEnd()

    expect(useGame.getState().gameState!.activeRound).toBeUndefined()
    expect(useGame.getState().victorySummary).toBeTruthy() // settlement window, at finalize
    expect(useGame.getState().gameState!.combatLog.length).toBe(1)
    expect(useGame.getState().gameState!.storyStage).toBe(1) // advanced past the kill
  })

  it('blocks starting a second round while one is still resolving', async () => {
    await useGame.getState().seedNewGame('阿旅')
    useGame.getState().setSteppingEnabled(true)
    await useTodos.getState().add({ title: 'a', priority: 'high' })
    await useTodos.getState().add({ title: 'b', priority: 'high' })
    const [a, b] = useTodos.getState().todos.map((t) => t.id)

    await useTodos.getState().complete(a)
    expect(ar()).toBeTruthy()
    await useTodos.getState().complete(b) // refused — a round is active

    expect(useTodos.getState().todos.find((t) => t.id === b)!.status).toBe('open')
  })

  it('persists an in-progress round and resumes it after a reload', async () => {
    await useGame.getState().seedNewGame('阿旅')
    useGame.getState().setSteppingEnabled(true)
    await useTodos.getState().add({ title: 't', priority: 'high' })
    await useTodos.getState().complete(openId())
    expect(ar()).toBeTruthy()
    const indexBefore = ar()!.index

    // Simulate a reload: drop in-memory state, re-hydrate from IDB.
    useGame.setState({ gameState: null, characters: [], affinities: {}, ready: false })
    await useGame.getState().hydrate()
    expect(ar()).toBeTruthy()
    expect(ar()!.index).toBe(indexBefore) // resumed from the same point

    await stepToEnd()
    expect(useGame.getState().gameState!.activeRound).toBeUndefined()
    expect(useGame.getState().gameState!.combatLog.length).toBe(1)
  })
})
