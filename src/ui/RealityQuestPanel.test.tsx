import 'fake-indexeddb/auto'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from '../data/db'
import { fetchBilibiliSeasonEvidence } from '../reality/bilibili'
import { useGame } from '../state/gameStore'
import { useReality } from '../state/realityStore'
import { RealityQuestPanel } from './RealityQuestPanel'

vi.mock('../reality/bilibili', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reality/bilibili')>()
  return { ...actual, fetchBilibiliSeasonEvidence: vi.fn() }
})

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
  useReality.setState({ quests: [], loaded: false, checkingId: null, error: null })
  vi.mocked(fetchBilibiliSeasonEvidence).mockReset()
  await useGame.getState().seedNewGame('威尔')
})
afterEach(cleanup)

describe('RealityQuestPanel', () => {
  function seasonEvidence(value: number) {
    return {
      provider: 'bilibili-season' as const,
      metric: 'coin' as const,
      sourceRef: 'BV1dzEx6jERS',
      value,
      sourceUrl: 'https://space.bilibili.com/42/lists/9001?type=season',
      observedAt: '2026-06-13T12:00:00.000Z',
      title: 'Fantasy Traveler',
      ownerName: '威尔不太逊',
      videoCount: 3,
    }
  }

  it('grants 金钱镖 at 100 collection coins and shows the next reward', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchBilibiliSeasonEvidence).mockResolvedValue(seasonEvidence(137))
    render(<RealityQuestPanel />)

    await user.type(screen.getByPlaceholderText(/BV号/), 'https://www.bilibili.com/video/BV1dzEx6jERS')
    await user.click(screen.getByRole('button', { name: '保存参赛系列' }))

    expect(await screen.findByText('合集累计投币：137')).toBeInTheDocument()
    expect(screen.getByText('共 3 条视频')).toBeInTheDocument()
    expect(screen.getByText('金钱镖已获得')).toBeInTheDocument()
    expect(screen.getByText('吉语钱等待显灵')).toBeInTheDocument()
    expect(screen.getByText(/众筹来了第一把趁手的武器/)).toBeInTheDocument()
    expect(screen.getByText(/你币有了/)).toBeInTheDocument()
    expect(fetchBilibiliSeasonEvidence).toHaveBeenCalledTimes(1)
    expect(useGame.getState().gameState!.ownedEquipment.filter((item) => item.defId === 'money_dart')).toHaveLength(1)
    expect(useGame.getState().gameState!.ownedEquipment.filter((item) => item.defId === 'lucky_coin')).toHaveLength(0)
  })

  it('directly grants both rewards when the collection has reached 1000 coins', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchBilibiliSeasonEvidence).mockResolvedValue(seasonEvidence(1200))
    render(<RealityQuestPanel />)

    await user.type(screen.getByPlaceholderText(/BV号/), 'BV1dzEx6jERS')
    await user.click(screen.getByRole('button', { name: '保存参赛系列' }))

    expect(await screen.findByText('吉语钱已获得')).toBeInTheDocument()
    expect(useGame.getState().gameState!.ownedEquipment.filter((item) => item.defId === 'money_dart')).toHaveLength(1)
    expect(useGame.getState().gameState!.ownedEquipment.filter((item) => item.defId === 'lucky_coin')).toHaveLength(1)
  })

  it('checks two pending milestones with one weekly collection request', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchBilibiliSeasonEvidence).mockResolvedValue(seasonEvidence(50))
    render(<RealityQuestPanel />)

    await user.type(screen.getByPlaceholderText(/BV号/), 'BV1dzEx6jERS')
    await user.click(screen.getByRole('button', { name: '保存参赛系列' }))
    expect(await screen.findByText('合集累计投币：50')).toBeInTheDocument()

    await act(async () => {
      await useReality.getState().verifyDue(new Date('2026-06-21T12:00:00.000Z'))
    })
    expect(fetchBilibiliSeasonEvidence).toHaveBeenCalledTimes(2)
  })
})
