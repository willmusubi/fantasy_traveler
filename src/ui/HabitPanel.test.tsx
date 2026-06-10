// UI flow jsdom can exercise: checking a daily habit offers a buff draft, and picking one
// applies it + closes the modal. Plus the weekly add-validation gate. (Drag-reorder + streak
// math are covered at the store/pure level.)

import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { useGame } from '../state/gameStore'
import { useHabits } from '../state/habitStore'
import { BuffChoiceModal } from './BuffChoiceModal'
import { HabitPanel } from './HabitPanel'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({
    gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {},
    activeQuest: null, recruitedId: null, victorySummary: null, pendingBuffChoices: [], ready: false,
  })
  useHabits.setState({ habits: [], loaded: false })
})
afterEach(cleanup)

describe('HabitPanel + BuffChoiceModal', () => {
  it('checking a daily habit offers a buff draft; picking one applies it and closes the modal', async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅')
    await useHabits.getState().add({ title: '按时起床', schedule: { kind: 'daily' } })
    render(
      <>
        <HabitPanel />
        <BuffChoiceModal />
      </>,
    )

    expect(screen.getByText('按时起床')).toBeInTheDocument()
    expect(screen.getByText('每日', { selector: '.habit-schedule' })).toBeInTheDocument() // the row's chip
    expect(screen.queryByText('坚持的回报', { exact: false })).toBeNull() // no modal yet

    await user.click(screen.getByLabelText('打卡'))
    expect(await screen.findByLabelText('取消打卡')).toHaveTextContent('✓')
    expect(useHabits.getState().habits[0].streak).toBe(1)

    // The buff draft modal appears with at least 3 cards.
    expect(await screen.findByText('坚持的回报', { exact: false })).toBeInTheDocument()
    const cards = screen.getAllByRole('button').filter((b) => b.className.includes('buff-card'))
    expect(cards.length).toBeGreaterThanOrEqual(3)

    await user.click(cards[0])
    expect(screen.queryByText('坚持的回报', { exact: false })).toBeNull() // modal closed
    expect(useGame.getState().gameState!.partyBuffs.some((b) => b.untilVictory)).toBe(true)
  })

  it('a weekly habit cannot be added until a weekday is picked', async () => {
    const user = userEvent.setup()
    render(<HabitPanel />)

    await user.type(screen.getByPlaceholderText(/养成一个习惯/), '读书')
    await user.click(screen.getByRole('tab', { name: '每周' }))
    const addBtn = screen.getByRole('button', { name: '添加' })
    expect(addBtn).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '三' })) // Wednesday
    expect(addBtn).toBeEnabled()
    await user.click(addBtn)

    expect(await screen.findByText('读书')).toBeInTheDocument()
    expect(useHabits.getState().habits[0].schedule).toEqual({ kind: 'weekly', days: [3] })
  })
})
