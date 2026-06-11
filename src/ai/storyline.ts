// AI storyline generation (§22). Mirrors client.ts: tool-use forced output,
// cache_control world-lore prefix, timeout, classify(). coerceQuest is the trust
// boundary — the model can never grant rewards that don't exist in this world.

// The Anthropic SDK is dynamically imported inside generateStoryline (below) so it stays out of
// the eager main chunk; mirrors ai/client.ts. No top-level import → no SDK in first paint.
import { CHAT_TIMEOUT_MS, DEFAULT_MODEL } from '../domain/config'
import type { BossPhase, Element, EnemyArchetype, EnemyMove, PhysKind, Quest, QuestBlueprint, StatusKind, WorldId } from '../domain/types'
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
  /** §23: rendered persistent story flags (already-decided facts), appended to the dynamic block so
   *  improvised quests respect the player's branch choices. Optional — '' / undefined when no flags. */
  scriptFacts?: string
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

const STATUS_KINDS = new Set<StatusKind>([
  'poison', 'burn', 'regen', 'sleep', 'paralysis', 'silence', 'slow', 'guard',
])
const MOVE_KINDS = new Set(['attack', 'heavy'])

/** Coerce authored/AI phases array into a validated BossPhase[] (≤3 phases).
 *  Returns undefined when no valid phases can be produced. */
function coercePhases(raw: unknown): BossPhase[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const phases: BossPhase[] = []
  for (const entry of raw) {
    if (phases.length >= 3) break
    const e = (entry ?? {}) as Record<string, unknown>
    // triggerHpPct must be a finite number in (0,1); clamp to [0.05, 0.95]
    const trigRaw = Number(e.triggerHpPct)
    if (!Number.isFinite(trigRaw)) continue // drop non-numeric
    const triggerHpPct = Math.min(0.95, Math.max(0.05, trigRaw))
    // atkBoost clamp [0, 50]
    const atkBoost = e.atkBoost !== undefined ? clamp(e.atkBoost, 0, 50) : undefined
    // phaseLabel / narration as short strings
    const phaseLabel = e.phaseLabel !== undefined ? str(e.phaseLabel, '', 12) || undefined : undefined
    const narration = e.narration !== undefined ? str(e.narration, '', 200) || undefined : undefined
    // newPattern: validate each move (kind + mult + telegraph)
    let newPattern: EnemyMove[] | undefined
    if (Array.isArray(e.newPattern) && e.newPattern.length > 0) {
      const moves: EnemyMove[] = []
      for (const m of e.newPattern as unknown[]) {
        const mv = (m ?? {}) as Record<string, unknown>
        if (!MOVE_KINDS.has(mv.kind as string)) continue
        const kind = mv.kind as 'attack' | 'heavy'
        const mult = mv.mult !== undefined ? clamp(mv.mult, 0.5, 2.5) : undefined
        const telegraph =
          mv.telegraph !== undefined
            ? str(mv.telegraph, '', 12) || undefined
            : undefined
        moves.push({ kind, ...(mult !== undefined ? { mult } : {}), ...(telegraph ? { telegraph } : {}) })
      }
      if (moves.length > 0) newPattern = moves
    }
    // inflicts: validate StatusEffectSpec
    let inflicts: BossPhase['inflicts'] | undefined
    if (e.inflicts && typeof e.inflicts === 'object') {
      const inf = e.inflicts as Record<string, unknown>
      if (typeof inf.kind === 'string' && STATUS_KINDS.has(inf.kind as StatusKind)) {
        inflicts = {
          kind: inf.kind as StatusKind,
          rounds: clamp(inf.rounds ?? 1, 1, 5),
          ...(inf.magnitude !== undefined ? { magnitude: Number(inf.magnitude) } : {}),
          ...(inf.chance !== undefined ? { chance: clamp(inf.chance, 0, 1) } : {}),
        }
      }
    }
    phases.push({
      triggerHpPct,
      ...(atkBoost !== undefined ? { atkBoost } : {}),
      ...(newPattern ? { newPattern } : {}),
      ...(inflicts ? { inflicts } : {}),
      ...(phaseLabel ? { phaseLabel } : {}),
      ...(narration ? { narration } : {}),
    })
  }
  if (phases.length === 0) return undefined
  // Sort descending by triggerHpPct (highest threshold fires first)
  phases.sort((a, b) => b.triggerHpPct - a.triggerHpPct)
  return phases
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
  const byId = new Map(world.antagonists.map((a) => [a.id, a]))
  const ELEMENTS = new Set(['metal', 'wood', 'water', 'fire', 'earth'])
  const PHYS = new Set(['slash', 'pierce', 'strike', 'arcane'])
  const ARCH = new Set(['mook', 'elite', 'boss'])
  const rawEnc = Array.isArray(r.encounters) ? r.encounters : []
  const total = Math.min(rawEnc.length, 4)
  const encounters = rawEnc.slice(0, 4).map((raw, i) => {
    const e = (raw ?? {}) as Record<string, unknown>
    const enemyName = str(e.enemyName, defaultEnemy, 40)
    const antagonistId = byName.get(enemyName) // link to canon when the name matches the roster
    const canon = antagonistId ? byId.get(antagonistId) : undefined
    // §25 combat identity — precedence: canon antagonist > model assignment > spawn-time hash.
    const mElement = typeof e.element === 'string' && ELEMENTS.has(e.element) ? (e.element as Element) : undefined
    const mWeak = Array.isArray(e.physWeak)
      ? (e.physWeak.map(String).filter((k) => PHYS.has(k)).slice(0, 2) as PhysKind[])
      : undefined
    const mArch = typeof e.archetype === 'string' && ARCH.has(e.archetype) ? (e.archetype as EnemyArchetype) : undefined
    // NOTE: multi-enemy `adds` are NOT parsed here in V1 — AI-generated encounters stay single-enemy.
    // (Future: parse + clamp e.adds with the same byName/clamp helpers to allow generated teams.)
    return {
      enemyName,
      enemyTheme: str(e.enemyTheme, '', 80),
      antagonistId,
      hpScale: clamp(e.hpScale, 0.8, 1.6),
      defScale: clamp(e.defScale, 0.8, 1.4),
      narrationIntro: str(e.narrationIntro, '行动开始了。', 240),
      narrationVictory: str(e.narrationVictory, '行动成功！', 240),
      element: canon?.element ?? mElement,
      physWeak: canon?.physWeak ?? (mWeak && mWeak.length > 0 ? mWeak : undefined),
      physResist: canon?.physResist,
      // Default ladder: the FINAL encounter of a quest is the boss; earlier ones elites.
      archetype: canon?.archetype ?? mArch ?? (i === total - 1 ? 'boss' : 'elite'),
      // §26 — pass through authored phases (trust boundary: clamp + validate)
      phases: coercePhases(e.phases),
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
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
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
            text:
              `【可用奖励池】\n${req.rewardPool}\n\n【旅人现状】\n${req.playerContext}\n\n【当前同伴】\n${req.rosterContext}` +
              (req.scriptFacts ? `\n\n${req.scriptFacts}` : ''),
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
