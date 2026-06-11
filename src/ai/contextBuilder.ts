// Builds the rolling life-context fed to the companion LLM (§12, §21). Typed output
// + deterministic drop order so it's testable and token-bounded. Pure.

import { profileFor } from '../companion/roster'
import { isOverdue, localDateKey } from '../domain/dates'
import type { AffinityRank, Character, JournalEntry, Mood, MoodFlag, Todo } from '../domain/types'

export interface ChatContext {
  player: { name: string; className: string; level: number }
  affinityRank: AffinityRank
  todos: { openCount: number; overdueCount: number; doneToday: number; notableOpen: string[] }
  moodFlag: MoodFlag
  /** §29 — journal moods of the last 3 distinct days (newest first; [] = no entries). */
  recentMoods: Mood[]
  /** §29 — up to 3 upcoming due todos within 7 days (soonest first). */
  upcoming: { title: string; due: string }[]
}

const PRIORITY_RANK: Record<Todo['priority'], number> = { high: 0, med: 1, low: 2 }

export function buildContext(args: {
  player: Character
  affinityRank: AffinityRank
  todos: Todo[]
  moodFlag: MoodFlag
  now: Date
  /** §29 — journal entries (any order; the builder picks the last 3 distinct days). */
  journal?: JournalEntry[]
}): ChatContext {
  const { player, affinityRank, todos, moodFlag, now, journal } = args
  const today = localDateKey(now)

  const open = todos.filter((t) => t.status === 'open')
  const overdue = open.filter((t) => isOverdue(t.due, now))
  const doneToday = todos.filter(
    (t) => t.status === 'done' && t.completedAt && localDateKey(t.completedAt) === today,
  ).length

  // Notable = overdue first, then by priority — at most 3 titles.
  const notableOpen = [...open]
    .sort((a, b) => {
      const ao = isOverdue(a.due, now) ? 0 : 1
      const bo = isOverdue(b.due, now) ? 0 : 1
      if (ao !== bo) return ao - bo
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    })
    .slice(0, 3)
    .map((t) => t.title)

  // §29 — last 3 DISTINCT journal days' moods, newest first (latest entry wins per day).
  const moodByDay = new Map<string, Mood>()
  for (const e of [...(journal ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    moodByDay.set(e.date, e.mood)
  }
  const recentMoods = [...moodByDay.entries()]
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([, mood]) => mood)

  // §29 — the next 3 dated open todos within a week (the player's real "schedule").
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const upcoming = open
    .filter((t) => t.due && !isOverdue(t.due, now) && new Date(t.due) <= weekAhead)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    .slice(0, 3)
    .map((t) => ({ title: t.title, due: localDateKey(t.due!) }))

  return {
    player: {
      name: player.name,
      className: profileFor(player).role,
      level: player.stats.level,
    },
    affinityRank,
    todos: { openCount: open.length, overdueCount: overdue.length, doneToday, notableOpen },
    moodFlag,
    recentMoods,
    upcoming,
  }
}

const MOOD_ZH: Record<Mood, string> = { great: '很棒', good: '不错', neutral: '平平', down: '低落', bad: '很差' }

const MOOD_HINT: Record<MoodFlag, string> = {
  idle: '',
  worried: '（你正在为对方拖延的任务担心，但要温柔鼓励而不是责备）',
  proud: '（对方最近状态很好，你为TA感到骄傲）',
  concerned: '（对方最近心情低落，多给一些关心和安慰）',
}

/** Render the context as a compact zh-CN block for the dynamic prompt suffix. */
export function renderContextZh(ctx: ChatContext): string {
  const lines: string[] = []
  lines.push(`【搭档】${ctx.player.name}，${ctx.player.className}，等级${ctx.player.level}`)
  lines.push(`【羁绊等级】${ctx.affinityRank === 'none' ? '初识' : ctx.affinityRank}`)
  lines.push(
    `【今日待办】今天已完成${ctx.todos.doneToday}件；还有${ctx.todos.openCount}件未完成` +
      (ctx.todos.overdueCount > 0 ? `，其中${ctx.todos.overdueCount}件已逾期` : '') +
      '。',
  )
  if (ctx.todos.notableOpen.length > 0) {
    lines.push(`【待处理】${ctx.todos.notableOpen.join('、')}`)
  }
  // §29 — real-life mood + schedule, so companions can reference them naturally.
  if (ctx.recentMoods.length > 0) {
    lines.push(`【近日心情】最近日记里的心情（新→旧）：${ctx.recentMoods.map((m) => MOOD_ZH[m]).join('、')}`)
  }
  if (ctx.upcoming.length > 0) {
    lines.push(`【近期日程】${ctx.upcoming.map((u) => `${u.due} 截止「${u.title}」`).join('；')}`)
  }
  const hint = MOOD_HINT[ctx.moodFlag]
  if (hint) lines.push(hint)
  return lines.join('\n')
}
