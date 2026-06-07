// Todo store: un-check (reopen), edit (update), drag-reorder (reorder), and the
// grant-once economy guarantee. Runs against a real (faked) IndexedDB.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { todosRepo } from '../data/repositories'
import type { Todo } from '../domain/types'
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

const openIds = () =>
  useTodos.getState().todos.filter((t) => t.status === 'open').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => t.id)

describe('todo store — un-check / edit / reorder', () => {
  it('reopen un-checks a todo and re-completing does NOT re-grant rewards (grant-once)', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const companionId = useGame.getState().characters.find((c) => c.kind === 'companion')!.id

    await useTodos.getState().add({ title: '攻克难关', priority: 'high' })
    const id = useTodos.getState().todos[0].id
    await useTodos.getState().complete(id)

    const hpAfterFirst = useGame.getState().gameState!.monster.hp
    const affinityAfterFirst = useGame.getState().affinities[companionId].points
    const countAfterFirst = useTodos.getState().completionCount
    expect(hpAfterFirst).toBeLessThan(900) // monster took damage
    expect(useTodos.getState().todos[0].rewardedAt).toBeTruthy()

    // Un-check.
    await useTodos.getState().reopen(id)
    const reopened = useTodos.getState().todos[0]
    expect(reopened.status).toBe('open')
    expect(reopened.completedAt).toBeUndefined()
    expect(reopened.rewardedAt).toBeTruthy() // payout marker survives the un-check

    // Re-complete: marked done again, but the economy must not move.
    useGame.setState({ reaction: null })
    await useTodos.getState().complete(id)
    expect(useTodos.getState().todos[0].status).toBe('done')
    expect(useGame.getState().gameState!.monster.hp).toBe(hpAfterFirst) // no extra damage
    expect(useGame.getState().affinities[companionId].points).toBe(affinityAfterFirst)
    expect(useTodos.getState().completionCount).toBe(countAfterFirst)
    expect(useGame.getState().reaction).toBeNull() // no felt-reward reaction on re-complete
  })

  it('update edits fields and refuses to blank the title', async () => {
    await useTodos.getState().add({ title: '初稿', priority: 'low' })
    const id = useTodos.getState().todos[0].id

    await useTodos.getState().update(id, { title: '终稿', priority: 'high', due: '2026-06-01' })
    let t = useTodos.getState().todos[0]
    expect(t.title).toBe('终稿')
    expect(t.priority).toBe('high')
    expect(t.due).toBe('2026-06-01')

    await useTodos.getState().update(id, { due: '' }) // clear the date
    expect(useTodos.getState().todos[0].due).toBeUndefined()

    await useTodos.getState().update(id, { title: '   ' }) // blank → ignored
    t = useTodos.getState().todos[0]
    expect(t.title).toBe('终稿')
    expect(t.priority).toBe('high') // untouched fields preserved
  })

  it('reorder persists a new manual order that survives a reload', async () => {
    for (const title of ['A', 'B', 'C']) await useTodos.getState().add({ title, priority: 'med' })
    const [a, b, c] = useTodos.getState().todos.map((t) => t.id)

    await useTodos.getState().reorder([c, a, b])
    expect(openIds()).toEqual([c, a, b])

    // Simulate a page reload: clear memory, re-hydrate from IDB.
    useTodos.setState({ todos: [], loaded: false })
    await useTodos.getState().hydrate()
    expect(openIds()).toEqual([c, a, b])
  })

  it('add assigns an increasing order; legacy todos missing order are backfilled on hydrate', async () => {
    // A legacy todo written straight to IDB with no `order`.
    const legacy: Todo = {
      id: 'legacy-1', title: '旧任务', priority: 'med', status: 'open', tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    await todosRepo.put(legacy)

    await useTodos.getState().hydrate()
    const got = useTodos.getState().todos.find((t) => t.id === 'legacy-1')!
    expect(got.order).toBeTypeOf('number') // backfilled in memory
    expect((await todosRepo.get('legacy-1'))!.order).toBeTypeOf('number') // and persisted

    await useTodos.getState().add({ title: '新任务', priority: 'med' })
    const fresh = useTodos.getState().todos.find((t) => t.title === '新任务')!
    expect(fresh.order!).toBeGreaterThan(got.order!) // appended after
  })
})
