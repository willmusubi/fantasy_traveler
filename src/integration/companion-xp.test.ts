// Companion growth + the MP stat, exercised through the real pipeline (faked IDB):
// every on-field companion gains XP, stats persist, and a pre-MP save is backfilled.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { charactersRepo } from '../data/repositories'
import type { Character } from '../domain/types'
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

const xpOf = (id: string) => useGame.getState().characters.find((c) => c.id === id)!.stats.xp

describe('companion XP + MP stat', () => {
  it('every on-field companion gains XP when a todo is completed, and it persists', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const companionId = useGame.getState().characters.find((c) => c.kind === 'companion')!.id
    const playerId = useGame.getState().characters.find((c) => c.kind === 'player')!.id
    expect(xpOf(companionId)).toBe(0)

    await useTodos.getState().add({ title: '高优任务', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id)

    expect(xpOf(playerId)).toBe(8) // TODO_XP.high (small per-task chip; enemy survived)
    expect(xpOf(companionId)).toBe(8) // companion grows alongside the player
    // Persisted to IndexedDB, not just in memory.
    expect((await charactersRepo.get(companionId))!.stats.xp).toBe(8)
  })

  it('seeded characters carry an MP pool bound to their class', async () => {
    await useGame.getState().seedNewGame('术士', 'arcanist')
    const player = useGame.getState().characters.find((c) => c.kind === 'player')!
    expect(player.stats.maxMp).toBe(70) // arcanist L1 base MP (caster → large pool)
    const companion = useGame.getState().characters.find((c) => c.kind === 'companion')!
    expect(companion.stats.maxMp).toBeGreaterThan(0)
  })

  it('backfills maxMp on a pre-MP character save at read time', async () => {
    await useGame.getState().seedNewGame('阿旅', 'medic')
    const player = useGame.getState().characters.find((c) => c.kind === 'player')!
    // A legacy row written before maxMp existed (omit it explicitly).
    const s = player.stats
    const legacy = {
      ...player,
      stats: { level: s.level, xp: s.xp, maxHp: s.maxHp, atk: s.atk, def: s.def, spd: s.spd, mag: s.mag },
    } as unknown as Character
    await charactersRepo.put(legacy)

    const reloaded = await charactersRepo.get(player.id)
    expect(reloaded!.stats.maxMp).toBe(60) // medic L1 base MP, recomputed from class+level
  })
})
