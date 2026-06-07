// The 效率 zone: the calendar hub surfaces the selected day's todo, and journaling a
// day saves the entry + shows the companion's reaction inline.

import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { localDateKey } from '../domain/dates'
import { useGame } from '../state/gameStore'
import { useJournal } from '../state/journalStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { ProductivityView } from './ProductivityView'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamage: null, activeQuest: null, recruitedId: null, victorySummary: null, ready: false })
  useJournal.setState({ entries: [], loaded: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})
afterEach(cleanup)

describe('productivity view', () => {
  it("shows the selected day's todo and journals it with a companion reaction", async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const today = localDateKey(new Date())
    await useTodos.getState().add({ title: '买胶卷', priority: 'high', due: today })

    render(<ProductivityView />)

    // Today is selected by default → its todo shows in the day panel (it also shows as a
    // calendar chip, so scope the assertion to the day region).
    const dayPanel = screen.getByRole('region', { name: '当天' })
    expect(within(dayPanel).getByText('买胶卷')).toBeInTheDocument()

    // Write a journal for today.
    await user.click(screen.getByRole('radio', { name: '很好' }))
    await user.type(screen.getByPlaceholderText('写下这一天…'), '今天拍到了好照片。')
    await user.click(screen.getByRole('button', { name: '保存日记' }))

    // The companion's response now surfaces in the global ReactionPopup (mounted app-level,
    // not in this isolated render), so assert the reaction state was set + the entry saved.
    await waitFor(() => expect(useGame.getState().reaction).not.toBeNull())
    expect(useJournal.getState().entries).toHaveLength(1)
    // The saved entry renders (day panel + recent list both show it).
    expect(screen.getAllByText('今天拍到了好照片。').length).toBeGreaterThan(0)
  })

  it('quick-adds a todo onto the selected day', async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    render(<ProductivityView />)

    await user.type(screen.getByPlaceholderText('＋ 新待办（截止这天）'), '冲洗照片')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: '当天' })).getByText('冲洗照片')).toBeInTheDocument(),
    )
    const today = localDateKey(new Date())
    expect(useTodos.getState().todos.some((t) => t.title === '冲洗照片' && t.due === today)).toBe(true)
  })
})
