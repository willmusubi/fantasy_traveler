import { describe, expect, it } from 'vitest'
import { renderWorldLore, storyChapterFor, WORLD_DEFS } from './worlds'

const w = WORLD_DEFS.stargazers

describe('观星会 world (canon)', () => {
  it('storyChapterFor picks the chapter for the next un-recruited companion', () => {
    const c1 = storyChapterFor(w, ['mira'])
    expect(c1.reward.unlockCompanionIds).toContain('vela')

    const c2 = storyChapterFor(w, ['mira', 'vela'])
    expect(c2.reward.unlockCompanionIds).toContain('nova')

    // All companions recruited → finale chapter, no further recruit.
    const c3 = storyChapterFor(w, ['mira', 'vela', 'nova'])
    expect(c3.reward.unlockCompanionIds).toHaveLength(0)
  })

  it('every authored boss encounter references a real antagonist id', () => {
    const ids = new Set(w.antagonists.map((a) => a.id))
    for (const ch of w.storyChapters) {
      for (const e of ch.encounters) {
        if (e.antagonistId) expect(ids.has(e.antagonistId)).toBe(true)
      }
    }
  })

  it('renderWorldLore lists the real antagonists, not 心魔', () => {
    const lore = renderWorldLore(w)
    expect(lore).toContain('惰怠之偶') // a canon antagonist
    expect(lore).toContain('真实对手')
    expect(lore).not.toContain('拖延心魔')
  })
})
