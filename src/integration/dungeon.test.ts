// §23 副本 end-to-end against a real (faked) IndexedDB: a campaign run through the FULL pipeline
// finishes cleanly (NO endless-loop — the "repeats one task forever" fix), and saved 副本 round-trip
// + replay reset their progress/flags. Test mode disables the local content pack, so scripts are
// injected via registerRuntimeScript (the same seam saved 副本 use after a reload).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { materializeQuest } from '../ai/storyline'
import { closeDb } from '../data/db'
import { dungeonsRepo, gameStateRepo, questsRepo } from '../data/repositories'
import type { DungeonRecord, Monster, ScriptChapter, ScriptDef } from '../domain/types'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useTodos } from '../state/todoStore'
import { registerRuntimeScript } from '../world/worlds'

function chapter(id: string, next: ScriptChapter['next']): ScriptChapter {
  return {
    id, title: id, lore: '',
    encounters: [{ enemyName: id.toUpperCase(), enemyTheme: '', hpScale: 1, defScale: 1, narrationIntro: '', narrationVictory: `${id} done` }],
    reward: { equipmentDefIds: [], unlockCompanionIds: [], playerXp: 0 },
    next,
  }
}
function oneChapterScript(id: string): ScriptDef {
  return { id, worldId: 'stargazers', title: `T-${id}`, synopsis: '一段测试战役', startChapterId: 'ch1', chapters: { ch1: chapter('ch1', null) } }
}
const weakBoss = (): Monster => ({ id: 'boss', nameKey: 'monster.procrastination', displayName: 'BOSS', level: 1, maxHp: 400, hp: 1, atk: 14, def: 10, spd: 9, growth: 1 })

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, toasts: [], activeQuest: null, recruitedId: null, ready: false, pendingScriptChoice: null, scriptCompletion: null })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useQuest.setState({ status: 'idle', error: null, usedFallback: false })
})

describe('§23 副本 end-to-end', () => {
  it('a campaign finishes through the real pipeline with NO endless respawn (bug fix)', async () => {
    await useGame.getState().seedNewGame('旅人')
    const script = oneChapterScript('s-fin')
    registerRuntimeScript(script)

    // Put the campaign at chapter ch1 with a 1-HP boss so one task completion clears it.
    const gs0 = useGame.getState().gameState!
    const quest = materializeQuest(script.chapters.ch1, 'stargazers', new Date(), () => 'qf', '')
    await questsRepo.put(quest)
    await gameStateRepo.put({ ...gs0, activeWorldId: 'stargazers', activeScriptId: 's-fin', currentChapterId: 'ch1', activeQuestId: 'qf', encounterIndex: 0, scriptFlags: {}, enemies: [weakBoss()], clearedEncounterKey: undefined })
    await useGame.getState().hydrate()

    await useTodos.getState().add({ title: '收尾任务', priority: 'high' })
    await useTodos.getState().complete(useTodos.getState().todos[0].id)

    const g = useGame.getState()
    expect(g.gameState!.activeScriptId).toBeUndefined() // campaign ended
    expect(g.gameState!.activeQuestId).toBeUndefined()
    expect(g.gameState!.currentChapterId).toBeUndefined()
    expect(g.gameState!.enemies).toHaveLength(0) // the fix: NO spawnMonster loop
    expect(g.scriptCompletion?.scriptId).toBe('s-fin') // finale prompt is armed
  })

  it('saves the active campaign as a 副本, then replays it from the start (progress + flags reset)', async () => {
    await useGame.getState().seedNewGame('旅人')
    const script = oneChapterScript('s-rep')
    registerRuntimeScript(script)

    // Mid-campaign with a decision already made.
    const gs0 = useGame.getState().gameState!
    await gameStateRepo.put({ ...gs0, activeWorldId: 'stargazers', activeScriptId: 's-rep', currentChapterId: 'ch1', scriptFlags: { rebecca: 'rescued' } })
    await useGame.getState().hydrate()

    // Save → round-trips through the dungeons store with the ending flags.
    await useGame.getState().saveActiveAsDungeon('我的副本')
    const saved: DungeonRecord[] = await dungeonsRepo.all()
    expect(saved).toHaveLength(1)
    expect(saved[0].label).toBe('我的副本')
    expect(saved[0].script.id).toBe('s-rep')
    expect(saved[0].completedFlags).toEqual({ rebecca: 'rescued' })

    // Replay resets progress to the start chapter with empty flags + a freshly materialized quest.
    await useGame.getState().enterDungeon(saved[0].id)
    const g = useGame.getState()
    expect(g.gameState!.activeScriptId).toBe('s-rep')
    expect(g.gameState!.currentChapterId).toBe('ch1')
    expect(g.gameState!.scriptFlags).toEqual({}) // fresh replay
    expect(g.gameState!.activeQuestId).toBeTruthy()
    expect(g.gameState!.enemies.length).toBeGreaterThan(0) // first encounter spawned
  })
})
