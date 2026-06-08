// The interactive (FF-style) step-through must resolve a round IDENTICALLY to the synchronous
// whole-round path — same final state, affinities and character stats — for any seed. This parity
// is what lets the synchronous reducer (and every test that drives it) stay the source of truth
// while the new RoundBegan/RoundAdvanced path drives the UI. Pure reducer; no store/IDB.

import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import { TODO_XP } from '../domain/config'
import type { Affinity, Character, GameState, Monster, SkillId, Todo } from '../domain/types'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const NOW = new Date(2026, 4, 29, 12, 0, 0)
const TODAY = '2026-05-29'

function char(classId: Character['classId'], kind: Character['kind'], id: string, skills: SkillId[] = [], level = 1): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills, portraitSet: 'x', createdAt: TODAY }
}
const PLAYER = char('vanguard', 'player', 'player')
const MIRA = char('striker', 'companion', 'mira', ['liuguang', 'xingchen', 'juxing', 'liuxing'], 6)
const PARTY = [PLAYER, MIRA]

function makeMonster(over: Partial<Monster> = {}): Monster {
  return { id: 'm1', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1, ...over }
}

function makeInput(gsOver: Partial<GameState> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: ['player', 'mira'], enemies: [makeMonster()], storyStage: 0, buffs: [], moodFlags: {},
    lastResolvedAt: '', encounterIndex: 0, unlockedCompanionIds: ['mira'], ownedEquipment: [],
    resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, ...gsOver,
  }
  const affinities: Record<string, Affinity> = { mira: freshAffinity('mira', TODAY) }
  return { gameState, affinities, party: PARTY, now: NOW, newId: () => 'm-next', openHighCount: 0 }
}

const todo = (priority: Todo['priority']): Todo => ({ id: 't1', title: 't', priority, status: 'done', tags: [], createdAt: TODAY })

/** Drive the interactive path (RoundBegan then auto RoundAdvanced) to its finalizing dispatch,
 *  threading state + affinities between dispatches exactly as the pipeline would. */
function runInteractive(input: ReducerInput, t: Todo) {
  let state = input.gameState
  let aff = input.affinities
  let r = gameReducer({ ...input, gameState: state, affinities: aff }, { type: 'RoundBegan', todo: t })
  state = r.gameState
  aff = r.affinities
  let guard = 0
  while (state.activeRound && guard++ < 50) {
    r = gameReducer({ ...input, gameState: state, affinities: aff }, { type: 'RoundAdvanced', auto: true })
    state = r.gameState
    aff = r.affinities
  }
  return { gameState: state, affinities: aff, characterStats: r.characterStats }
}

function assertParity(gsOver: Partial<GameState>, priority: Todo['priority']) {
  const sync = gameReducer(makeInput(gsOver), { type: 'TodoCompleted', todo: todo(priority) })
  const step = runInteractive(makeInput(gsOver), todo(priority))
  expect(step.gameState).toEqual(sync.gameState) // toEqual ignores activeRound: undefined vs absent
  expect(step.affinities).toEqual(sync.affinities)
  expect(step.characterStats).toEqual(sync.characterStats)
}

describe('interactive round parity with the synchronous path', () => {
  it('matches for a plain round (high / low priority)', () => {
    assertParity({}, 'high')
    assertParity({}, 'low')
  })
  it('matches when a fast member laps (carried charge)', () => {
    assertParity({ charge: { mira: 50 } }, 'high')
  })
  it('matches when the enemy is near-ready and acts early', () => {
    assertParity({ charge: { m1: 95 } }, 'high')
  })
  it('matches when a planned attack skill fires', () => {
    assertParity({ roundPlan: { mira: 'liuguang' } }, 'high')
  })
  it('matches when a planned buff skill fires mid-round (ctx/mult stay frozen)', () => {
    assertParity({ roundPlan: { mira: 'juxing' } }, 'high')
  })
  it('matches on a victory + respawn', () => {
    assertParity({ enemies: [makeMonster({ hp: 50 })] }, 'high')
  })
  it('matches with an active atk buff (mult + decay)', () => {
    assertParity({ partyBuffs: [{ id: 'b', kind: 'atkPct', magnitude: 0.2, turnsLeft: 2 }] }, 'high')
  })
})

describe('interactive choice + once-only rewards', () => {
  it('an explicit choice overrides roundPlan; "basic" forces a basic attack', () => {
    // No plan → choosing liuguang explicitly still casts it.
    const inA = makeInput({ roundPlan: {} })
    const a0 = gameReducer(inA, { type: 'RoundBegan', todo: todo('high') })
    expect(a0.gameState.activeRound!.order[a0.gameState.activeRound!.index].id).toBe('mira') // striker acts first
    const a1 = gameReducer({ ...inA, gameState: a0.gameState, affinities: a0.affinities }, { type: 'RoundAdvanced', choice: 'liuguang' })
    expect(a1.effects.some((e) => e.type === 'skillCast' && e.skillId === 'liuguang')).toBe(true)

    // Plan says liuguang → choosing 'basic' forces a basic attack (no skillCast).
    const inB = makeInput({ roundPlan: { mira: 'liuguang' } })
    const b0 = gameReducer(inB, { type: 'RoundBegan', todo: todo('high') })
    const b1 = gameReducer({ ...inB, gameState: b0.gameState, affinities: b0.affinities }, { type: 'RoundAdvanced', choice: 'basic' })
    expect(b1.effects.some((e) => e.type === 'skillCast')).toBe(false)
    expect(b1.effects.some((e) => e.type === 'damage')).toBe(true)
  })

  it('per-task rewards fire exactly once across the whole stepped round', () => {
    const step = runInteractive(makeInput(), todo('high'))
    expect(step.characterStats.player.xp).toBe(TODO_XP.high) // one chip, not ×turns
    expect(step.affinities.mira.points).toBe(5) // one completion's affinity
  })
})
