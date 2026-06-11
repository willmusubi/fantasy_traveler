import { useState } from 'react'
import { localDateKey } from '../domain/dates'
import { isHabitDueToday } from '../domain/habits'
import { HABIT_MILESTONES } from '../domain/config'
import type { Habit, RecurrenceRule, Weekday } from '../domain/types'
import { byOrder, useHabits } from '../state/habitStore'

const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']

/** Returns the next milestone threshold not yet reached, or null if all done. */
function nextMilestone(habit: Habit): number | null {
  for (const m of HABIT_MILESTONES) {
    if (!habit.milestoneRewardedAt?.[String(m)]) return m
  }
  return null
}

function scheduleLabel(s: RecurrenceRule): string {
  if (s.kind === 'daily') return '每日'
  if (s.kind === 'weekly') {
    if (s.days.length === 7) return '每日'
    return '周' + [...s.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join('·')
  }
  return ''
}

function scheduleValid(s: RecurrenceRule): boolean {
  return s.kind !== 'weekly' || s.days.length > 0
}

/** Daily/weekly toggle + 7 weekday buttons. Used by the add + edit forms. */
function SchedulePicker({ schedule, onChange }: { schedule: RecurrenceRule; onChange: (s: RecurrenceRule) => void }) {
  const isWeekly = schedule.kind === 'weekly'
  const days = isWeekly ? schedule.days : []
  const toggleDay = (d: Weekday) => {
    const next = new Set(days)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    onChange({ kind: 'weekly', days: [...next].sort((a, b) => a - b) as Weekday[] })
  }
  return (
    <div className="habit-schedule-picker">
      <div className="seg" role="tablist" aria-label="重复方式">
        <button type="button" role="tab" aria-selected={!isWeekly} className={!isWeekly ? 'on' : ''} onClick={() => onChange({ kind: 'daily' })}>
          每日
        </button>
        <button type="button" role="tab" aria-selected={isWeekly} className={isWeekly ? 'on' : ''} onClick={() => onChange({ kind: 'weekly', days })}>
          每周
        </button>
      </div>
      {isWeekly && (
        <div className="weekday-row">
          {WEEKDAY_SHORT.map((label, d) => (
            <button
              type="button"
              key={d}
              className={`weekday-toggle ${days.includes(d as Weekday) ? 'on' : ''}`}
              aria-pressed={days.includes(d as Weekday)}
              onClick={() => toggleDay(d as Weekday)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface DragProps {
  draggable: boolean
  isDragging: boolean
  isOver: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function HabitRow({ habit, now, onEdit, drag }: { habit: Habit; now: Date; onEdit: () => void; drag?: DragProps }) {
  const complete = useHabits((s) => s.complete)
  const uncheck = useHabits((s) => s.uncheck)
  const remove = useHabits((s) => s.remove)
  const doneToday = habit.lastCompletedOn === localDateKey(now)
  const dueToday = isHabitDueToday(habit.schedule, now)
  const offDay = !dueToday && !doneToday

  return (
    <div
      className={['todo-item', 'habit-item', doneToday ? 'done' : '', offDay ? 'off-day' : '', drag?.isDragging ? 'dragging' : '', drag?.isOver ? 'drag-over' : '']
        .filter(Boolean)
        .join(' ')}
      draggable={drag?.draggable}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
    >
      {drag?.draggable && (
        <span className="todo-grip" aria-hidden title="拖拽排序">
          ⠿
        </span>
      )}
      <button
        className="todo-check"
        aria-label={doneToday ? '取消打卡' : '打卡'}
        disabled={offDay}
        title={offDay ? '今日不需要' : doneToday ? '取消打卡' : '打卡换取增益'}
        onClick={() => (doneToday ? uncheck(habit.id) : complete(habit.id))}
      >
        {doneToday ? '✓' : ''}
      </button>
      <div className="todo-main">
        <div className="todo-title">{habit.title}</div>
        <div className="todo-meta">
          <span className="habit-schedule">{scheduleLabel(habit.schedule)}</span>
          {habit.streak > 0 && (
            <span className="habit-streak" title={`最佳连胜 ${habit.bestStreak}`}>
              🔥 {habit.streak}
            </span>
          )}
          {(() => {
            const next = nextMilestone(habit)
            if (next === null) return <span className="milestone-hint">🏅 100天达成</span>
            return <span className="milestone-hint">🏅 {habit.streak}/{next}天</span>
          })()}
          {offDay && <span className="habit-offday-tag">今日不需要</span>}
        </div>
      </div>
      <button className="todo-edit-btn" aria-label="编辑" onClick={onEdit}>
        ✎
      </button>
      <button className="todo-del" aria-label="删除" onClick={() => remove(habit.id)}>
        ×
      </button>
    </div>
  )
}

function HabitEditRow({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const update = useHabits((s) => s.update)
  const [title, setTitle] = useState(habit.title)
  const [schedule, setSchedule] = useState<RecurrenceRule>(habit.schedule)
  const valid = Boolean(title.trim()) && scheduleValid(schedule)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void update(habit.id, { title, schedule })
    onClose()
  }

  return (
    <form className="todo-edit habit-edit" onSubmit={save}>
      <input
        className="input"
        aria-label="编辑标题"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <SchedulePicker schedule={schedule} onChange={setSchedule} />
      <div className="habit-edit-actions">
        <button className="btn btn-primary" type="submit" disabled={!valid}>
          保存
        </button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          取消
        </button>
      </div>
    </form>
  )
}

export function HabitPanel() {
  const habits = useHabits((s) => s.habits)
  const add = useHabits((s) => s.add)
  const reorder = useHabits((s) => s.reorder)
  const [title, setTitle] = useState('')
  const [schedule, setSchedule] = useState<RecurrenceRule>({ kind: 'daily' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const now = new Date()
  const today = localDateKey(now)

  const valid = Boolean(title.trim()) && scheduleValid(schedule)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void add({ title, schedule })
    setTitle('')
    setSchedule({ kind: 'daily' })
  }

  const ordered = [...habits].sort(byOrder)
  const doneCount = ordered.filter((h) => h.lastCompletedOn === today).length

  // Drag-reorder. Insert the dragged row before the drop target.
  const drop = (targetId: string) => {
    const from = dragId
    setDragId(null)
    setOverId(null)
    if (!from || from === targetId) return
    const ids = ordered.map((h) => h.id).filter((x) => x !== from)
    const at = ids.indexOf(targetId)
    ids.splice(at < 0 ? ids.length : at, 0, from)
    void reorder(ids)
  }
  const dragPropsFor = (id: string): DragProps => ({
    draggable: editingId === null,
    isDragging: dragId === id,
    isOver: overId === id && dragId !== id,
    onDragStart: (e) => {
      setDragId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    onDragOver: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overId !== id) setOverId(id)
    },
    onDrop: (e) => {
      e.preventDefault()
      drop(id)
    },
    onDragEnd: () => {
      setDragId(null)
      setOverId(null)
    },
  })

  return (
    <div className="panel habit-panel">
      <div className="panel-title">
        <span>习惯养成</span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {ordered.length} 习惯 · 今日 {doneCount} 打卡
        </span>
      </div>
      <form className="habit-add" onSubmit={submit}>
        <div className="habit-add-row">
          <input
            className="input"
            placeholder="养成一个习惯…（打卡换取增益）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!valid}>
            添加
          </button>
        </div>
        <SchedulePicker schedule={schedule} onChange={setSchedule} />
      </form>

      <div className="todo-list">
        {ordered.length === 0 && (
          <div className="todo-empty">还没有习惯。养成一个每日习惯，让坚持变成连胜 🔥</div>
        )}
        {ordered.map((h) =>
          editingId === h.id ? (
            <HabitEditRow key={h.id} habit={h} onClose={() => setEditingId(null)} />
          ) : (
            <HabitRow key={h.id} habit={h} now={now} onEdit={() => setEditingId(h.id)} drag={dragPropsFor(h.id)} />
          ),
        )}
      </div>
    </div>
  )
}
