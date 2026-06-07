// Gold economy + shop: earning gold through play, and spending it on potions/equipment.

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
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamage: null, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

const playerId = () => useGame.getState().characters.find((c) => c.kind === 'player')!.id

describe('gold economy + shop', () => {
  it('earns gold by completing a todo', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    expect(useGame.getState().gameState!.gold).toBe(0)
    await useTodos.getState().add({ title: '赚点钱', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id)
    expect(useGame.getState().gameState!.gold).toBe(3) // GOLD_TODO.high (small per-task chip)
  })

  it('buying an HP potion spends gold and heals the party', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const gs = useGame.getState().gameState!
    useGame.setState({ gameState: { ...gs, gold: 100, resources: { [playerId()]: { hp: 10, mp: 0 } } } })

    await useGame.getState().buyPotion('hp_potion') // price 50, heal 80
    expect(useGame.getState().gameState!.gold).toBe(50)
    expect(useGame.getState().gameState!.resources[playerId()].hp).toBe(90) // 10 + 80
  })

  it('buying equipment spends gold and adds it to the stash', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const gs = useGame.getState().gameState!
    const before = gs.ownedEquipment.length
    useGame.setState({ gameState: { ...gs, gold: 200 } })

    await useGame.getState().buyEquipment('starlit_blade') // price 180
    expect(useGame.getState().gameState!.gold).toBe(20)
    expect(useGame.getState().gameState!.ownedEquipment.length).toBe(before + 1)
  })

  it('refuses a purchase the player cannot afford', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard') // gold 0
    await useGame.getState().buyPotion('hp_potion')
    expect(useGame.getState().gameState!.gold).toBe(0)
  })
})
