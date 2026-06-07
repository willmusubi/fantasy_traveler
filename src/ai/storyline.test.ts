import { describe, expect, it } from 'vitest'
import { WORLD_DEFS } from '../world/worlds'
import { coerceQuest, materializeQuest } from './storyline'

const world = WORLD_DEFS.cats_eye
const enc = (over: object = {}) => ({ enemyName: 'x', hpScale: 1, defScale: 1, ...over })

describe('coerceQuest (LLM trust boundary)', () => {
  it('clamps hp/def scales into range', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc({ hpScale: 5, defScale: -1 }), enc({ hpScale: 0.1 })], reward: {} },
      world, [],
    )
    expect(bp.encounters[0].hpScale).toBe(1.6) // clamped from 5
    expect(bp.encounters[0].defScale).toBe(0.8) // clamped from -1
    expect(bp.encounters[1].hpScale).toBe(0.8) // clamped from 0.1
  })

  it('drops hallucinated equipment, keeps known ids', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: ['moonlit_dagger', 'EXCALIBUR_9000'], unlockCompanionIds: [] } },
      world, [],
    )
    expect(bp.reward.equipmentDefIds).toEqual(['moonlit_dagger'])
  })

  it('drops equipment scoped to a different world (world-scoped reward pool)', () => {
    const otherWorld = { ...world, id: 'three_kingdoms' } // moonlit_dagger is cats_eye-only
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: ['moonlit_dagger', 'practice_dagger'], unlockCompanionIds: [] } },
      otherWorld, [],
    )
    expect(bp.reward.equipmentDefIds).toEqual(['practice_dagger']) // agnostic kept, wrong-world dropped
  })

  it('links an encounter to a canon antagonist when the name matches the roster', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc({ enemyName: '卢卡·罗克萨斯' }), enc()], reward: {} },
      world, [],
    )
    expect(bp.encounters[0].antagonistId).toBe('luca_roxas')
  })

  it('only unlocks world natives that are not already unlocked', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: [], unlockCompanionIds: ['raisei_rui', 'raisei_hitomi', 'tifa', 'raisei_ai'] } },
      world, ['raisei_hitomi'],
    )
    // hitomi already unlocked → dropped; tifa not native → dropped; rui + ai kept
    expect([...bp.reward.unlockCompanionIds].sort()).toEqual(['raisei_ai', 'raisei_rui'])
  })

  it('throws when fewer than 2 encounters', () => {
    expect(() =>
      coerceQuest({ title: 't', lore: 'l', encounters: [enc()], reward: {} }, world, []),
    ).toThrow()
  })

  it('fills missing fields with safe defaults', () => {
    const bp = coerceQuest({ encounters: [{}, {}], reward: {} }, world, [])
    expect(bp.title.length).toBeGreaterThan(0)
    expect(bp.encounters[0].enemyName.length).toBeGreaterThan(0)
    expect(bp.encounters[0].hpScale).toBeGreaterThanOrEqual(0.8)
  })
})

describe('materializeQuest', () => {
  it('assigns indices, status active, and metadata', () => {
    const bp = coerceQuest({ title: '行动', lore: 'l', encounters: [enc(), enc(), enc()], reward: {} }, world, [])
    let n = 0
    const q = materializeQuest(bp, 'cats_eye', new Date(2026, 4, 29), () => `id-${n++}`, 'claude-sonnet-4-6')
    expect(q.id).toBe('id-0')
    expect(q.status).toBe('active')
    expect(q.encounters.map((e) => e.index)).toEqual([0, 1, 2])
    expect(q.schemaVersion).toBe(1)
  })
})
