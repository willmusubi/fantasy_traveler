import { useEffect, useRef, useState } from 'react'
import { isOverdue } from '../domain/dates'
import type { Priority, Todo } from '../domain/types'
import { partitionTodayTodos, useTodos } from '../state/todoStore'

const PRIORITY_PIPS: Record<Priority, number> = { low: 1, med: 2, high: 3 }
const PRIORITY_LABEL: Record<Priority, string> = { low: '低', med: '中', high: '高' }

function Pips({ priority }: { priority: Priority }) {
  const n = PRIORITY_PIPS[priority]
  return (
    <span className="pips" title={`优先级：${PRIORITY_LABEL[priority]}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`pip ${i < n ? `on ${priority}` : ''}`} />
      ))}
    </span>
  )
}

const TIMER_PRESETS = [15, 25, 45] as const // minutes

function fmtMMSS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Per-row countdown affordance (open todos only). Idle/spent collapses to a compact ⏱ command that
 *  drops a miniature FF window (preset durations + a custom-minutes field); running shows live MM:SS
 *  + ✕ cancel. On expiry the shared Dashboard heartbeat fires the enemy attack via the store; this
 *  component only arms/cancels and re-renders the live digits. */
function TodoTimer({ todo }: { todo: Todo }) {
  const startTimer = useTodos((s) => s.startTimer)
  const cancelTimer = useTodos((s) => s.cancelTimer)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const wrapRef = useRef<HTMLSpanElement>(null)
  const armed = !!todo.timerStartedAt && !todo.timerFiredAt

  // Display-only heartbeat: re-render each second while armed so the MM:SS counts down.
  const [, force] = useState(0)
  useEffect(() => {
    if (!armed) return
    const h = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(h)
  }, [armed])

  // Dismiss the dropdown on outside-click / Escape (an FF menu closes when you step away).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const arm = (min: number) => {
    if (!Number.isFinite(min) || min <= 0) return
    void startTimer(todo.id, min * 60_000)
    setOpen(false)
    setCustom('')
  }

  if (armed) {
    const remain = new Date(todo.timerStartedAt!).getTime() + (todo.timerDurationMs ?? 0) - Date.now()
    const low = remain <= 60_000
    return (
      <span className={`todo-timer running${low ? ' low' : ''}`} title="倒计时进行中（超时心魔会发动一次进攻）">
        <span className="tt-count">⏱ {fmtMMSS(remain)}</span>
        <button className="tt-x" aria-label="取消倒计时" onClick={() => void cancelTimer(todo.id)}>
          ✕
        </button>
      </span>
    )
  }

  const spent = !!todo.timerFiredAt
  return (
    <span className="todo-timer" ref={wrapRef}>
      <button
        type="button"
        className={`tt-trigger${spent ? ' spent' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={spent ? '时间到，重新设定限时' : '设定限时'}
        title={spent ? '超时已被进攻，点此重新计时' : '设定限时：超时未完成，心魔会发动一次进攻'}
        onClick={() => setOpen((v) => !v)}
      >
        {spent ? '⏱ 时间到' : '⏱'}
      </button>

      {open && (
        <div className="tt-menu" role="menu">
          <div className="tt-menu-head">限时专注</div>
          <div className="tt-presets">
            {TIMER_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className="tt-preset"
                role="menuitem"
                aria-label={`开始 ${m} 分钟倒计时`}
                onClick={() => arm(m)}
              >
                <span className="tt-preset-n">{m}</span>
                <span className="tt-preset-u">分</span>
              </button>
            ))}
          </div>
          <form
            className="tt-custom"
            onSubmit={(e) => {
              e.preventDefault()
              arm(Number(custom))
            }}
          >
            <input
              className="input tt-custom-input"
              type="number"
              min={1}
              placeholder="自定义"
              aria-label="自定义分钟"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <span className="tt-custom-u">分</span>
            <button
              type="submit"
              className="btn btn-primary tt-custom-go"
              disabled={!custom || Number(custom) <= 0}
              aria-label="开始自定义倒计时"
            >
              开始
            </button>
          </form>
        </div>
      )}
    </span>
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

function TodoRow({
  todo,
  now,
  onEdit,
  drag,
}: {
  todo: Todo
  now: Date
  onEdit: () => void
  drag?: DragProps
}) {
  const complete = useTodos((s) => s.complete)
  const reopen = useTodos((s) => s.reopen)
  const remove = useTodos((s) => s.remove)
  const done = todo.status === 'done'
  const overdue = todo.status === 'open' && isOverdue(todo.due, now)

  return (
    <div
      className={[
        'todo-item',
        done ? 'done' : '',
        overdue ? 'overdue' : '',
        drag?.isDragging ? 'dragging' : '',
        drag?.isOver ? 'drag-over' : '',
      ]
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
        aria-label={done ? '取消完成' : '完成'}
        onClick={() => (done ? reopen(todo.id) : complete(todo.id))}
      >
        {done ? '✓' : ''}
      </button>
      <div className="todo-main">
        <div className="todo-title">{todo.title}</div>
        <div className="todo-meta">
          <Pips priority={todo.priority} />
          {todo.due && <span>📅 {todo.due}</span>}
          {overdue && <span className="overdue-tag">⚠ 已逾期</span>}
          {!done && <TodoTimer todo={todo} />}
        </div>
      </div>
      <button className="todo-edit-btn" aria-label="编辑" onClick={onEdit}>
        ✎
      </button>
      <button className="todo-del" aria-label="删除" onClick={() => remove(todo.id)}>
        ×
      </button>
    </div>
  )
}

function TodoEditRow({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const update = useTodos((s) => s.update)
  const [title, setTitle] = useState(todo.title)
  const [priority, setPriority] = useState<Priority>(todo.priority)
  const [due, setDue] = useState(todo.due ?? '')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    void update(todo.id, { title, priority, due })
    onClose()
  }

  return (
    <form className="todo-edit" onSubmit={save}>
      <input
        className="input"
        aria-label="编辑标题"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <label className="date-field" title="截止日期">
        <span className="date-label">截止</span>
        <input
          className="input"
          type="date"
          aria-label="截止日期"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <select
        className="select"
        aria-label="编辑优先级"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
      >
        <option value="low">低</option>
        <option value="med">中</option>
        <option value="high">高</option>
      </select>
      <button className="btn btn-primary" type="submit">
        保存
      </button>
      <button className="btn btn-ghost" type="button" onClick={onClose}>
        取消
      </button>
    </form>
  )
}

export function TodoPanel() {
  const todos = useTodos((s) => s.todos)
  const add = useTodos((s) => s.add)
  const reorder = useTodos((s) => s.reorder)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('med')
  const [due, setDue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(true)
  const now = new Date()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    void add({ title, priority, due: due || undefined })
    setTitle('')
    setDue('')
  }

  const { overdue, todayOpen, doneToday } = partitionTodayTodos(todos, now)
  const openCount = overdue.length + todayOpen.length

  // Drag-reorder (今日 group only). Insert the dragged row before the drop target.
  const drop = (targetId: string) => {
    const from = dragId
    setDragId(null)
    setOverId(null)
    if (!from || from === targetId) return
    const ids = todayOpen.map((t) => t.id).filter((x) => x !== from)
    const at = ids.indexOf(targetId)
    ids.splice(at < 0 ? ids.length : at, 0, from)
    void reorder(ids)
  }
  const dragPropsFor = (id: string): DragProps => ({
    draggable: editingId === null, // don't drag while an inline editor is open
    isDragging: dragId === id,
    isOver: overId === id && dragId !== id,
    onDragStart: (e) => {
      setDragId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id) // Firefox needs payload to start a drag
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

  const renderRow = (t: Todo, drag?: DragProps) =>
    editingId === t.id ? (
      <TodoEditRow key={t.id} todo={t} onClose={() => setEditingId(null)} />
    ) : (
      <TodoRow key={t.id} todo={t} now={now} onEdit={() => setEditingId(t.id)} drag={drag} />
    )

  return (
    <div className="panel">
      <div className="panel-title">
        <span>今日待办</span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {openCount} 待办 · {doneToday.length} 完成
        </span>
      </div>
      <form className="todo-add" onSubmit={submit}>
        <input
          className="input"
          placeholder="要完成什么？（完成它来攻击心魔）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="date-field" title="截止日期（可选）">
          <span className="date-label">截止</span>
          <input className="input" type="date" aria-label="截止日期（可选）" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          <option value="low">低</option>
          <option value="med">中</option>
          <option value="high">高</option>
        </select>
        <button className="btn btn-primary" type="submit">
          添加
        </button>
      </form>

      <div className="todo-list">
        {todos.length === 0 && (
          <div className="todo-empty">还没有待办。添加第一件事，和瞳一起出发吧！</div>
        )}
        {todos.length > 0 && openCount === 0 && (
          <div className="todo-empty">今天的事都安排好啦 ✓（未来的任务在日历里查看）</div>
        )}

        {overdue.length > 0 && (
          <div className="todo-group-head overdue">⚠ 逾期 ({overdue.length})</div>
        )}
        {overdue.map((t) => renderRow(t))}

        {todayOpen.length > 0 && <div className="todo-group-head">今日 ({todayOpen.length})</div>}
        {todayOpen.map((t) => renderRow(t, dragPropsFor(t.id)))}

        {doneToday.length > 0 && (
          <button
            type="button"
            className="todo-group-head done-head"
            onClick={() => setDoneOpen((v) => !v)}
            aria-expanded={doneOpen}
          >
            ✓ 今日完成 ({doneToday.length}) <span className="caret">{doneOpen ? '▾' : '▸'}</span>
          </button>
        )}
        {doneOpen && doneToday.map((t) => renderRow(t))}
      </div>
    </div>
  )
}
