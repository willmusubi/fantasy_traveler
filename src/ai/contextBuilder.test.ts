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

// §29 — real-life mood + schedule feeds.
describe('buildContext §29: recent moods + upcoming schedule', () => {
  const entry = (date: string, mood: 'great' | 'good' | 'neutral' | 'down' | 'bad', at: string) => ({
    id: Math.random().toString(), date, mood, body: 'b', createdAt: at,
  })

  it('picks the last 3 DISTINCT journal days, newest first; latest entry wins per day', () => {
    const ctx = buildContext({
      player, affinityRank: 'C', todos: [], moodFlag: 'idle', now: NOW,
      journal: [
        entry('2026-05-26', 'bad', '2026-05-26T08:00:00Z'),
        entry('2026-05-27', 'down', '2026-05-27T08:00:00Z'),
        entry('2026-05-28', 'neutral', '2026-05-28T08:00:00Z'),
        entry('2026-05-29', 'down', '2026-05-29T08:00:00Z'),
        entry('2026-05-29', 'great', '2026-05-29T20:00:00Z'), // later entry wins the day
      ],
    })
    expect(ctx.recentMoods).toEqual(['great', 'neutral', 'down'])
  })

  it('upcoming = next 3 dated open todos within a week (overdue excluded)', () => {
    const todos: Todo[] = [
      todo({ title: '今天到期', due: '2026-05-29' }),
      todo({ title: '三天后', due: '2026-06-01' }),
      todo({ title: '六天后', due: '2026-06-04' }),
      todo({ title: '太远了', due: '2026-06-20' }),
      todo({ title: '逾期的', due: '2026-05-01' }),
      todo({ title: '无日期' }),
    ]
    const ctx = buildContext({ player, affinityRank: 'C', todos, moodFlag: 'idle', now: NOW })
    expect(ctx.upcoming.map((u) => u.title)).toEqual(['今天到期', '三天后', '六天后'])
  })

  it('renderContextZh includes 近日心情 and 近期日程 lines (and omits them when empty)', () => {
    const withData = renderContextZh(
      buildContext({
        player, affinityRank: 'C', moodFlag: 'idle', now: NOW,
        todos: [todo({ title: '写周报', due: '2026-06-01' })],
        journal: [entry('2026-05-29', 'down', '2026-05-29T08:00:00Z')],
      }),
    )
    expect(withData).toContain('【近日心情】')
    expect(withData).toContain('低落')
    expect(withData).toContain('【近期日程】')
    expect(withData).toContain('写周报')

    const empty = renderContextZh(buildContext({ player, affinityRank: 'C', todos: [], moodFlag: 'idle', now: NOW }))
    expect(empty).not.toContain('近日心情')
    expect(empty).not.toContain('近期日程')
  })
})
