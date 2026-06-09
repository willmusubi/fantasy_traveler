// The post-boss branch modal locks in a persistent campaign decision (which path / who is
// rescued), so its option → optionId wiring is high-blast-radius. It had no component test.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state/gameStore'
import { ScriptChoiceModal } from './ScriptChoiceModal'

afterEach(cleanup)

describe('ScriptChoiceModal', () => {
  it('renders nothing without a pending choice', () => {
    useGame.setState({ pendingScriptChoice: null })
    const { container } = render(<ScriptChoiceModal />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking an option dispatches chooseScriptOption with THAT option id', async () => {
    const user = userEvent.setup()
    const chooseScriptOption = vi.fn(async (_id: string) => {})
    useGame.setState({
      pendingScriptChoice: {
        prompt: '她命悬一线 —— 你要出手吗？',
        options: [
          { id: 'rescue', label: '出手相救', description: '改写她的结局', nextChapterId: 'ch3' },
          { id: 'fate', label: '遵循命运', description: '不干预既定的结局', nextChapterId: 'ch3' },
        ],
      },
      chooseScriptOption,
    })
    render(<ScriptChoiceModal />)

    expect(screen.getByText('她命悬一线 —— 你要出手吗？')).toBeInTheDocument()
    await user.click(screen.getByText('出手相救'))
    expect(chooseScriptOption).toHaveBeenCalledWith('rescue')
    expect(chooseScriptOption).toHaveBeenCalledTimes(1)
  })

  it('exposes the dialog with an accessible role + name (shared Modal)', () => {
    useGame.setState({
      pendingScriptChoice: {
        prompt: '抉择',
        options: [{ id: 'a', label: '甲', description: '', nextChapterId: null }],
      },
      chooseScriptOption: vi.fn(async (_id: string) => {}),
    })
    render(<ScriptChoiceModal />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('命运的抉择')
  })
})
