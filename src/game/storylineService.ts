// Impure orchestrator for starting a story 副本 (§22). HYBRID: the authored canon
// chapter is the faithful spine (offline + progression-safe). When a key is present,
// the AI riffs WITHIN canon (real antagonist roster + world reward pool + empowering
// tone), but the recruit/unlock stays anchored to the authored chapter so the story
// progression is reliable. Pure of stores/IO except the LLM call.

import { rankForPoints } from '../companion/affinity'
import { COMPANION_DEFS } from '../companion/roster'
import { buildContext, renderContextZh } from '../ai/contextBuilder'
import { AIError } from '../ai/client'
import { generateStoryline, materializeQuest } from '../ai/storyline'
import type { Affinity, Character, GameState, Quest, QuestBlueprint, ScriptDef, Settings, Todo } from '../domain/types'
import { getWorldEquipment } from '../world/equipment'
import { renderScriptFacts } from '../world/scriptFacts'
import { renderWorldLore, storyChapterFor, type WorldDef } from '../world/worlds'

export interface StartQuestInput {
  world: WorldDef
  gameState: GameState
  player: Character
  partyCompanions: Character[]
  affinities: Record<string, Affinity>
  todos: Todo[]
  settings: Settings
  now: Date
  newId: () => string
  /** §23: the active branching script, if any — its flag declarations give scriptFacts their meaning. */
  script?: ScriptDef
}

function rosterContext(input: StartQuestInput): string {
  const lines = input.partyCompanions.map((c) => {
    const aff = input.affinities[c.id]
    const rank = rankForPoints(aff?.points ?? 0, (aff?.rank ?? 'none') !== 'none' || (aff?.points ?? 0) > 0)
    return `${c.name}（羁绊 ${rank}）`
  })
  return lines.join('、') || '暂无同伴'
}

function rewardPool(input: StartQuestInput, chapter: QuestBlueprint): string {
  const nextRecruits = chapter.reward.unlockCompanionIds.map((id) => `${id} = 角色「${COMPANION_DEFS[id]?.name ?? id}」`)
  const equip = Object.values(getWorldEquipment(input.world.id)).map((e) => `${e.id} = 装备「${e.nameKey}」`)
  return [
    '本次副本应解锁的角色（unlockCompanionIds 请优先填入；没有则留空数组）：',
    nextRecruits.length ? nextRecruits.join('\n') : '（本章无新角色）',
    '可获得装备（equipmentDefIds 只能从这里选）：',
    equip.join('\n'),
  ].join('\n')
}

/**
 * Build the next quest. Authored canon chapter = the spine; AI (if keyed) riffs within
 * canon but the unlock reward is forced to the authored chapter's for reliable progression.
 * Does NOT persist — the caller writes the Quest + updates GameState.
 */
export async function buildAndGenerateQuest(input: StartQuestInput): Promise<{
  quest: Quest
  usedFallback: boolean
}> {
  const chapter = storyChapterFor(input.world, input.gameState.unlockedCompanionIds)

  const lead = input.partyCompanions[0]
  const leadAff = lead ? input.affinities[lead.id] : undefined
  const playerContext = renderContextZh(
    buildContext({
      player: input.player,
      affinityRank: leadAff?.rank ?? 'none',
      todos: input.todos,
      moodFlag: 'idle',
      now: input.now,
    }),
  )

  let usedFallback = false
  let blueprint: QuestBlueprint = chapter
  try {
    const ai = await generateStoryline({
      apiKey: input.settings.apiKey ?? '',
      model: input.settings.model,
      worldLore: renderWorldLore(input.world),
      playerContext,
      rosterContext: rosterContext(input),
      rewardPool: rewardPool(input, chapter),
      world: input.world,
      unlockedCompanionIds: input.gameState.unlockedCompanionIds,
      scriptFacts: renderScriptFacts(input.gameState.scriptFlags, input.script),
    })
    // Riff within canon, but anchor the recruit to the authored chapter (reliable progression).
    blueprint = { ...ai, reward: { ...ai.reward, unlockCompanionIds: chapter.reward.unlockCompanionIds } }
  } catch (err) {
    if (err instanceof AIError) {
      usedFallback = true
      blueprint = chapter // faithful authored canon
    } else {
      throw err
    }
  }

  const quest = materializeQuest(blueprint, input.world.id, input.now, input.newId, input.settings.model)
  return { quest, usedFallback }
}
