import { create } from 'zustand'
import { materializeQuest } from '../ai/storyline'
import { gameStateRepo, questsRepo } from '../data/repositories'
import type { Character, WorldId } from '../domain/types'
import { teamFromEncounter } from '../game/combat'
import { buildAndGenerateQuest } from '../game/storylineService'
import { registerRuntimeScript, scriptDefFor, WORLD_DEFS } from '../world/worlds'
import { selectPlayer, useGame } from './gameStore'
import { useSettings } from './settingsStore'
import { useTodos } from './todoStore'

interface QuestStore {
  status: 'idle' | 'generating' | 'error'
  error: string | null
  usedFallback: boolean
  startQuest: (worldId: WorldId) => Promise<void>
  /** §23: begin a branching campaign from its start chapter (authored faithful spine). */
  startScript: (worldId: WorldId, scriptId: string) => Promise<void>
}

export const useQuest = create<QuestStore>((set, get) => ({
  status: 'idle',
  error: null,
  usedFallback: false,

  async startQuest(worldId) {
    const world = WORLD_DEFS[worldId]
    if (!world) return
    // §23: a world with a default script runs the branching campaign instead of the linear spine.
    // §24: but if that campaign is already 已通过, do NOT silently relaunch it — replay must be
    // explicit (ScriptCompleteModal 重新开始, DungeonPanel 重玩, or the QuestBoard/HUD 重新开始 button,
    // all of which call startScript directly). A still-unfinished default script auto-starts as before.
    const completed = useGame.getState().gameState?.completedScriptIds ?? []
    if (world.defaultScriptId && !completed.includes(world.defaultScriptId)) {
      return get().startScript(worldId, world.defaultScriptId)
    }
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
      const enemies = teamFromEncounter(quest.encounters[0], gs.storyStage, openHigh, () => crypto.randomUUID())

      await questsRepo.put(quest)
      await gameStateRepo.put({
        ...gs,
        activeWorldId: worldId,
        activeQuestId: quest.id,
        encounterIndex: 0,
        enemies,
        clearedEncounterKey: undefined,
      })
      await useGame.getState().hydrate()
      set({ status: 'idle', usedFallback })
    } catch (err) {
      set({ status: 'error', error: (err as Error)?.message ?? '生成失败' })
    }
  },

  async startScript(worldId, scriptId) {
    const world = WORLD_DEFS[worldId]
    const script = scriptDefFor(scriptId)
    const gs = useGame.getState().gameState
    if (!world || !script || !gs) return
    const startCh = script.chapters[script.startChapterId]
    if (!startCh) return

    set({ status: 'generating', error: null, usedFallback: false })
    try {
      registerRuntimeScript(script) // resolvable by the pipeline even if not in the static pack
      const model = useSettings.getState().settings.model
      const quest = materializeQuest(startCh, script.worldId, new Date(), () => crypto.randomUUID(), model)
      const openHigh = useTodos.getState().todos.filter((td) => td.status === 'open' && td.priority === 'high').length
      const enemies = teamFromEncounter(quest.encounters[0], gs.storyStage, openHigh, () => crypto.randomUUID())
      await questsRepo.put(quest)
      await gameStateRepo.put({
        ...gs,
        activeWorldId: worldId,
        activeScriptId: script.id,
        currentChapterId: script.startChapterId,
        activeQuestId: quest.id,
        encounterIndex: 0,
        scriptFlags: {}, // a fresh campaign — no decisions made yet
        enemies,
        clearedEncounterKey: undefined,
      })
      await useGame.getState().hydrate()
      set({ status: 'idle', usedFallback: false })
    } catch (err) {
      set({ status: 'error', error: (err as Error)?.message ?? '生成失败' })
    }
  },
}))
