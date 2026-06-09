import { create } from 'zustand'
import { pickCompletionLine, pickWorriedLine } from '../companion/cannedLines'
import { todosRepo } from '../data/repositories'
import { dueDateKey, dueDeadline, isOverdue, localDateKey } from '../domain/dates'
import type { Priority, Todo } from '../domain/types'
import { dispatchEvent } from '../game/pipeline'
import type { ReducerResult } from '../game/reducer'
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
  /** Arm a countdown on an open todo: set duration + started-at, clear any prior fired guard. */
  startTimer: (id: string, durationMs: number) => Promise<void>
  /** Disarm a countdown: clear all three timer fields (the ✕ control / lifecycle). */
  cancelTimer: (id: string) => Promise<void>
  /** Fire one expiry: dispatch TaskTimerExpired + ingest + stamp timerFiredAt (one sweep iteration). */
  fireTimerExpiry: (id: string) => Promise<void>
  /** Boot/focus + 1s-heartbeat catch-up: fire every armed timer whose deadline has passed. */
  sweepTimers: () => Promise<void>
}

/** Ids whose TaskTimerExpired dispatch is in-flight. fireTimerExpiry is reached from three
 *  fire-and-forget sweepTimers callers (boot, window focus, the 1s heartbeat) that can overlap;
 *  the `!timerFiredAt` guard reads the in-memory todo, which isn't stamped until AFTER the async
 *  dispatch, so two concurrent sweeps could both pass the guard and hit the party twice. This
 *  per-id latch closes that window without losing retry-on-failure (a throwing dispatch leaves
 *  timerFiredAt unset and removes the id, so the next sweep retries). */
const firingTimerIds = new Set<string>()

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

/** True for an OPEN todo whose countdown has elapsed but hasn't fired yet
 *  (deadline = timerStartedAt + timerDurationMs). */
function timerExpired(t: Todo, now: number): boolean {
  return (
    t.status === 'open' &&
    !!t.timerStartedAt &&
    !t.timerFiredAt &&
    t.timerDurationMs != null &&
    new Date(t.timerStartedAt).getTime() + t.timerDurationMs <= now
  )
}

/**
 * Split the list into the three buckets the "今日待办" panel shows:
 *  - overdue:   open todos past their deadline, most-overdue first
 *  - todayOpen: open todos due today OR with no due date, in manual order (drag-sortable)
 *  - doneToday: todos completed today (by local `completedAt`)
 * Future-dated open todos fall through all three buckets → hidden from the panel
 * (they still surface in the calendar on their due day).
 */
export function partitionTodayTodos(todos: Todo[], now: Date) {
  const today = localDateKey(now)
  const open = todos.filter((t) => t.status === 'open')
  const overdue = open
    .filter((t) => isOverdue(t.due, now))
    .sort((a, b) => dueDeadline(a.due!).getTime() - dueDeadline(b.due!).getTime())
  const todayOpen = open
    .filter((t) => !isOverdue(t.due, now) && (!t.due || dueDateKey(t.due) === today))
    .sort(byOrder)
  const doneToday = todos
    .filter((t) => t.status === 'done' && t.completedAt && localDateKey(t.completedAt) === today)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
  return { overdue, todayOpen, doneToday }
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
      const redone: Todo = {
        ...todo,
        status: 'done',
        completedAt: new Date().toISOString(),
        timerStartedAt: undefined,
        timerFiredAt: undefined,
        timerDurationMs: undefined,
      }
      await todosRepo.put(redone)
      set({ todos: get().todos.map((t) => (t.id === id ? redone : t)) })
      return
    }

    // Don't start a new round while one is still mid-resolution (the step-through overlay is open).
    if (useGame.getState().gameState?.activeRound) return

    const stamp = new Date().toISOString()
    const updated: Todo = {
      ...todo,
      status: 'done',
      completedAt: stamp,
      rewardedAt: stamp,
      lastOverdueOn: undefined,
      // A finished task never attacks: disarm any running countdown (both completion paths use this).
      timerStartedAt: undefined,
      timerFiredAt: undefined,
      timerDurationMs: undefined,
    }

    // Interactive (FF-style) step-through: mark done + open the RoundResolver overlay. The felt-reward
    // reaction + recruit hydrate fire when the round finalizes (gameStore.onRoundResolved).
    if (useGame.getState().steppingEnabled) {
      set({ todos: get().todos.map((t) => (t.id === id ? updated : t)) })
      await useGame.getState().beginInteractiveRound(updated)
      return
    }

    // Synchronous path (tests / non-stepping): resolve the whole round at once, then react.
    const result = await dispatchEvent(
      { type: 'TodoCompleted', todo: updated },
      { prewrite: async ({ todos }) => void (await todos.put(updated)) },
    )
    set({ todos: get().todos.map((t) => (t.id === id ? updated : t)) })
    useGame.getState().ingestResult(result)
    fireCompletionReaction(result, updated.priority)

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
      // Re-opened tasks start disarmed; the user can set a fresh countdown.
      timerStartedAt: undefined,
      timerFiredAt: undefined,
      timerDurationMs: undefined,
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

  async startTimer(id, durationMs) {
    const todo = get().todos.find((t) => t.id === id)
    if (!todo || todo.status !== 'open' || durationMs <= 0) return
    const armed: Todo = {
      ...todo,
      timerDurationMs: durationMs,
      timerStartedAt: new Date().toISOString(),
      timerFiredAt: undefined,
    }
    await todosRepo.put(armed)
    set({ todos: get().todos.map((t) => (t.id === id ? armed : t)) })
  },

  async cancelTimer(id) {
    const todo = get().todos.find((t) => t.id === id)
    if (!todo) return
    const cleared: Todo = {
      ...todo,
      timerDurationMs: undefined,
      timerStartedAt: undefined,
      timerFiredAt: undefined,
    }
    await todosRepo.put(cleared)
    set({ todos: get().todos.map((t) => (t.id === id ? cleared : t)) })
  },

  async fireTimerExpiry(id) {
    const todo = get().todos.find((t) => t.id === id)
    // Only an open, armed, not-yet-fired timer fires. Defer while an interactive round is mid-
    // resolution (mirrors complete()'s activeRound guard) — the next tick/sweep retries once the
    // step-through overlay closes; timerFiredAt is stamped only on the successful dispatch below.
    if (!todo || todo.status !== 'open' || !todo.timerStartedAt || todo.timerFiredAt) return
    if (useGame.getState().gameState?.activeRound) return
    // A concurrent sweep is already firing this exact timer (its memory stamp isn't written until
    // the dispatch below resolves) — bail so the party isn't hit twice for one expiry.
    if (firingTimerIds.has(id)) return
    firingTimerIds.add(id)
    try {
      const fired: Todo = { ...todo, timerFiredAt: new Date().toISOString() }
      const result = await dispatchEvent(
        { type: 'TaskTimerExpired', todo: fired },
        { prewrite: async ({ todos }) => void (await todos.put(fired)) },
      )
      set({ todos: get().todos.map((t) => (t.id === id ? fired : t)) })
      useGame.getState().ingestResult(result)

      // No monsterGrew effect → ingestResult shows no toast; surface a worried companion line so the
      // free hit registers (mirrors sweepOverdue's gentle reaction).
      const companions = selectPartyCompanions(useGame.getState())
      const reactor = companions[Math.floor(Math.random() * companions.length)]
      if (reactor) {
        const line = pickWorriedLine(reactor.id, 1)
        useGame.getState().showReaction({
          companionId: reactor.id,
          text: line.text,
          expression: line.expression,
          affinityDelta: 0,
        })
      }
    } finally {
      firingTimerIds.delete(id)
    }
  },

  async sweepTimers() {
    const now = Date.now()
    const due = get().todos.filter((t) => timerExpired(t, now))
    if (due.length === 0) return // cheap idle path for the 1s heartbeat (in-memory scan, no IDB)
    for (const t of due) await get().fireTimerExpiry(t.id)
  },
}))

/** The felt reward for completing a task: a RANDOM on-field companion pipes up (canned, no LLM) in
 *  the global ReactionPopup, showing that reactor's own affinity gain. Shared by the synchronous
 *  completion path (above) and the interactive round's finalize (gameStore.onRoundResolved), so the
 *  reaction fires exactly once per task either way. */
export function fireCompletionReaction(result: ReducerResult, priority: Priority): void {
  const companions = selectPartyCompanions(useGame.getState())
  const reactor = companions[Math.floor(Math.random() * companions.length)]
  if (!reactor) return
  const n = useTodos.getState().completionCount
  const line = pickCompletionLine(reactor.id, priority, n)
  const aff = result.effects.find((e) => e.type === 'affinity' && e.characterId === reactor.id)
  useGame.getState().showReaction({
    companionId: reactor.id,
    text: line.text,
    expression: line.expression,
    affinityDelta: aff && aff.type === 'affinity' ? aff.amount : 0,
  })
  useTodos.setState({ completionCount: n + 1 })
}
