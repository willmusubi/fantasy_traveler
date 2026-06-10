// Regression: a persisted gameState missing §22 fields (e.g. unlockedCompanionIds)
// must not propagate back into the live store via dispatchEvent and crash a render.
// Reproduces the "完成任务 / 查看队伍 时页面无法显示" (blank page) bug.

import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { gameStateRepo } from '../data/repositories'
import type { GameState } from '../domain/types'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { PartyPanel } from '../ui/PartyPanel'

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
afterEach(cleanup)

describe('render resilience against legacy (pre-§22) saves', () => {
  it('PartyPanel renders after completing a todo on a save missing unlockedCompanionIds', async () => {
    // Seed a normal game, then overwrite the persisted gameState with a legacy
    // (pre-§22) shape — exactly what an older save in the browser looks like.
    await useGame.getState().seedNewGame('阿旅')
    const seeded = useGame.getState().gameState!
    const legacy = { ...seeded } as Partial<GameState>
    delete legacy.unlockedCompanionIds
    delete legacy.encounterIndex
    delete legacy.ownedEquipment
    await gameStateRepo.put(legacy as GameState)

    // Fresh page load: hydrate backfills the in-memory copy, so the first render is fine.
    await useGame.getState().hydrate()
    await useTodos.getState().hydrate()
    render(<PartyPanel />)
    expect(screen.getByText('队伍')).toBeInTheDocument()
    cleanup()

    // Complete a todo. dispatchEvent reads the RAW (legacy) gameState from IDB and
    // ingestResult writes it back to the store — re-introducing the missing field.
    await useTodos.getState().add({ title: '清理收件箱', priority: 'med' })
    const todo = useTodos.getState().todos[0]
    await useTodos.getState().complete(todo.id)

    // The live store must still hold a well-formed gameState…
    expect(Array.isArray(useGame.getState().gameState!.unlockedCompanionIds)).toBe(true)

    // …and viewing the party must not blank the page.
    expect(() => render(<PartyPanel />)).not.toThrow()
    expect(screen.getByText('队伍')).toBeInTheDocument()
  })
})
