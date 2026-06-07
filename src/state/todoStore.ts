import { create } from 'zustand'
import { pickCompletionLine, pickWorriedLine } from '../companion/cannedLines'
import { todosRepo } from '../data/repositories'
import { isOverdue, localDateKey } from '../domain/dates'
import type { Priority, Todo } from '../domain/types'
import { dispatchEvent } from '../game/pipeline'
import { selectPartyCompanions, useGame } from './gameStore'

interface AddInput {
  title: string
  priority: Priority
  due?: string
}

/** Editable fields. Absent keys are left unchanged; `due: ''` clears the date. */
interface UpdateInput {
  title?: string
  priority?: Priority
  due?: string
}

interface TodoStore {
  todos: Todo[]
  loaded: boolean
  completionCount: number
  hydrate: () => Promise<void>
  add: (input: AddInput) => Promise<void>
  complete: (id: string) => Promise<void>
  reopen: (id: string) => Promise<void>
  update: (id: string, patch: UpdateInput) => Promise<void>
  /** Persist a new manual order for the open list (ids top-to-bottom). */
  reorder: (orderedOpenIds: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  sweepOverdue: () => Promise<void>
}

/** Next free sort position (after the current max). */
function nextOrder(todos: Todo[]): number {
  return todos.reduce((m, t) => Math.max(m, t.order ?? 0), 0) + 1
}

/** Assign an `order` to any todo missing one (by createdAt), after the current max.
 *  Returns the full list plus just the todos that changed (to persist). */
function backfillOrder(todos: Todo[]): { todos: Todo[]; changed: Todo[] } {
  const missing = todos.filter((t) => t.order == null)
  if (missing.length === 0) return { todos, changed: [] }
  let next = nextOrder(todos)
  const assigned = new Map<string, number>()
  for (const t of [...missing].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    assigned.set(t.id, next++)
  }
  const out = todos.map((t) => (assigned.has(t.id) ? { ...t, order: assigned.get(t.id)! } : t))
  return { todos: out, changed: out.filter((t) => assigned.has(t.id)) }
}

/** Sort comparator: manual order asc, then createdAt asc as a stable tiebreaker. */
export function byOrder(a: Todo, b: Todo): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt)
}

export const useTodos = create<TodoStore>((set, get) => ({
  todos: [],
  loaded: false,
  completionCount: 0,

  async hydrate() {
    const { todos, changed } = backfillOrder(await todosRepo.all())
    // Persist freshly-assigned orders so the manual sort survives the next reload.
    for (const t of changed) await todosRepo.put(t)
    set({ todos, loaded: true })
  },

  async add(input) {
    const now = new Date()
    const todo: Todo = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      priority: input.priority,
      due: input.due || undefined,
      status: 'open',
      tags: [],
      order: nextOrder(get().todos),
      createdAt: now.toISOString(),
    }
    if (!todo.title) return
    await todosRepo.put(todo)
    set({ todos: [...get().todos, todo] })
  },

  async complete(id) {
    const todo = get().todos.find((t) => t.id === id)
    if (!todo || todo.status === 'done') return

    // Grant-once: a todo that already paid out (then got un-checked) is re-marked done
    // WITHOUT re-running the economy — no XP/affinity/damage, no reaction. (§ user choice)
    if (todo.rewardedAt) {
      const redone: Todo = { ...todo, status: 'done', completedAt: new Date().toISOString() }
      await todosRepo.put(redone)
      set({ todos: get().todos.map((t) => (t.id === id ? redone : t)) })
      return
    }

    const stamp = new Date().toISOString()
    const updated: Todo = {
      ...todo,
      status: 'done',
      completedAt: stamp,
      rewardedAt: stamp,
      lastOverdueOn: undefined,
    }

    const result = await dispatchEvent(
      { type: 'TodoCompleted', todo: updated },
      { prewrite: async ({ todos }) => void (await todos.put(updated)) },
    )

    set({ todos: get().todos.map((t) => (t.id === id ? updated : t)) })

    useGame.getState().ingestResult(result)

    // The felt reward: a RANDOM on-field companion pipes up (canned, no LLM), shown with her
    // portrait in the global ReactionPopup. Affinity now goes to the whole party, so the
    // float shows that reactor's own gain.
    const companions = selectPartyCompanions(useGame.getState())
    const reactor = companions[Math.floor(Math.random() * companions.length)]
    if (reactor) {
      const n = get().completionCount
      const line = pickCompletionLine(reactor.id, todo.priority, n)
      const aff = result.effects.find((e) => e.type === 'affinity' && e.characterId === reactor.id)
      useGame.getState().showReaction({
        companionId: reactor.id,
        text: line.text,
        expression: line.expression,
        affinityDelta: aff && aff.type === 'affinity' ? aff.amount : 0,
      })
      set({ completionCount: n + 1 })
    }

    // Recruits / quest completion add new Character + Affinity rows → refresh from IDB.
    if (result.effects.some((e) => e.type === 'recruited' || e.type === 'questCompleted')) {
      await useGame.getState().hydrate()
    }
  },

  async reopen(id) {
    const todo = get().todos.find((t) => t.id === id)
    if (!todo || todo.status !== 'done') return
    // Un-check: back to open, clear completedAt. rewardedAt is kept so re-completing
    // won't re-grant. Move it to the bottom of the open list (most-recent action).
    const reopened: Todo = {
      ...todo,
      status: 'open',
      completedAt: undefined,
      order: nextOrder(get().todos),
    }
    await todosRepo.put(reopened)
    set({ todos: get().todos.map((t) => (t.id === id ? reopened : t)) })
  },

  async update(id, patch) {
    const todo = get().todos.find((t) => t.id === id)
    if (!todo) return
    const title = patch.title !== undefined ? patch.title.trim() : todo.title
    if (!title) return // never blank out the title
    const updated: Todo = {
      ...todo,
      title,
      priority: patch.priority ?? todo.priority,
      due: patch.due !== undefined ? patch.due || undefined : todo.due,
    }
    await todosRepo.put(updated)
    set({ todos: get().todos.map((t) => (t.id === id ? updated : t)) })
  },

  async reorder(orderedOpenIds) {
    const byId = new Map(get().todos.map((t) => [t.id, t]))
    const updates: Todo[] = []
    orderedOpenIds.forEach((id, i) => {
      const t = byId.get(id)
      if (t && t.order !== i) updates.push({ ...t, order: i })
    })
    if (updates.length === 0) return
    for (const t of updates) await todosRepo.put(t)
    const patch = new Map(updates.map((t) => [t.id, t]))
    set({ todos: get().todos.map((t) => patch.get(t.id) ?? t) })
  },

  async remove(id) {
    await todosRepo.delete(id)
    set({ todos: get().todos.filter((t) => t.id !== id) })
  },

  async sweepOverdue() {
    const now = new Date()
    const today = localDateKey(now)
    const due = get().todos.filter(
      (t) => t.status === 'open' && isOverdue(t.due, now) && t.lastOverdueOn !== today,
    )
    if (due.length === 0) return

    for (const todo of due) {
      const updated: Todo = { ...todo, lastOverdueOn: today }
      const result = await dispatchEvent(
        { type: 'TodoOverdue', todo: updated },
        { prewrite: async ({ todos }) => void (await todos.put(updated)) },
      )
      set({ todos: get().todos.map((t) => (t.id === todo.id ? updated : t)) })
      useGame.getState().ingestResult(result)
    }

    // One gentle worried reaction (not per-todo spam), from a random on-field companion.
    const companions = selectPartyCompanions(useGame.getState())
    const reactor = companions[Math.floor(Math.random() * companions.length)]
    if (reactor) {
      const line = pickWorriedLine(reactor.id, due.length)
      useGame.getState().showReaction({
        companionId: reactor.id,
        text: line.text,
        expression: line.expression,
        affinityDelta: 0,
      })
    }
  },
}))
