// Local-time date helpers. ONE source of truth for "today" / "overdue" logic (§21).
// All economy decisions use local time; storage uses ISO strings.

/** YYYY-MM-DD in the user's local timezone. */
export function localDateKey(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** True if `due` looks like a date-only value (no time component). */
export function isDateOnly(due: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(due.trim())
}

/**
 * The instant a due value is considered "past". A date-only due is normalized to
 * the LOCAL end-of-day, so a todo due "today" is not overdue until local midnight.
 */
export function dueDeadline(due: string): Date {
  if (isDateOnly(due)) {
    const [y, m, d] = due.split('-').map(Number)
    return new Date(y, m - 1, d, 23, 59, 59, 999) // local end-of-day
  }
  return new Date(due)
}

/** Whether a todo with this due value is overdue relative to `now`. */
export function isOverdue(due: string | undefined, now: Date): boolean {
  if (!due) return false
  return now.getTime() > dueDeadline(due).getTime()
}

/**
 * A month as a 6×7 grid of local date keys (Sunday-first), including leading/trailing
 * days from the adjacent months so the grid is always full. Pure — the caller supplies
 * year + 0-based month, so there is no clock read here.
 */
export function monthMatrix(year: number, month0: number): string[][] {
  const startDow = new Date(year, month0, 1).getDay() // 0 = Sunday
  const cur = new Date(year, month0, 1 - startDow)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    const row: string[] = []
    for (let d = 0; d < 7; d++) {
      row.push(localDateKey(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(row)
  }
  return weeks
}

/** The local date key of a todo's `due` (date-only kept verbatim; datetime → its local day). */
export function dueDateKey(due: string): string {
  return isDateOnly(due) ? due : localDateKey(new Date(due))
}
