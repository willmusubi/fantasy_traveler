import { create } from 'zustand'
import { realityQuestsRepo } from '../data/repositories'
import type { RealityQuest } from '../domain/types'
import { fetchBilibiliSeasonEvidence, fetchBilibiliVideoEvidence, parseBvid } from '../reality/bilibili'
import { shouldAutoVerify } from '../reality/oracle'
import { useGame } from './gameStore'

export const FANTASY_TRAVELER_MILESTONES = [
  {
    id: 'fantasy-traveler-series-100-coins',
    title: 'Fantasy Traveler 系列累计获得 100 币',
    threshold: 100,
    rewardEquipmentDefId: 'money_dart',
  },
  {
    id: 'fantasy-traveler-series-1000-coins',
    title: 'Fantasy Traveler 系列累计获得 1000 币',
    threshold: 1000,
    rewardEquipmentDefId: 'lucky_coin',
  },
] as const

interface RealityStore {
  quests: RealityQuest[]
  loaded: boolean
  checkingId: string | null
  error: string | null
  hydrate: () => Promise<void>
  saveFantasyTravelerSeries: (input: string) => Promise<void>
  verify: (id: string) => Promise<void>
  verifyDue: (now?: Date) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '现实验证失败，请稍后重试'
}

export const useReality = create<RealityStore>((set, get) => ({
  quests: [],
  loaded: false,
  checkingId: null,
  error: null,

  async hydrate() {
    const quests = await realityQuestsRepo.all()
    set({ quests, loaded: true })
  },

  async saveFantasyTravelerSeries(input) {
    try {
      const sourceRef = parseBvid(input)
      const milestoneIds = new Set<string>(FANTASY_TRAVELER_MILESTONES.map((item) => item.id))
      const existing = get().quests.filter((quest) => milestoneIds.has(quest.id))
      if (existing.some((quest) => quest.status === 'settled' && quest.sourceRef !== sourceRef)) {
        throw new Error('参赛系列已有奖励结算，合集来源不能再修改')
      }
      const now = new Date().toISOString()
      const quests: RealityQuest[] = FANTASY_TRAVELER_MILESTONES.map((milestone) => {
        const previous = existing.find((quest) => quest.id === milestone.id)
        return {
          ...milestone,
          provider: 'bilibili-season',
          metric: 'coin',
          sourceRef,
          status: previous?.status ?? 'active',
          evidence: previous?.sourceRef === sourceRef ? previous.evidence : [],
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          settledAt: previous?.settledAt,
        }
      })
      await Promise.all(quests.map((quest) => realityQuestsRepo.put(quest)))
      set({
        quests: [...quests, ...get().quests.filter((item) => !milestoneIds.has(item.id))],
        error: null,
      })
      await get().verify(quests[0].id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async verify(id) {
    const quest = get().quests.find((item) => item.id === id)
    if (!quest || get().checkingId) return
    set({ checkingId: quest.sourceRef, error: null })
    try {
      const evidence = quest.provider === 'bilibili-season'
        ? await fetchBilibiliSeasonEvidence(quest.sourceRef)
        : await fetchBilibiliVideoEvidence(quest.sourceRef)
      const related = get().quests.filter((item) => item.provider === quest.provider && item.sourceRef === quest.sourceRef)
      const results = []
      for (const item of related) results.push(await realityQuestsRepo.recordEvidenceAndSettle(item.id, evidence))
      const updates = new Map(results.map((result) => [result.quest.id, result.quest]))
      set({
        quests: get().quests.map((item) => updates.get(item.id) ?? item),
        checkingId: null,
        error: null,
      })
      if (results.some((result) => result.granted)) await useGame.getState().hydrate()
    } catch (error) {
      set({ checkingId: null, error: errorMessage(error) })
    }
  },

  async verifyDue(now = new Date()) {
    const dueBySource = new Map<string, RealityQuest>()
    for (const quest of get().quests.filter((item) => shouldAutoVerify(item, now))) {
      dueBySource.set(`${quest.provider}:${quest.sourceRef}`, quest)
    }
    for (const quest of dueBySource.values()) {
      await get().verify(quest.id)
    }
  },
}))
