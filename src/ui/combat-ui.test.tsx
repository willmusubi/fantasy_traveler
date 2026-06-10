// Combat UI: the character detail sheet (skills + costs + vitals) and the battle-stage
// skill bar (casting spends MP).

import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { CharacterSheet } from './CharacterSheet'
import { CombatLog } from './CombatLog'
import { MonsterHUD } from './MonsterHUD'
import { ReactionPopup } from './ReactionPopup'
import { RecruitModal } from './RecruitModal'
import { VictoryBanner } from './VictoryBanner'

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})
afterEach(cleanup)

const companionId = () => useGame.getState().characters.find((c) => c.kind === 'companion')!.id

describe('character detail sheet', () => {
  it('lists a companion skill with its MP cost', async () => {
    await useGame.getState().seedNewGame('阿旅')
    render(<CharacterSheet characterId={companionId()} onClose={() => {}} />)
    expect(screen.getByText('流光击')).toBeInTheDocument() // 米拉's L1 skill
    expect(screen.getByText(/MP 8/)).toBeInTheDocument()
    expect(screen.getByText(/最年轻/)).toBeInTheDocument() // detailed bio is shown
  })
})

describe('recruit modal', () => {
  it('greets a newly recruited companion with a first-meeting dialogue + bio', async () => {
    await useGame.getState().seedNewGame('阿旅')
    useGame.setState({ recruitedId: 'vela' })
    render(<RecruitModal />)
    expect(screen.getByText(/我是薇拉/)).toBeInTheDocument() // a first-meeting line
    expect(screen.getByText(/运筹帷幄/)).toBeInTheDocument() // the detailed bio
  })
})

describe('reaction popup', () => {
  it('shows who is speaking (name + line + affinity) with a portrait', async () => {
    await useGame.getState().seedNewGame('阿旅')
    const c = useGame.getState().characters.find((ch) => ch.kind === 'companion')!
    useGame.setState({ reaction: { key: 1, companionId: c.id, text: '干得漂亮！', expression: 'happy', affinityDelta: 5 } })
    render(<ReactionPopup />)
    expect(screen.getByText('干得漂亮！')).toBeInTheDocument()
    expect(screen.getAllByText(c.name).length).toBeGreaterThan(0) // popup name + portrait label
    expect(screen.getByText(/\+5 好感/)).toBeInTheDocument()
  })
})

describe('battle-stage action plan', () => {
  it('plans a skill for the on-field companion, and a completed task executes it', async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅')
    render(<MonsterHUD />)

    // Defaults now live in a popup; open it, then click 流光击 to ASSIGN it (no instant cast).
    await user.click(screen.getByRole('button', { name: /默认行动/ }))
    await user.click(screen.getByRole('button', { name: /流光击/ }))
    await waitFor(() => expect(useGame.getState().gameState!.roundPlan[companionId()]).toBe('liuguang'))

    // Completing a task executes the round → the planned skill fires (named in the log).
    await useTodos.getState().add({ title: '打', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id)
    await waitFor(() => {
      const log = useGame.getState().gameState!.combatLog.flatMap((r) => r.lines.map((l) => l.text)).join('\n')
      expect(log).toContain('流光击')
    })
  })
})

describe('victory settlement window', () => {
  it('shows the FF-style results window with enemy, rewards, and loot', () => {
    useGame.setState({
      victorySummary: {
        key: 1, enemy: '惰怠之偶', xp: 193, gold: 44,
        levelUps: [{ name: '旅人', level: 2 }], loot: ['星辉之刃'], recruits: [], questComplete: false,
      },
    })
    render(<VictoryBanner />)
    expect(screen.getByText('战斗胜利')).toBeInTheDocument()
    expect(screen.getByText(/惰怠之偶/)).toBeInTheDocument()
    expect(screen.getByText(/星辉之刃/)).toBeInTheDocument()
    expect(screen.getByText(/旅人 升至 Lv\.2/)).toBeInTheDocument()
  })

  it('renders nothing when there is no victory', () => {
    useGame.setState({ victorySummary: null })
    const { container } = render(<VictoryBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('combat log panel', () => {
  it('expands to show the round-by-round interactions', async () => {
    const user = userEvent.setup()
    await useGame.getState().seedNewGame('阿旅')
    await useTodos.getState().add({ title: '打一架', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id)

    render(<CombatLog />)
    await user.click(screen.getByRole('button', { name: /战斗记录/ }))
    expect(screen.getAllByText(/→/).length).toBeGreaterThan(0) // per-actor attack lines ("瞳 → 敌 -40")
  })
})
