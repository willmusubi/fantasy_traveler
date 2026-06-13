import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, RealityEvidence, RealityQuest } from '../domain/types'
import { closeDb } from './db'
import { gameStateRepo, realityQuestsRepo } from './repositories'

const gameState: GameState = {
  partyIds: ['player'],
  enemies: [],
  storyStage: 0,
  buffs: [],
  moodFlags: {},
  lastResolvedAt: '',
  encounterIndex: 0,
  unlockedCompanionIds: [],
  ownedEquipment: [],
  resources: {},
  gold: 0,
  partyBuffs: [],
  combatLog: [],
  charge: {},
  roundPlan: {},
  scriptFlags: {},
  completedScriptIds: [],
}

const quest100: RealityQuest = {
  id: 'fantasy-traveler-series-100-coins',
  title: 'Fantasy Traveler 系列累计获得 100 币',
  provider: 'bilibili-season',
  metric: 'coin',
  sourceRef: 'BV1dzEx6jERS',
  threshold: 100,
  rewardEquipmentDefId: 'money_dart',
  status: 'active',
  evidence: [],
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z',
}

const quest1000: RealityQuest = {
  ...quest100,
  id: 'fantasy-traveler-series-1000-coins',
  title: 'Fantasy Traveler 系列累计获得 1000 币',
  threshold: 1000,
  rewardEquipmentDefId: 'lucky_coin',
}

function evidence(value: number, observedAt = '2026-06-13T01:00:00.000Z'): RealityEvidence {
  return {
    provider: 'bilibili-season',
    metric: 'coin',
    sourceRef: 'BV1dzEx6jERS',
    value,
    sourceUrl: 'https://www.bilibili.com/video/BV1dzEx6jERS',
    observedAt,
  }
}

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  await gameStateRepo.put(gameState)
  await realityQuestsRepo.put(quest100)
  await realityQuestsRepo.put(quest1000)
})

describe('reality quest settlement', () => {
  it('records below-threshold evidence without granting the reward', async () => {
    const result = await realityQuestsRepo.recordEvidenceAndSettle(quest100.id, evidence(99))

    expect(result.granted).toBe(false)
    expect(result.quest.status).toBe('active')
    expect(result.quest.evidence).toHaveLength(1)
    expect((await gameStateRepo.get())!.ownedEquipment).toHaveLength(0)
  })

  it('grants the 100-coin reward exactly once after the threshold is reached', async () => {
    const first = await realityQuestsRepo.recordEvidenceAndSettle(quest100.id, evidence(100))
    const second = await realityQuestsRepo.recordEvidenceAndSettle(
      quest100.id,
      evidence(130, '2026-06-13T02:00:00.000Z'),
    )

    expect(first.granted).toBe(true)
    expect(first.quest.status).toBe('settled')
    expect(second.granted).toBe(false)
    expect(second.quest.evidence).toHaveLength(2)
    const rewards = (await gameStateRepo.get())!.ownedEquipment.filter((item) => item.defId === 'money_dart')
    expect(rewards).toHaveLength(1)
  })

  it('directly grants both independent rewards when cumulative evidence reaches 1000', async () => {
    await realityQuestsRepo.recordEvidenceAndSettle(quest100.id, evidence(1200))
    await realityQuestsRepo.recordEvidenceAndSettle(quest1000.id, evidence(1200))

    const owned = (await gameStateRepo.get())!.ownedEquipment
    expect(owned.filter((item) => item.defId === 'money_dart')).toHaveLength(1)
    expect(owned.filter((item) => item.defId === 'lucky_coin')).toHaveLength(1)
  })
})
