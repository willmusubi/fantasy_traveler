import { describe, expect, it } from 'vitest'
import { renderWorldLore, storyChapterFor, WORLD_DEFS } from './worlds'

const w = WORLD_DEFS.cats_eye

describe("Cat's Eye world (canon)", () => {
  it('storyChapterFor picks the chapter for the next un-recruited sister', () => {
    const c1 = storyChapterFor(w, ['raisei_hitomi'])
    expect(c1.reward.unlockCompanionIds).toContain('raisei_rui')

    const c2 = storyChapterFor(w, ['raisei_hitomi', 'raisei_rui'])
    expect(c2.reward.unlockCompanionIds).toContain('raisei_ai')

    // All sisters recruited → finale chapter, no further recruit.
    const c3 = storyChapterFor(w, ['raisei_hitomi', 'raisei_rui', 'raisei_ai'])
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
    expect(lore).toContain('卢卡') // a canon antagonist
    expect(lore).toContain('真实对手')
    expect(lore).not.toContain('拖延心魔')
  })
})
