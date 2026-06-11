// §29 script validation — a broken ScriptDef used to fail SILENTLY (an unknown
// nextChapterId just ends the campaign via advanceToChapter's finale fallback, and an
// unreachable chapter simply never plays). This validator surfaces those authoring
// mistakes at registration time (and for offline tooling / the script-generator skill).

import type { ScriptChoice, ScriptDef } from '../domain/types'

export interface ScriptValidation {
  valid: boolean
  /** Definite authoring bugs (broken links, empty chapters, duplicate option ids). */
  errors: string[]
  /** Suspicious but playable (unreachable chapters, undeclared flags). */
  warnings: string[]
}

const isChoice = (next: unknown): next is ScriptChoice =>
  !!next && typeof next === 'object'

export function validateScriptDef(def: ScriptDef): ScriptValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const chapterIds = new Set(Object.keys(def.chapters))
  const declaredFlags = new Set((def.flags ?? []).map((f) => f.key))

  if (!chapterIds.has(def.startChapterId)) {
    errors.push(`startChapterId「${def.startChapterId}」不存在于 chapters`)
  }

  for (const [id, ch] of Object.entries(def.chapters)) {
    if (ch.id !== id) warnings.push(`章节键「${id}」与其 id「${ch.id}」不一致`)
    if (!ch.encounters || ch.encounters.length === 0) errors.push(`章节「${id}」没有任何遭遇`)
    const next = ch.next
    if (typeof next === 'string') {
      if (!chapterIds.has(next)) errors.push(`章节「${id}」的 next「${next}」不存在（会被静默当作终章）`)
    } else if (isChoice(next)) {
      if (!next.options || next.options.length < 2) errors.push(`章节「${id}」的分歧点不足 2 个选项`)
      const seen = new Set<string>()
      for (const o of next.options ?? []) {
        if (seen.has(o.id)) errors.push(`章节「${id}」的分歧点存在重复选项 id「${o.id}」`)
        seen.add(o.id)
        if (o.nextChapterId !== null && !chapterIds.has(o.nextChapterId)) {
          errors.push(`章节「${id}」选项「${o.id}」指向不存在的章节「${o.nextChapterId}」`)
        }
        for (const key of Object.keys(o.setFlags ?? {})) {
          if (!declaredFlags.has(key)) {
            warnings.push(`选项「${o.id}」设置了未在 flags 中声明的旗标「${key}」（AI 无法理解其含义）`)
          }
        }
      }
    }
  }

  // Reachability — BFS from the start chapter across linear links + choice options.
  const reachable = new Set<string>()
  const queue = chapterIds.has(def.startChapterId) ? [def.startChapterId] : []
  while (queue.length > 0) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const next = def.chapters[id]?.next
    if (typeof next === 'string' && chapterIds.has(next)) queue.push(next)
    else if (isChoice(next)) {
      for (const o of next.options ?? []) {
        if (o.nextChapterId && chapterIds.has(o.nextChapterId)) queue.push(o.nextChapterId)
      }
    }
  }
  for (const id of chapterIds) {
    if (!reachable.has(id)) warnings.push(`章节「${id}」从起点不可达（永远不会被玩到）`)
  }

  return { valid: errors.length === 0, errors, warnings }
}
