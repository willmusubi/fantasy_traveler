// AI storyline generation (§22). Mirrors client.ts: tool-use forced output,
// cache_control world-lore prefix, timeout, classify(). coerceQuest is the trust
// boundary — the model can never grant rewards that don't exist in this world.

import Anthropic from '@anthropic-ai/sdk'
import { CHAT_TIMEOUT_MS, DEFAULT_MODEL } from '../domain/config'
import type { Quest, QuestBlueprint, WorldId } from '../domain/types'
import { getWorldEquipment } from '../world/equipment'
import type { WorldDef } from '../world/worlds'
import { AIError, classify } from './client'
import { buildStorylineSystemPrompt, GENERATE_QUEST_TOOL } from './prompts'

export interface StorylineRequest {
  apiKey: string
  model?: string
  worldLore: string // cacheable prefix
  playerContext: string
  rosterContext: string
  rewardPool: string // text listing the allowed equipment + unlockable companions
  world: WorldDef
  unlockedCompanionIds: string[]
}

function clamp(n: unknown, lo: number, hi: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return Math.round(((lo + hi) / 2) * 10) / 10
  return Math.min(hi, Math.max(lo, x))
}

function str(v: unknown, fallback: string, max: number): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return (s || fallback).slice(0, max)
}

/** Pure trust boundary: validate/clamp a raw model payload into a QuestBlueprint. */
export function coerceQuest(
  raw: unknown,
  world: WorldDef,
  unlockedCompanionIds: string[],
): QuestBlueprint {
  const r = (raw ?? {}) as Record<string, unknown>
  const byName = new Map(world.antagonists.map((a) => [a.displayName, a.id]))
  const defaultEnemy = world.antagonists[0]?.displayName ?? '神秘对手'
  const rawEnc = Array.isArray(r.encounters) ? r.encounters : []
  const encounters = rawEnc.slice(0, 4).map((raw) => {
    const e = (raw ?? {}) as Record<string, unknown>
    const enemyName = str(e.enemyName, defaultEnemy, 40)
    // NOTE: multi-enemy `adds` are NOT parsed here in V1 — AI-generated encounters stay single-enemy.
    // (Future: parse + clamp e.adds with the same byName/clamp helpers to allow generated teams.)
    return {
      enemyName,
      enemyTheme: str(e.enemyTheme, '', 80),
      antagonistId: byName.get(enemyName), // link to canon when the name matches the roster
      hpScale: clamp(e.hpScale, 0.8, 1.6),
      defScale: clamp(e.defScale, 0.8, 1.4),
      narrationIntro: str(e.narrationIntro, '行动开始了。', 240),
      narrationVictory: str(e.narrationVictory, '行动成功！', 240),
    }
  })
  if (encounters.length < 2) throw new AIError('parse', '生成的遭遇数量不足')

  const worldEquip = getWorldEquipment(world.id)
  const rr = (r.reward ?? {}) as Record<string, unknown>
  const equipmentDefIds = (Array.isArray(rr.equipmentDefIds) ? rr.equipmentDefIds : [])
    .map(String)
    .filter((id) => worldEquip[id]) // drop hallucinated / wrong-world items
  const unlocked = new Set(unlockedCompanionIds)
  const unlockCompanionIds = (Array.isArray(rr.unlockCompanionIds) ? rr.unlockCompanionIds : [])
    .map(String)
    .filter((id) => world.nativeCompanionIds.includes(id) && !unlocked.has(id)) // world natives, not-yet-owned
  const playerXp = Number.isFinite(Number(rr.playerXp)) ? Number(rr.playerXp) : undefined

  return {
    title: str(r.title, '未命名行动', 60),
    lore: str(r.lore, '一段新的冒险开始了。', 400),
    encounters,
    reward: { equipmentDefIds, unlockCompanionIds, playerXp },
  }
}

/** Assign runtime fields to a blueprint → a persistable Quest. Pure. */
export function materializeQuest(
  bp: QuestBlueprint,
  worldId: WorldId,
  now: Date,
  newId: () => string,
  model: string,
): Quest {
  return {
    id: newId(),
    worldId,
    title: bp.title,
    lore: bp.lore,
    encounters: bp.encounters.map((e, index) => ({ index, ...e })),
    reward: bp.reward,
    status: 'active',
    generatedAt: now.toISOString(),
    generatedByModel: model,
    schemaVersion: 1,
  }
}

export async function generateStoryline(req: StorylineRequest): Promise<QuestBlueprint> {
  if (!req.apiKey) throw new AIError('no-key', '尚未设置 API Key')
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  try {
    const res = await client.messages.create(
      {
        model: req.model || DEFAULT_MODEL,
        max_tokens: 1400,
        system: [
          { type: 'text', text: req.worldLore, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: buildStorylineSystemPrompt() },
          {
            type: 'text',
            text: `【可用奖励池】\n${req.rewardPool}\n\n【旅人现状】\n${req.playerContext}\n\n【当前同伴】\n${req.rosterContext}`,
          },
        ],
        tools: [GENERATE_QUEST_TOOL],
        tool_choice: { type: 'tool', name: 'generate_quest' },
        messages: [{ role: 'user', content: '请基于以上信息，生成下一段剧情副本。' }],
      },
      { signal: controller.signal },
    )
    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new AIError('parse', '未能解析副本生成结果')
    return coerceQuest(toolUse.input, req.world, req.unlockedCompanionIds)
  } catch (err) {
    throw classify(err)
  } finally {
    clearTimeout(timer)
  }
}
