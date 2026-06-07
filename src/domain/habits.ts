// Pure habit schedule + streak math. ONE source of truth for "is this due today" and
// "did the streak break", mirroring dates.ts. Every function takes an injected `date`/`now`
// (no clock read) so streak/break behavior is fully deterministic and testable.

import { localDateKey } from './dates'
import type { Habit, RecurrenceRule, Weekday } from './types'

/** Is this schedule due on the given local date? (none → false, treated as inert.) */
export function isHabitDueOn(rule: RecurrenceRule, date: Date): boolean {
  if (rule.kind === 'daily') return true
  if (rule.kind === 'weekly') return rule.days.includes(date.getDay() as Weekday)
  return false
}

/** Convenience: due today? */
export function isHabitDueToday(rule: RecurrenceRule, now: Date): boolean {
  return isHabitDueOn(rule, now)
}

/**
 * The most recent scheduled local date STRICTLY BEFORE `date`, or null if none applies.
 * daily → yesterday; weekly → walk back up to 7 days to the previous selected weekday
 * (null if no weekdays are selected). Uses calendar-field decrement (DST-safe).
 */
export function previousScheduledDay(rule: RecurrenceRule, date: Date): Date | null {
  if (rule.kind === 'daily') {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    return d
  }
  if (rule.kind === 'weekly') {
    if (rule.days.length === 0) return null
    const d = new Date(date)
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() - 1)
      if (rule.days.includes(d.getDay() as Weekday)) return d
    }
    return null
  }
  return null
}

/**
 * The streak value after a PAID completion happening on `now` (called only on the first paid
 * check of a day). 1 for a first/after-break completion; +1 when the previous scheduled day
 * was the last completion; reset to 1 otherwise. Reads the PRIOR lastCompletedOn.
 */
export function nextStreakOnComplete(habit: Habit, now: Date): number {
  if (habit.streak <= 0 || !habit.lastCompletedOn) return 1
  const prev = previousScheduledDay(habit.schedule, now)
  if (!prev) return 1
  return localDateKey(prev) === habit.lastCompletedOn ? habit.streak + 1 : 1
}

/**
 * Should the streak-break sweep zero this habit's streak as of `now`? True only when the
 * streak is positive, today's check isn't done, and the most-recent scheduled day before
 * today was missed. (Not-yet-done-today and not-due-today both return false.)
 */
export function isStreakBroken(habit: Habit, now: Date): boolean {
  if (habit.streak <= 0) return false
  const today = localDateKey(now)
  if (habit.lastCompletedOn === today) return false
  const prev = previousScheduledDay(habit.schedule, now)
  if (!prev) return false
  return habit.lastCompletedOn !== localDateKey(prev)
}
