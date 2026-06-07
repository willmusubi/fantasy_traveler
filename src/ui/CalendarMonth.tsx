import { isOverdue } from '../domain/dates'
import type { Mood, Todo } from '../domain/types'

const DOW = ['日', '一', '二', '三', '四', '五', '六']

const MOOD_VAR: Record<Mood, string> = {
  great: 'var(--mood-great)',
  good: 'var(--mood-good)',
  neutral: 'var(--mood-neutral)',
  down: 'var(--mood-down)',
  bad: 'var(--mood-bad)',
}

/** The month-hub calendar: a clickable grid where each day surfaces its open todos
 *  (priority dots) and a mood dot if it was journaled. Pure presentation — all dates
 *  arrive as local keys from the parent (no clock read here). */
export function CalendarMonth({
  year,
  month0,
  weeks,
  openTodosByDate,
  moodByDate,
  selected,
  today,
  now,
  onSelect,
  onPrev,
  onNext,
  onToday,
}: {
  year: number
  month0: number
  weeks: string[][]
  openTodosByDate: Map<string, Todo[]>
  moodByDate: Map<string, Mood>
  selected: string
  today: string
  now: Date
  onSelect: (date: string) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <section className="prod-card calendar" aria-label="日历">
      <div className="cal-head">
        <button className="cal-navbtn" aria-label="上个月" onClick={onPrev}>‹</button>
        <div className="cal-title">{year}年{month0 + 1}月</div>
        <button className="cal-navbtn" aria-label="下个月" onClick={onNext}>›</button>
        <button className="cal-today" onClick={onToday}>今天</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {weeks.flat().map((date) => {
          const inMonth = Number(date.slice(5, 7)) === month0 + 1
          const todos = openTodosByDate.get(date) ?? []
          const mood = moodByDate.get(date)
          const cls = [
            'cal-day',
            inMonth ? '' : 'out',
            date === today ? 'today' : '',
            date === selected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const aria = `${date}${todos.length ? `，${todos.length} 项截止待办` : ''}${mood ? '，已写日记' : ''}`
          return (
            <button key={date} className={cls} aria-label={aria} aria-pressed={date === selected} onClick={() => onSelect(date)}>
              <span className="cal-top">
                <span className="cal-num">{Number(date.slice(8, 10))}</span>
                {mood && <span className="cal-mood" style={{ background: MOOD_VAR[mood] }} title="已写日记" />}
              </span>
              <span className="cal-items">
                {todos.slice(0, 2).map((t) => (
                  <span key={t.id} className={`cal-chip ${t.priority} ${isOverdue(t.due, now) ? 'overdue' : ''}`} title={t.title}>
                    {t.title}
                  </span>
                ))}
                {todos.length > 2 && <span className="cal-chip more">+{todos.length - 2}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
