import { describe, expect, it } from 'vitest'
import { statsForClassAtLevel } from '../game/leveling'
import type { Character, Todo } from '../domain/types'
import { buildContext, renderContextZh } from './contextBuilder'

const NOW = new Date(2026, 4, 29, 12, 0, 0)
const player: Character = {
  id: 'p', name: '阿旅', kind: 'player', classId: 'vanguard',
  stats: statsForClassAtLevel('vanguard', 3), skills: [], portraitSet: 'player_default', createdAt: '',
}

function todo(over: Partial<Todo>): Todo {
  return { id: Math.random().toString(), title: 't', priority: 'med', status: 'open', tags: [], createdAt: '', ...over }
}

describe('buildContext', () => {
  it('summarizes open / overdue / done-today and notable titles', () => {
    const todos: Todo[] = [
      todo({ title: '逾期高优', priority: 'high', due: '2026-05-20' }),
      todo({ title: '普通任务', priority: 'med' }),
      todo({ title: '低优', priority: 'low' }),
      todo({ title: '今天完成的', status: 'done', completedAt: new Date(2026, 4, 29, 9).toISOString() }),
    ]
    const ctx = buildContext({ player, affinityRank: 'C', todos, moodFlag: 'idle', now: NOW })
    expect(ctx.todos.openCount).toBe(3)
    expect(ctx.todos.overdueCount).toBe(1)
    expect(ctx.todos.doneToday).toBe(1)
    expect(ctx.todos.notableOpen[0]).toBe('逾期高优') // overdue sorts first
    expect(ctx.todos.notableOpen.length).toBeLessThanOrEqual(3)
  })

  it('renders a compact zh block with a mood hint', () => {
    const ctx = buildContext({ player, affinityRank: 'B', todos: [], moodFlag: 'worried', now: NOW })
    const text = renderContextZh(ctx)
    expect(text).toContain('阿旅')
    expect(text).toContain('羁绊等级】B')
    expect(text).toContain('担心') // worried mood hint
  })
})
