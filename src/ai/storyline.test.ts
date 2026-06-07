import { describe, expect, it } from 'vitest'
import { WORLD_DEFS } from '../world/worlds'
import { coerceQuest, materializeQuest } from './storyline'

const world = WORLD_DEFS.stargazers
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
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: ['starlit_blade', 'EXCALIBUR_9000'], unlockCompanionIds: [] } },
      world, [],
    )
    expect(bp.reward.equipmentDefIds).toEqual(['starlit_blade'])
  })

  it('drops equipment scoped to a different world (world-scoped reward pool)', () => {
    const otherWorld = { ...world, id: 'three_kingdoms' } // starlit_blade is stargazers-only
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: ['starlit_blade', 'practice_dagger'], unlockCompanionIds: [] } },
      otherWorld, [],
    )
    expect(bp.reward.equipmentDefIds).toEqual(['practice_dagger']) // agnostic kept, wrong-world dropped
  })

  it('links an encounter to a canon antagonist when the name matches the roster', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc({ enemyName: '惰怠之偶' }), enc()], reward: {} },
      world, [],
    )
    expect(bp.encounters[0].antagonistId).toBe('sloth_idol')
  })

  it('only unlocks world natives that are not already unlocked', () => {
    const bp = coerceQuest(
      { title: 't', lore: 'l', encounters: [enc(), enc()], reward: { equipmentDefIds: [], unlockCompanionIds: ['vela', 'mira', 'outsider', 'nova'] } },
      world, ['mira'],
    )
    // mira already unlocked → dropped; outsider not native → dropped; vela + nova kept
    expect([...bp.reward.unlockCompanionIds].sort()).toEqual(['nova', 'vela'])
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
    const q = materializeQuest(bp, 'stargazers', new Date(2026, 4, 29), () => `id-${n++}`, 'claude-sonnet-4-6')
    expect(q.id).toBe('id-0')
    expect(q.status).toBe('active')
    expect(q.encounters.map((e) => e.index)).toEqual([0, 1, 2])
    expect(q.schemaVersion).toBe(1)
  })
})
