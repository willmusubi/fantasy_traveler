import { describe, expect, it } from 'vitest'
import { dueDateKey, dueDeadline, isDateOnly, isOverdue, localDateKey, monthMatrix } from './dates'

describe('localDateKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 4, 29, 13, 0, 0))).toBe('2026-05-29')
    expect(localDateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01')
  })
})

describe('isDateOnly', () => {
  it('detects date-only vs datetime', () => {
    expect(isDateOnly('2026-05-29')).toBe(true)
    expect(isDateOnly('2026-05-29T10:00:00.000Z')).toBe(false)
  })
})

describe('dueDeadline / isOverdue', () => {
  it('a date-only due is overdue only after local end-of-day', () => {
    const due = '2026-05-29'
    // local end of day is 23:59:59.999
    expect(dueDeadline(due).getHours()).toBe(23)
    expect(isOverdue(due, new Date(2026, 4, 29, 12, 0, 0))).toBe(false) // same day noon
    expect(isOverdue(due, new Date(2026, 4, 29, 23, 59, 59))).toBe(false) // just before midnight
    expect(isOverdue(due, new Date(2026, 4, 30, 0, 0, 1))).toBe(true) // next day
  })

  it('a datetime due compares exactly', () => {
    const due = new Date(2026, 4, 29, 15, 0, 0).toISOString()
    expect(isOverdue(due, new Date(2026, 4, 29, 14, 59, 0))).toBe(false)
    expect(isOverdue(due, new Date(2026, 4, 29, 15, 0, 1))).toBe(true)
  })

  it('no due is never overdue', () => {
    expect(isOverdue(undefined, new Date())).toBe(false)
  })
})

describe('monthMatrix', () => {
  it('builds a full 6×7 Sunday-first grid covering the whole month', () => {
    const weeks = monthMatrix(2026, 4) // May 2026
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)

    // The grid starts on a Sunday (local).
    const [y, m, d] = weeks[0][0].split('-').map(Number)
    expect(new Date(y, m - 1, d).getDay()).toBe(0)

    // Every day of the target month is present.
    const flat = weeks.flat()
    expect(flat).toContain('2026-05-01')
    expect(flat).toContain('2026-05-31')

    // Cells are contiguous (each one local-day after the previous).
    for (let i = 1; i < flat.length; i++) {
      const [py, pm, pd] = flat[i - 1].split('-').map(Number)
      const prev = new Date(py, pm - 1, pd)
      prev.setDate(prev.getDate() + 1)
      expect(localDateKey(prev)).toBe(flat[i])
    }
  })
})

describe('dueDateKey', () => {
  it('keeps a date-only due and reduces a datetime to its local day', () => {
    expect(dueDateKey('2026-05-29')).toBe('2026-05-29')
    expect(dueDateKey(new Date(2026, 4, 29, 15, 0, 0).toISOString())).toBe('2026-05-29')
  })
})
