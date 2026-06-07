import { useState } from 'react'
import { isOverdue } from '../domain/dates'
import type { Priority, Todo } from '../domain/types'
import { byOrder, useTodos } from '../state/todoStore'

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
  const now = new Date()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    void add({ title, priority, due: due || undefined })
    setTitle('')
    setDue('')
  }

  const open = todos.filter((t) => t.status === 'open').sort(byOrder)
  const done = todos.filter((t) => t.status === 'done').sort(byOrder)

  // Drag-reorder (open list only). Insert the dragged row before the drop target.
  const drop = (targetId: string) => {
    const from = dragId
    setDragId(null)
    setOverId(null)
    if (!from || from === targetId) return
    const ids = open.map((t) => t.id).filter((x) => x !== from)
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

  return (
    <div className="panel">
      <div className="panel-title">
        <span>今日待办</span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {open.length} 待办 · {done.length} 完成
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
        {open.map((t) =>
          editingId === t.id ? (
            <TodoEditRow key={t.id} todo={t} onClose={() => setEditingId(null)} />
          ) : (
            <TodoRow
              key={t.id}
              todo={t}
              now={now}
              onEdit={() => setEditingId(t.id)}
              drag={dragPropsFor(t.id)}
            />
          ),
        )}
        {done.map((t) =>
          editingId === t.id ? (
            <TodoEditRow key={t.id} todo={t} onClose={() => setEditingId(null)} />
          ) : (
            <TodoRow key={t.id} todo={t} now={now} onEdit={() => setEditingId(t.id)} />
          ),
        )}
      </div>
    </div>
  )
}
