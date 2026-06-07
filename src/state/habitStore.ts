// Habit store: recurring daily-checks (Habitica "Dailies"). Completing a habit does NOT
// attack the monster — it offers a buff draft (via the game store). Per-day grant-once mirrors
// the todo economy: the first paid check of a day offers a buff + bumps the streak; un-checking
// and re-checking the same day never re-offers. A lazy sweep breaks missed streaks + debuffs.

import { create } from 'zustand'
import { pickCompletionLine, pickWorriedLine } from '../companion/cannedLines'
import { habitsRepo } from '../data/repositories'
import { localDateKey } from '../domain/dates'
import { isStreakBroken, nextStreakOnComplete } from '../domain/habits'
import type { Habit, RecurrenceRule } from '../domain/types'
import { selectPartyCompanions, useGame } from './gameStore'

interface AddInput {
  title: string
  schedule: RecurrenceRule
}

/** Editable fields. Absent keys are left unchanged. */
interface UpdateInput {
  title?: string
  schedule?: RecurrenceRule
}

interface HabitStore {
  habits: Habit[]
  loaded: boolean
  hydrate: () => Promise<void>
  add: (input: AddInput) => Promise<void>
  complete: (id: string) => Promise<void>
  uncheck: (id: string) => Promise<void>
  update: (id: string, patch: UpdateInput) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  sweepHabits: () => Promise<void>
}

/** A weekly schedule needs at least one weekday; anything else is allowed. */
function scheduleValid(s: RecurrenceRule): boolean {
  return s.kind !== 'weekly' || s.days.length > 0
}

/** Next free sort position (after the current max). */
function nextOrder(habits: Habit[]): number {
  return habits.reduce((m, h) => Math.max(m, h.order ?? 0), 0) + 1
}

/** Assign an `order` to any habit missing one (by createdAt), after the current max. */
function backfillOrder(habits: Habit[]): { habits: Habit[]; changed: Habit[] } {
  const missing = habits.filter((h) => h.order == null)
  if (missing.length === 0) return { habits, changed: [] }
  let next = nextOrder(habits)
  const assigned = new Map<string, number>()
  for (const h of [...missing].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    assigned.set(h.id, next++)
  }
  const out = habits.map((h) => (assigned.has(h.id) ? { ...h, order: assigned.get(h.id)! } : h))
  return { habits: out, changed: out.filter((h) => assigned.has(h.id)) }
}

/** Sort comparator: manual order asc, then createdAt asc as a stable tiebreaker. */
export function byOrder(a: Habit, b: Habit): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt)
}

export const useHabits = create<HabitStore>((set, get) => ({
  habits: [],
  loaded: false,

  async hydrate() {
    const { habits, changed } = backfillOrder(await habitsRepo.all())
    for (const h of changed) await habitsRepo.put(h)
    set({ habits, loaded: true })
  },

  async add(input) {
    const title = input.title.trim()
    if (!title || !scheduleValid(input.schedule)) return
    const habit: Habit = {
      id: crypto.randomUUID(),
      title,
      schedule: input.schedule,
      streak: 0,
      bestStreak: 0,
      order: nextOrder(get().habits),
      createdAt: new Date().toISOString(),
    }
    await habitsRepo.put(habit)
    set({ habits: [...get().habits, habit] })
  },

  async complete(id) {
    const habit = get().habits.find((h) => h.id === id)
    if (!habit) return
    const now = new Date()
    const today = localDateKey(now)

    // Per-day grant-once: already paid today → just set the visual check, no new buff offer.
    if (habit.rewardedOn === today) {
      if (habit.lastCompletedOn === today) return
      const checked: Habit = { ...habit, lastCompletedOn: today }
      await habitsRepo.put(checked)
      set({ habits: get().habits.map((h) => (h.id === id ? checked : h)) })
      return
    }

    // First paid check of the day: compute the streak from the PRIOR state, then commit.
    const newStreak = nextStreakOnComplete(habit, now)
    const updated: Habit = {
      ...habit,
      streak: newStreak,
      bestStreak: Math.max(habit.bestStreak, newStreak),
      lastCompletedOn: today,
      rewardedOn: today,
      lastMissOn: today, // a same-day sweep must not break the streak we just built
    }
    await habitsRepo.put(updated)
    set({ habits: get().habits.map((h) => (h.id === id ? updated : h)) })

    // The reward is a buff draft (NOT a monster attack).
    useGame.getState().offerBuffChoice()

    // Flavor: a random on-field companion cheers (no affinity number for habits).
    const companions = selectPartyCompanions(useGame.getState())
    const reactor = companions[Math.floor(Math.random() * companions.length)]
    if (reactor) {
      const line = pickCompletionLine(reactor.id, 'med', newStreak)
      useGame.getState().showReaction({
        companionId: reactor.id,
        text: line.text,
        expression: line.expression,
        affinityDelta: 0,
      })
    }
  },

  async uncheck(id) {
    const habit = get().habits.find((h) => h.id === id)
    if (!habit || habit.lastCompletedOn == null) return
    // Clear the checkmark ONLY. rewardedOn + streak stay (the day's credit is locked) so a
    // re-check the same day never re-offers a buff.
    const reverted: Habit = { ...habit, lastCompletedOn: undefined }
    await habitsRepo.put(reverted)
    set({ habits: get().habits.map((h) => (h.id === id ? reverted : h)) })
  },

  async update(id, patch) {
    const habit = get().habits.find((h) => h.id === id)
    if (!habit) return
    const title = patch.title !== undefined ? patch.title.trim() : habit.title
    if (!title) return // never blank out the title
    const schedule = patch.schedule ?? habit.schedule
    if (!scheduleValid(schedule)) return
    const updated: Habit = { ...habit, title, schedule }
    await habitsRepo.put(updated)
    set({ habits: get().habits.map((h) => (h.id === id ? updated : h)) })
  },

  async reorder(orderedIds) {
    const byId = new Map(get().habits.map((h) => [h.id, h]))
    const updates: Habit[] = []
    orderedIds.forEach((id, i) => {
      const h = byId.get(id)
      if (h && h.order !== i) updates.push({ ...h, order: i })
    })
    if (updates.length === 0) return
    for (const h of updates) await habitsRepo.put(h)
    const patch = new Map(updates.map((h) => [h.id, h]))
    set({ habits: get().habits.map((h) => patch.get(h.id) ?? h) })
  },

  async remove(id) {
    await habitsRepo.delete(id)
    set({ habits: get().habits.filter((h) => h.id !== id) })
  },

  async sweepHabits() {
    const now = new Date()
    const today = localDateKey(now)
    const broken = get().habits.filter((h) => h.lastMissOn !== today && isStreakBroken(h, now))
    if (broken.length === 0) return

    for (const habit of broken) {
      const updated: Habit = { ...habit, streak: 0, lastMissOn: today }
      await habitsRepo.put(updated)
      set({ habits: get().habits.map((h) => (h.id === habit.id ? updated : h)) })
      await useGame.getState().applyRandomDebuff()
    }

    // One gentle worried reaction (not per-habit spam), from a random on-field companion.
    const companions = selectPartyCompanions(useGame.getState())
    const reactor = companions[Math.floor(Math.random() * companions.length)]
    if (reactor) {
      const line = pickWorriedLine(reactor.id, broken.length)
      useGame.getState().showReaction({
        companionId: reactor.id,
        text: line.text,
        expression: line.expression,
        affinityDelta: 0,
      })
    }
  },
}))
