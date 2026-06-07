// End-to-end M0 loop against a real (faked) IndexedDB. Exercises the exact path
// the browser runs: db → repositories → pipeline transaction → reducer → stores →
// canned reaction. Deterministic substitute for the headless-browser smoke test.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { gameStateRepo } from '../data/repositories'
import type { GameState } from '../domain/types'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'

beforeEach(async () => {
  // Close any open connection so deleteDatabase isn't blocked, then start fresh.
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamage: null, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

describe('M0 end-to-end loop', () => {
  it('onboard → add high todos → complete → monster damaged, affinity rank-up, XP, reaction', async () => {
    // 1. Onboarding seeds the game (player vanguard + 来生瞳 + demo affinity 90).
    await useGame.getState().seedNewGame('测试旅人', 'vanguard')
    const g0 = useGame.getState()
    expect(g0.gameState).toBeTruthy()
    const startHp = g0.gameState!.monster.maxHp // 900 at stage 0, 0 open-high
    expect(startHp).toBe(900)
    const companionId = g0.characters.find((c) => c.kind === 'companion')!.id
    expect(g0.affinities[companionId].points).toBe(90) // demo seed

    // 2. Add two high-priority todos and complete both.
    await useTodos.getState().add({ title: '打败拖延心魔', priority: 'high' })
    await useTodos.getState().add({ title: '写晨间计划', priority: 'high' })
    const ids = useTodos.getState().todos.map((t) => t.id)
    await useTodos.getState().complete(ids[0])
    await useTodos.getState().complete(ids[1])

    const g = useGame.getState()

    // Persistent CTB: each completion lands ~the party's worth of hits and the enemy interjects
    // once charged; exact totals shift as gauges carry, so assert it was hit hard but not felled.
    expect(g.gameState!.monster.hp).toBeGreaterThan(0)
    expect(g.gameState!.monster.hp).toBeLessThan(startHp - 100)

    // Affinity 90 → 95 → 100 = rank B, with a rank-up toast.
    expect(g.affinities[companionId].points).toBe(100)
    expect(g.affinities[companionId].rank).toBe('B')
    expect(g.toasts.some((t) => t.kind === 'rankup')).toBe(true)

    // Player chip-XP persisted (2 × 8 = 16; the bulk comes on defeat, not per task).
    const player = g.characters.find((c) => c.kind === 'player')!
    expect(player.stats.xp).toBe(16)
    expect(player.stats.level).toBe(1)

    // The felt reward: an in-character companion reaction is showing.
    expect(g.reaction).toBeTruthy()
    expect(g.reaction!.text.length).toBeGreaterThan(0)
    expect(g.reaction!.affinityDelta).toBe(5)

    // Both todos are marked done and persisted.
    expect(useTodos.getState().todos.every((t) => t.status === 'done')).toBe(true)
  })

  it('reloads persisted state from IndexedDB (hydrate)', async () => {
    await useGame.getState().seedNewGame('阿旅', 'striker')
    await useTodos.getState().add({ title: '复盘', priority: 'med' })

    // Simulate a fresh page load: close + reopen the connection, re-hydrate.
    await closeDb()
    useGame.setState({ gameState: null, characters: [], affinities: {}, ready: false })
    useTodos.setState({ todos: [], loaded: false })
    await useGame.getState().hydrate()
    await useTodos.getState().hydrate()

    expect(useGame.getState().gameState).toBeTruthy()
    expect(useGame.getState().characters.find((c) => c.kind === 'player')?.name).toBe('阿旅')
    expect(useTodos.getState().todos).toHaveLength(1)
  })

  it('overdue sweep grows the monster and sets a worried mood (once per day)', async () => {
    await useGame.getState().seedNewGame('测试', 'vanguard')
    const companionId = useGame.getState().characters.find((c) => c.kind === 'companion')!.id
    const maxHp0 = useGame.getState().gameState!.monster.maxHp

    // An overdue open todo (due yesterday).
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10)
    await useTodos.getState().add({ title: '逾期任务', priority: 'high', due: yesterday })

    await useTodos.getState().sweepOverdue()
    expect(useGame.getState().gameState!.monster.maxHp).toBeGreaterThan(maxHp0)
    expect(useGame.getState().gameState!.moodFlags[companionId]).toBe('worried')

    // Second sweep same day is a no-op (lastOverdueOn guard).
    const hpAfterFirst = useGame.getState().gameState!.monster.maxHp
    await useTodos.getState().sweepOverdue()
    expect(useGame.getState().gameState!.monster.maxHp).toBe(hpAfterFirst)
  })

  it('backfills §22 fields on a pre-v2 save (withDefaults)', async () => {
    // A v1-shaped save: no encounterIndex / unlockedCompanionIds / ownedEquipment.
    const oldSave = {
      partyIds: ['p1', 'c1'],
      monster: { id: 'm', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, growth: 1 },
      storyStage: 2,
      buffs: [],
      moodFlags: {},
      lastResolvedAt: '',
    } as unknown as GameState
    await gameStateRepo.put(oldSave)

    const loaded = await gameStateRepo.get()
    expect(loaded?.encounterIndex).toBe(0)
    expect(loaded?.unlockedCompanionIds).toEqual(['c1']) // companions in partyIds minus player
    expect(loaded?.ownedEquipment).toEqual([])
    expect(loaded?.monster.spd).toBe(9) // enemy speed backfilled for a pre-speed save
    expect(loaded?.storyStage).toBe(2) // existing data preserved
  })

  it('completing a story quest recruits a companion + drops loot (full pipeline, offline fallback)', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    // No API key in tests → buildAndGenerateQuest falls back to the authored quest.
    await useQuest.getState().startQuest('cats_eye')
    expect(useGame.getState().gameState!.activeQuestId).toBeTruthy()
    expect(useGame.getState().gameState!.monster.displayName).toBeTruthy() // encounter enemy

    // Hammer the quest with high-priority completions until it finishes.
    let guard = 0
    while (useGame.getState().gameState!.activeQuestId && guard < 80) {
      await useTodos.getState().add({ title: `任务${guard}`, priority: 'high' })
      const open = useTodos.getState().todos.find((t) => t.status === 'open')!
      await useTodos.getState().complete(open.id)
      guard++
    }

    const gs = useGame.getState().gameState!
    expect(gs.activeQuestId).toBeUndefined() // quest completed
    // 来生泪 recruited: a real companion Character + its own affinity record exist now.
    const companions = useGame.getState().characters.filter((c) => c.kind === 'companion')
    expect(companions.some((c) => c.id === 'raisei_rui')).toBe(true)
    expect(useGame.getState().affinities['raisei_rui']).toBeTruthy()
    expect(gs.unlockedCompanionIds).toContain('raisei_rui')
    // Loot dropped.
    expect(gs.ownedEquipment.some((e) => e.defId === 'moonlit_dagger')).toBe(true)
  })
})
