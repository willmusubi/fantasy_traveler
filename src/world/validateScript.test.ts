// §29 — validateScriptDef surfaces authoring mistakes that the engine otherwise
// swallows silently (broken nextChapterId = premature finale; unreachable chapter
// never plays; undeclared flags are invisible to the AI).

import { describe, expect, it } from 'vitest'
import type { ScriptChapter, ScriptDef } from '../domain/types'
import { validateScriptDef } from './validateScript'

const enc = (name: string) => ({
  enemyName: name, enemyTheme: 't', hpScale: 1, defScale: 1,
  narrationIntro: 'i', narrationVictory: 'v',
})

const chapter = (id: string, next: ScriptChapter['next']): ScriptChapter => ({
  id, next, title: id, lore: 'l', encounters: [enc(`${id}-boss`)],
  reward: { equipmentDefIds: [], unlockCompanionIds: [] },
})

const base = (over: Partial<ScriptDef> = {}): ScriptDef => ({
  id: 's', worldId: 'w', title: 'T', synopsis: 'S', startChapterId: 'ch1',
  chapters: {
    ch1: chapter('ch1', 'ch2'),
    ch2: chapter('ch2', null),
  },
  ...over,
})

describe('validateScriptDef', () => {
  it('a well-formed linear script validates clean', () => {
    const v = validateScriptDef(base())
    expect(v.valid).toBe(true)
    expect(v.errors).toHaveLength(0)
    expect(v.warnings).toHaveLength(0)
  })

  it('missing startChapterId is an error', () => {
    const v = validateScriptDef(base({ startChapterId: 'nope' }))
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('startChapterId'))).toBe(true)
  })

  it('a broken linear next link is an error', () => {
    const v = validateScriptDef(base({ chapters: { ch1: chapter('ch1', 'ghost') } }))
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('ghost'))).toBe(true)
  })

  it('a choice option pointing at a missing chapter is an error; null finale is fine', () => {
    const def = base({
      chapters: {
        ch1: chapter('ch1', {
          prompt: '选择',
          options: [
            { id: 'a', label: 'A', description: '', nextChapterId: null },
            { id: 'b', label: 'B', description: '', nextChapterId: 'ghost' },
          ],
        }),
      },
    })
    const v = validateScriptDef(def)
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('ghost'))).toBe(true)
  })

  it('duplicate option ids are an error', () => {
    const def = base({
      chapters: {
        ch1: chapter('ch1', {
          prompt: '选择',
          options: [
            { id: 'same', label: 'A', description: '', nextChapterId: null },
            { id: 'same', label: 'B', description: '', nextChapterId: null },
          ],
        }),
      },
    })
    expect(validateScriptDef(def).errors.some((e) => e.includes('重复选项'))).toBe(true)
  })

  it('an unreachable chapter is a warning (still valid)', () => {
    const def = base({
      chapters: {
        ch1: chapter('ch1', null),
        orphan: chapter('orphan', null),
      },
    })
    const v = validateScriptDef(def)
    expect(v.valid).toBe(true)
    expect(v.warnings.some((w) => w.includes('orphan'))).toBe(true)
  })

  it('setting an undeclared flag is a warning', () => {
    const def = base({
      flags: [{ key: 'declared', description: 'd' }],
      chapters: {
        ch1: chapter('ch1', {
          prompt: '选择',
          options: [
            { id: 'a', label: 'A', description: '', nextChapterId: null, setFlags: { declared: 'x' } },
            { id: 'b', label: 'B', description: '', nextChapterId: null, setFlags: { mystery: true } },
          ],
        }),
      },
    })
    const v = validateScriptDef(def)
    expect(v.valid).toBe(true)
    expect(v.warnings.some((w) => w.includes('mystery'))).toBe(true)
    expect(v.warnings.some((w) => w.includes('declared'))).toBe(false)
  })

  it('a chapter without encounters is an error', () => {
    const empty = { ...chapter('ch1', null), encounters: [] }
    const v = validateScriptDef(base({ chapters: { ch1: empty } }))
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.includes('遭遇'))).toBe(true)
  })
})
