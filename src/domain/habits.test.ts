import { describe, expect, it } from 'vitest'
import { localDateKey } from './dates'
import { isHabitDueOn, isStreakBroken, nextStreakOnComplete, previousScheduledDay } from './habits'
import type { Habit, RecurrenceRule } from './types'

function habit(over: Partial<Habit> = {}): Habit {
  return { id: 'h1', title: 'x', schedule: { kind: 'daily' }, streak: 0, bestStreak: 0, createdAt: '', ...over }
}

const daily: RecurrenceRule = { kind: 'daily' }
const weeklyMonThu: RecurrenceRule = { kind: 'weekly', days: [1, 4] } // Mon + Thu

// Reference dates: 2026-06-01 is a Monday.
const MON = new Date(2026, 5, 1)
const TUE = new Date(2026, 5, 2)
const THU = new Date(2026, 5, 4)

describe('isHabitDueOn', () => {
  it('daily is always due', () => {
    expect(isHabitDueOn(daily, MON)).toBe(true)
    expect(isHabitDueOn(daily, TUE)).toBe(true)
  })
  it('weekly is due only on listed weekdays', () => {
    expect(MON.getDay()).toBe(1)
    expect(isHabitDueOn(weeklyMonThu, MON)).toBe(true)
    expect(isHabitDueOn(weeklyMonThu, TUE)).toBe(false)
    expect(isHabitDueOn(weeklyMonThu, THU)).toBe(true)
  })
  it('weekly with no days and none are never due', () => {
    expect(isHabitDueOn({ kind: 'weekly', days: [] }, MON)).toBe(false)
    expect(isHabitDueOn({ kind: 'none' }, MON)).toBe(false)
  })
})

describe('previousScheduledDay', () => {
  it('daily → yesterday, crossing month and year boundaries', () => {
    expect(localDateKey(previousScheduledDay(daily, MON)!)).toBe('2026-05-31')
    expect(localDateKey(previousScheduledDay(daily, new Date(2026, 0, 1))!)).toBe('2025-12-31')
  })
  it('weekly → the previous selected weekday', () => {
    // From Monday, the previous Mon/Thu occurrence is the prior Thursday (2026-05-28).
    expect(localDateKey(previousScheduledDay(weeklyMonThu, MON)!)).toBe('2026-05-28')
    // From Thursday, the previous is that week's Monday.
    expect(localDateKey(previousScheduledDay(weeklyMonThu, THU)!)).toBe('2026-06-01')
  })
  it('weekly with no days → null', () => {
    expect(previousScheduledDay({ kind: 'weekly', days: [] }, MON)).toBeNull()
  })
})

describe('nextStreakOnComplete', () => {
  it('a first/after-break completion starts at 1', () => {
    expect(nextStreakOnComplete(habit({ streak: 0 }), MON)).toBe(1)
    expect(nextStreakOnComplete(habit({ streak: 2, lastCompletedOn: undefined }), MON)).toBe(1)
  })
  it('a continuous daily completion increments', () => {
    expect(nextStreakOnComplete(habit({ streak: 3, lastCompletedOn: '2026-05-31' }), MON)).toBe(4)
  })
  it('a gap resets to 1', () => {
    // last done 2 days ago (5-30), completing today (6-01) → previous scheduled (5-31) missed.
    expect(nextStreakOnComplete(habit({ streak: 3, lastCompletedOn: '2026-05-30' }), MON)).toBe(1)
  })
  it('weekly continuity (Thu → Mon is consecutive)', () => {
    const h = habit({ schedule: weeklyMonThu, streak: 1, lastCompletedOn: '2026-05-28' }) // prior Thu
    expect(nextStreakOnComplete(h, MON)).toBe(2)
  })
})

describe('isStreakBroken', () => {
  it('a zero streak or a done-today habit is never broken', () => {
    expect(isStreakBroken(habit({ streak: 0 }), MON)).toBe(false)
    expect(isStreakBroken(habit({ streak: 3, lastCompletedOn: '2026-06-01' }), MON)).toBe(false)
  })
  it('a daily completed yesterday is NOT broken yet (today is not over)', () => {
    expect(isStreakBroken(habit({ streak: 2, lastCompletedOn: '2026-05-31' }), MON)).toBe(false)
  })
  it('a daily that missed yesterday is broken', () => {
    expect(isStreakBroken(habit({ streak: 2, lastCompletedOn: '2026-05-30' }), MON)).toBe(true)
  })
  it('weekly: streak holds while the last scheduled day is done; a missed one breaks it', () => {
    // Tuesday: the most recent scheduled day (Mon 6-01) was completed → safe.
    expect(isStreakBroken(habit({ schedule: weeklyMonThu, streak: 2, lastCompletedOn: '2026-06-01' }), TUE)).toBe(false)
    // Thursday with the prior Monday missed (last done the Thursday before) → broken.
    expect(isStreakBroken(habit({ schedule: weeklyMonThu, streak: 2, lastCompletedOn: '2026-05-28' }), THU)).toBe(true)
  })
})
