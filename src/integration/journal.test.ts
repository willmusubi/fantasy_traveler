// Writing a journal entry persists it, pays the once-per-day reflection reward
// (party XP + companion affinity + mood flag), and fires an in-character reaction.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { JOURNAL_XP } from '../domain/config'
import { selectPlayer, useGame } from '../state/gameStore'
import { useJournal } from '../state/journalStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, victorySummary: null, ready: false })
  useJournal.setState({ entries: [], loaded: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

const companionId = () => useGame.getState().characters.find((c) => c.kind === 'companion')!.id

describe('journal', () => {
  it('persists the entry, pays party XP, and triggers a mood-keyed companion reaction', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const xp0 = selectPlayer(useGame.getState())!.stats.xp

    await useJournal.getState().add({ date: '2026-05-31', mood: 'great', title: '好日子', body: '今天完成了很多事。' })

    // Saved.
    expect(useJournal.getState().entries).toHaveLength(1)
    expect(useJournal.getState().entries[0].body).toContain('今天')
    // Party-wide XP grew by the reflection reward.
    expect(selectPlayer(useGame.getState())!.stats.xp).toBe(xp0 + JOURNAL_XP)
    // The companion reacted, and a 'great' mood reads as pride.
    expect(useGame.getState().reaction).not.toBeNull()
    expect(useGame.getState().gameState!.moodFlags[companionId()]).toBe('proud')
  })

  it('does not re-pay XP on a second entry the same local day, but still saves it', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await useJournal.getState().add({ date: '2026-05-31', mood: 'good', body: '第一篇' })
    const xpAfterFirst = selectPlayer(useGame.getState())!.stats.xp

    await useJournal.getState().add({ date: '2026-05-31', mood: 'down', body: '第二篇' })
    expect(selectPlayer(useGame.getState())!.stats.xp).toBe(xpAfterFirst) // no extra XP
    expect(useJournal.getState().entries).toHaveLength(2) // but both are saved
  })

  it('ignores a blank entry', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await useJournal.getState().add({ date: '2026-05-31', mood: 'neutral', body: '   ' })
    expect(useJournal.getState().entries).toHaveLength(0)
  })
})
