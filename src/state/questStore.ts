import { create } from 'zustand'
import { gameStateRepo, questsRepo } from '../data/repositories'
import type { Character, WorldId } from '../domain/types'
import { monsterFromEncounter } from '../game/combat'
import { buildAndGenerateQuest } from '../game/storylineService'
import { WORLD_DEFS } from '../world/worlds'
import { selectPlayer, useGame } from './gameStore'
import { useSettings } from './settingsStore'
import { useTodos } from './todoStore'

interface QuestStore {
  status: 'idle' | 'generating' | 'error'
  error: string | null
  usedFallback: boolean
  startQuest: (worldId: WorldId) => Promise<void>
}

export const useQuest = create<QuestStore>((set) => ({
  status: 'idle',
  error: null,
  usedFallback: false,

  async startQuest(worldId) {
    const world = WORLD_DEFS[worldId]
    if (!world) return
    const game = useGame.getState()
    const gs = game.gameState
    const player = selectPlayer(game)
    if (!gs || !player) return

    set({ status: 'generating', error: null, usedFallback: false })
    try {
      const partyCompanions = gs.partyIds
        .map((id) => game.characters.find((c) => c.id === id))
        .filter((c): c is Character => c != null && c.kind === 'companion')

      const { quest, usedFallback } = await buildAndGenerateQuest({
        world,
        gameState: gs,
        player,
        partyCompanions,
        affinities: game.affinities,
        todos: useTodos.getState().todos,
        settings: useSettings.getState().settings,
        now: new Date(),
        newId: () => crypto.randomUUID(),
      })

      const openHigh = useTodos.getState().todos.filter((t) => t.status === 'open' && t.priority === 'high').length
      const monster = monsterFromEncounter(quest.encounters[0], gs.storyStage, openHigh, () => crypto.randomUUID())

      await questsRepo.put(quest)
      await gameStateRepo.put({
        ...gs,
        activeWorldId: worldId,
        activeQuestId: quest.id,
        encounterIndex: 0,
        monster,
        defeatedMonsterId: undefined,
      })
      await useGame.getState().hydrate()
      set({ status: 'idle', usedFallback })
    } catch (err) {
      set({ status: 'error', error: (err as Error)?.message ?? '生成失败' })
    }
  },
}))
