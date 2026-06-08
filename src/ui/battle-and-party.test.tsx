// New battle/roster UI surfaces: the HP/MP vitals readout on the party roster, and
// the "start the story" call-to-action on the battle stage when no quest is active.

import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { MonsterHUD } from './MonsterHUD'
import { PartyPanel } from './PartyPanel'

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

describe('battle + party UI', () => {
  it('PartyPanel shows each member’s HP and MP', async () => {
    await useGame.getState().seedNewGame('术士', 'arcanist') // L1 arcanist: HP 85, MP 70
    render(<PartyPanel />)
    expect(screen.getByText(/HP 85/)).toBeInTheDocument()
    expect(screen.getByText(/MP 70/)).toBeInTheDocument()
  })

  it('MonsterHUD shows a start-quest CTA when no quest is active', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    render(<MonsterHUD />)
    expect(screen.getByRole('button', { name: /开启剧情副本/ })).toBeInTheDocument()
  })

  it('MonsterHUD shows a speed-ordered turn bar (this round + next round) listing each actor', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    render(<MonsterHUD />)
    const bar = screen.getByLabelText('出手顺序')
    // Two rounds are previewed, so each actor appears more than once (current + next round, plus laps).
    expect(within(bar).getAllByText('米拉').length).toBeGreaterThan(0) // a party member is queued
    expect(within(bar).getAllByText('拖延心魔').length).toBeGreaterThan(0) // and so is the enemy
    expect(within(bar).getByText(/下一回合/)).toBeInTheDocument() // the round divider
  })

  it('shows each member’s planned action as a badge on its battle sprite', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    const companion = useGame.getState().characters.find((c) => c.kind === 'companion')!
    await useGame.getState().setRoundAction(companion.id, 'liuguang') // plan 米拉 → 流光击
    const { container } = render(<MonsterHUD />)
    const badges = [...container.querySelectorAll('.bsprite-action')].map((b) => b.textContent)
    expect(badges).toContain('流光击') // 米拉's planned skill, on her sprite
    expect(badges.some((b) => b?.includes('普攻'))).toBe(true) // the skill-less player defaults to 普攻
  })
})
