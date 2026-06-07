import { useMemo, useState } from 'react'
import { dueDateKey, localDateKey, monthMatrix } from '../domain/dates'
import type { Mood, Todo } from '../domain/types'
import { byNewest, useJournal } from '../state/journalStore'
import { useTodos } from '../state/todoStore'
import { CalendarMonth } from './CalendarMonth'
import { JournalComposer } from './JournalComposer'

const MOOD_LABEL: Record<Mood, string> = { great: '很好', good: '不错', neutral: '一般', down: '低落', bad: '糟糕' }
const MOOD_VAR: Record<Mood, string> = {
  great: 'var(--mood-great)', good: 'var(--mood-good)', neutral: 'var(--mood-neutral)', down: 'var(--mood-down)', bad: 'var(--mood-bad)',
}
const DOW_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** The "效率" zone — a calm, readable productivity surface (calendar hub + journal),
 *  kept deliberately separate from the game/combat zone (§21 two-zone design). */
export function ProductivityView() {
  const todos = useTodos((s) => s.todos)
  const entries = useJournal((s) => s.entries)
  const complete = useTodos((s) => s.complete)
  const reopen = useTodos((s) => s.reopen)
  const addTodo = useTodos((s) => s.add)

  const now = new Date()
  const today = localDateKey(now)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [quickTitle, setQuickTitle] = useState('')

  const weeks = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor])

  const openTodosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>()
    for (const t of todos) {
      if (t.status !== 'open' || !t.due) continue
      const k = dueDateKey(t.due)
      const arr = map.get(k) ?? []
      arr.push(t)
      map.set(k, arr)
    }
    return map
  }, [todos])

  const moodByDate = useMemo(() => {
    const map = new Map<string, Mood>()
    // Oldest → newest so the latest entry of a day wins the badge.
    for (const e of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) map.set(e.date, e.mood)
    return map
  }, [entries])

  const dayTodos = todos.filter((t) => t.due && dueDateKey(t.due) === selected)
  const dayEntries = entries.filter((e) => e.date === selected).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const recent = useMemo(() => [...entries].sort(byNewest).slice(0, 8), [entries])

  const selDow = new Date(`${selected}T00:00:00`).getDay()
  const selLabel = `${Number(selected.slice(5, 7))}月${Number(selected.slice(8, 10))}日 ${DOW_FULL[selDow]}`

  const prevMonth = () => setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
  const nextMonth = () => setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
  const goToday = () => {
    const d = new Date()
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(today)
  }
  const jumpTo = (date: string) => {
    const d = new Date(`${date}T00:00:00`)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(date)
  }

  const quickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickTitle.trim()) return
    void addTodo({ title: quickTitle, priority: 'med', due: selected })
    setQuickTitle('')
  }

  return (
    <main className="prod">
      <div className="prod-col">
        <CalendarMonth
          year={cursor.y}
          month0={cursor.m}
          weeks={weeks}
          openTodosByDate={openTodosByDate}
          moodByDate={moodByDate}
          selected={selected}
          today={today}
          now={now}
          onSelect={setSelected}
          onPrev={prevMonth}
          onNext={nextMonth}
          onToday={goToday}
        />

        <section className="prod-card" aria-label="最近日记">
          <div className="prod-card-title">最近日记</div>
          {recent.length === 0 && <div className="prod-empty">还没有日记。点一个日子，写下第一篇吧。</div>}
          {recent.map((e) => (
            <button key={e.id} className="j-entry j-entry-btn" onClick={() => jumpTo(e.date)}>
              <div className="j-meta">
                <span className="j-mooddot" style={{ background: MOOD_VAR[e.mood] }} />
                <span>{e.date}</span>
                <span>· {MOOD_LABEL[e.mood]}</span>
                {e.title && <span className="j-title">{e.title}</span>}
              </div>
              <div className="j-body clamp">{e.body}</div>
            </button>
          ))}
        </section>
      </div>

      <aside className="prod-col">
        <section className="prod-card" aria-label="当天">
          <div className="day-head">
            <span>{selLabel}</span>
            {selected === today && <span className="day-sub">今天</span>}
          </div>
          <div className="day-section">截止于这天的待办</div>
          <div className="day-todos">
            {dayTodos.length === 0 && <div className="prod-empty small">这天没有到期的待办。</div>}
            {dayTodos.map((t) => (
              <div key={t.id} className={`todo-item ${t.status === 'done' ? 'done' : ''}`}>
                <button
                  className="todo-check"
                  aria-label={t.status === 'done' ? '取消完成' : '完成'}
                  onClick={() => (t.status === 'done' ? reopen(t.id) : complete(t.id))}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <div className="todo-main">
                  <div className="todo-title">{t.title}</div>
                </div>
              </div>
            ))}
            <form className="day-quickadd" onSubmit={quickAdd}>
              <input
                className="input"
                placeholder="＋ 新待办（截止这天）"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
              />
            </form>
          </div>
        </section>

        <section className="prod-card" aria-label="写日记">
          <div className="prod-card-title">写下这一天</div>
          {/* Re-key per day so the composer (and its ack) reset when you switch days. */}
          <JournalComposer key={selected} date={selected} />
          {dayEntries.length > 0 && (
            <div className="day-entries">
              {dayEntries.map((e) => (
                <div key={e.id} className="j-entry">
                  <div className="j-meta">
                    <span className="j-mooddot" style={{ background: MOOD_VAR[e.mood] }} />
                    <span>{MOOD_LABEL[e.mood]}</span>
                    {e.title && <span className="j-title">{e.title}</span>}
                  </div>
                  <div className="j-body">{e.body}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </main>
  )
}
