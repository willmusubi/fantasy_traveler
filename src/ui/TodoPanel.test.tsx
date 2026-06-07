// UI behaviors that jsdom can exercise: the check/un-check toggle and inline edit.
// (Drag-reorder is covered at the store level in todoStore.test.ts — HTML5 DnD has
// no faithful jsdom simulation.) Plus the Error Boundary localizing a crash.

import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from '../data/db'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { ErrorBoundary } from './ErrorBoundary'
import { TodoPanel } from './TodoPanel'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamage: null, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})
afterEach(cleanup)

describe('TodoPanel interactions', () => {
  it('checks then un-checks a task via the same button', async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await useTodos.getState().add({ title: '写日报', priority: 'med' })
    render(<TodoPanel />)

    await user.click(screen.getByLabelText('完成'))
    const uncheck = await screen.findByLabelText('取消完成')
    expect(uncheck).toHaveTextContent('✓')
    expect(useTodos.getState().todos[0].status).toBe('done')

    await user.click(uncheck)
    expect(await screen.findByLabelText('完成')).toBeInTheDocument()
    expect(useTodos.getState().todos[0].status).toBe('open')
  })

  it('edits a task inline', async () => {
    const user = userEvent.setup()
    await useTodos.getState().add({ title: '旧标题', priority: 'low' })
    render(<TodoPanel />)

    await user.click(screen.getByLabelText('编辑'))
    const titleInput = await screen.findByLabelText('编辑标题')
    await user.clear(titleInput)
    await user.type(titleInput, '新标题')
    await user.click(screen.getByText('保存'))

    expect(await screen.findByText('新标题')).toBeInTheDocument()
    expect(screen.queryByText('旧标题')).toBeNull()
    expect(useTodos.getState().todos[0].title).toBe('新标题')
  })
})

describe('TodoPanel — countdown timer', () => {
  it('opens the dropdown and arms a countdown from a preset', async () => {
    const user = userEvent.setup()
    await useTodos.getState().add({ title: '专注', priority: 'high' })
    render(<TodoPanel />)

    await user.click(screen.getByLabelText('设定限时')) // open the FF command window
    await user.click(await screen.findByLabelText('开始 25 分钟倒计时'))
    expect(await screen.findByLabelText('取消倒计时')).toBeInTheDocument()
    expect(useTodos.getState().todos[0].timerStartedAt).toBeTruthy()
    expect(useTodos.getState().todos[0].timerDurationMs).toBe(25 * 60_000)
  })

  it('arms a custom duration from the dropdown', async () => {
    const user = userEvent.setup()
    await useTodos.getState().add({ title: '自定义', priority: 'med' })
    render(<TodoPanel />)

    await user.click(screen.getByLabelText('设定限时'))
    await user.type(await screen.findByLabelText('自定义分钟'), '30')
    await user.click(screen.getByLabelText('开始自定义倒计时'))
    expect(await screen.findByLabelText('取消倒计时')).toBeInTheDocument()
    expect(useTodos.getState().todos[0].timerDurationMs).toBe(30 * 60_000)
  })

  it('cancel disarms the countdown back to the trigger', async () => {
    const user = userEvent.setup()
    await useTodos.getState().add({ title: '取消', priority: 'low' })
    render(<TodoPanel />)

    await user.click(screen.getByLabelText('设定限时'))
    await user.click(await screen.findByLabelText('开始 15 分钟倒计时'))
    await user.click(await screen.findByLabelText('取消倒计时'))
    expect(await screen.findByLabelText('设定限时')).toBeInTheDocument()
    expect(useTodos.getState().todos[0].timerStartedAt).toBeUndefined()
  })

  it('shows the spent state once the timer has fired', async () => {
    await useTodos.getState().add({ title: '已超时', priority: 'med' })
    const id = useTodos.getState().todos[0].id
    const stamp = new Date().toISOString()
    useTodos.setState({
      todos: useTodos.getState().todos.map((t) =>
        t.id === id ? { ...t, timerStartedAt: stamp, timerDurationMs: 1000, timerFiredAt: stamp } : t,
      ),
    })
    render(<TodoPanel />)
    expect(await screen.findByText('⏱ 时间到')).toBeInTheDocument()
  })
})

describe('ErrorBoundary', () => {
  it('shows a fallback for the failing region and lets siblings live', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Boom(): JSX.Element {
      throw new Error('boom')
    }
    render(
      <div>
        <ErrorBoundary label="队伍">
          <Boom />
        </ErrorBoundary>
        <div>存活的面板</div>
      </div>,
    )
    expect(screen.getByText('出了点问题')).toBeInTheDocument()
    expect(screen.getByText(/队伍/)).toBeInTheDocument()
    expect(screen.getByText('存活的面板')).toBeInTheDocument()
    spy.mockRestore()
  })
})
