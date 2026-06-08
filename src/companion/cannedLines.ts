// Per-companion canned reaction pools — NO LLM call. This is the high-frequency
// felt reward on todo completion (§21 "the loop fix"). Selection is pure + testable.

import { LOCAL_PACK } from '../content/localPack'
import type { ExpressionKey, Mood, Priority } from '../domain/types'

export interface CannedLine {
  text: string
  expression: ExpressionKey
}

/** Coarse emotional tone a journal entry evokes in a companion (§21 mood flags). */
export type JournalTone = 'proud' | 'concerned' | 'neutral'

export interface CompanionLines {
  complete: Record<Priority, CannedLine[]>
  worried: CannedLine[]
  journal: Record<JournalTone, CannedLine[]>
}

const MIRA: CompanionLines = {
  complete: {
    low: [
      { text: '搞定一件啦，节奏不错～', expression: 'smile' },
      { text: '轻轻松松！下一个交给我们。', expression: 'happy' },
      { text: '看，没那么难嘛！', expression: 'smile' },
    ],
    med: [
      { text: '漂亮！这一击干净利落！', expression: 'happy' },
      { text: '干得好，搭档！继续保持。', expression: 'determined' },
      { text: '哼哼，越来越有冒险者的样子了。', expression: 'smile' },
    ],
    high: [
      { text: '哇——这一击太狠了！我都看呆了！', expression: 'surprised' },
      { text: '这种硬骨头都啃下来了，你超强的！', expression: 'happy' },
      { text: '流星坠！就是这种感觉，超带劲！', expression: 'determined' },
    ],
  },
  worried: [
    { text: '那件事还拖着呢…要不我们现在一起把它解决掉？', expression: 'worried' },
    { text: '对手又强了一分…别担心，有我陪着你。', expression: 'worried' },
  ],
  journal: {
    proud: [
      { text: '把今天写下来了…我都看在眼里，你做得很好。', expression: 'happy' },
      { text: '能这样回头看看自己，真好。继续保持呀～', expression: 'smile' },
    ],
    concerned: [
      { text: '别太苛责自己，今天已经够努力了。', expression: 'worried' },
      { text: '把心事写出来就好…明天还有我陪着你。', expression: 'worried' },
    ],
    neutral: [
      { text: '记录下来，日子就不会糊成一团啦。', expression: 'smile' },
      { text: '嗯，今天的也收好了。', expression: 'smile' },
    ],
  },
}

const VELA: CompanionLines = {
  complete: {
    low: [
      { text: '一步一个脚印，挺好。', expression: 'smile' },
      { text: '嗯，按计划推进着呢。', expression: 'smile' },
    ],
    med: [
      { text: '处理得很稳，我很欣赏。', expression: 'smile' },
      { text: '不错，节奏掌握在你自己手里了。', expression: 'happy' },
    ],
    high: [
      { text: '这么棘手的事都完成了，了不起。', expression: 'happy' },
      { text: '看来今天的主角是你呢。', expression: 'smile' },
    ],
  },
  worried: [
    { text: '有件事一直搁着，需要我帮你理一理吗？', expression: 'worried' },
    { text: '别给自己太大压力，我们慢慢来。', expression: 'worried' },
  ],
  journal: {
    proud: [
      { text: '写得很坦诚，这份清醒难能可贵。', expression: 'smile' },
      { text: '你比自己以为的更稳。', expression: 'smile' },
    ],
    concerned: [
      { text: '低落也是一种信号，记下来，我们慢慢理。', expression: 'worried' },
      { text: '不必急着好起来，我会在。', expression: 'worried' },
    ],
    neutral: [
      { text: '留点字句给将来的自己，挺好。', expression: 'smile' },
      { text: '嗯，存档了。', expression: 'neutral' },
    ],
  },
}

const NOVA: CompanionLines = {
  complete: {
    low: [
      { text: '叮！经验值到账～', expression: 'happy' },
      { text: '小目标达成，给你比个心！', expression: 'happy' },
    ],
    med: [
      { text: '哦哦哦完成度up！你好厉害！', expression: 'happy' },
      { text: '系统提示：搭档状态极佳！', expression: 'determined' },
    ],
    high: [
      { text: '大佬！这波操作我给满分！', expression: 'surprised' },
      { text: '超级无敌大成功——撒花！', expression: 'happy' },
    ],
  },
  worried: [
    { text: '检测到一个拖延信号…要不要我帮你定个小闹钟？', expression: 'worried' },
    { text: '没关系的，明天也能重新出发哦。', expression: 'worried' },
  ],
  journal: {
    proud: [
      { text: '心情日志已同步：今天闪闪发光！', expression: 'happy' },
      { text: '检测到好状态，给你存成成就！', expression: 'happy' },
    ],
    concerned: [
      { text: '情绪缓存已接收…要不要我陪你聊两句？', expression: 'worried' },
      { text: '没关系的，明天重新加载就好。', expression: 'worried' },
    ],
    neutral: [
      { text: '日记已保存到时间胶囊～', expression: 'happy' },
      { text: '记录完成，叮！', expression: 'smile' },
    ],
  },
}

const DEFAULT_LINES: Record<string, CompanionLines> = {
  mira: MIRA,
  vela: VELA,
  nova: NOVA,
}

// A local content pack may supply its own per-companion pools (keyed by its companion ids).
const LINES: Record<string, CompanionLines> = LOCAL_PACK?.cannedLines ?? DEFAULT_LINES

const FALLBACK: CannedLine = { text: '完成！', expression: 'smile' }

/** Deterministic pool selection by rotating index (pure; tested). */
export function selectFromPool<T>(pool: T[], index: number, fallback: T): T {
  if (pool.length === 0) return fallback
  const i = ((index % pool.length) + pool.length) % pool.length
  return pool[i]
}

export function pickCompletionLine(companionId: string, priority: Priority, index: number): CannedLine {
  const pool = LINES[companionId]?.complete[priority] ?? []
  return selectFromPool(pool, index, FALLBACK)
}

export function pickWorriedLine(companionId: string, index: number): CannedLine {
  const pool = LINES[companionId]?.worried ?? []
  return selectFromPool(pool, index, { text: '别担心，我在呢。', expression: 'worried' })
}

const JOURNAL_FALLBACK: Record<JournalTone, CannedLine> = {
  proud: { text: '今天的你，值得肯定。', expression: 'smile' },
  concerned: { text: '我在呢，别一个人扛。', expression: 'worried' },
  neutral: { text: '记下来了。', expression: 'neutral' },
}

/** Map a journal mood to the tone its companion reaction takes (great/good → proud,
 *  down/bad → concerned, neutral → neutral). Mirrors the reducer's mood-flag mapping. */
export function journalTone(mood: Mood): JournalTone {
  if (mood === 'great' || mood === 'good') return 'proud'
  if (mood === 'down' || mood === 'bad') return 'concerned'
  return 'neutral'
}

export function pickJournalLine(companionId: string, mood: Mood, index: number): CannedLine {
  const tone = journalTone(mood)
  const pool = LINES[companionId]?.journal[tone] ?? []
  return selectFromPool(pool, index, JOURNAL_FALLBACK[tone])
}
