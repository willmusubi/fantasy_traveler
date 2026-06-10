// §25 mechanics: enemy move rotations + telegraphs, boss heavy cap, wipe pattern reset,
// true miss / crit flags, weakness multipliers through the live reducer.

import { describe, expect, it } from 'vitest'
import { ARCHETYPE_PATTERNS } from '../domain/config'
import type { Affinity, Character, GameState, Monster, Todo } from '../domain/types'
import type { DomainEvent } from './events'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const TODAY = '2026-06-10'
const NOW = new Date('2026-06-10T12:00:00')

function char(classId: Character['classId'], kind: Character['kind'], id: string): Character {
  return {
    id, name: id, kind, classId, worldId: 'stargazers',
    stats: statsForClassAtLevel(classId, 1), skills: [], portraitSet: 'x', createdAt: TODAY,
  }
}

function makeMonster(over: Partial<Monster> = {}): Monster {
  return {
    id: 'm1', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400,
    atk: 14, def: 10, spd: 9, growth: 1, ...over,
  }
}

function freshAffinity(id: string): Affinity {
  return { characterId: id, points: 0, rank: 'C', unlockedSupports: [], dailyGained: 0, dailyGainedOn: TODAY }
}

function makeInput(party: Character[], over: Partial<GameState> = {}, roll?: () => number): ReducerInput {
  const gameState: GameState = {
    partyIds: party.map((c) => c.id),
    enemies: [makeMonster()],
    storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '', encounterIndex: 0,
    scriptFlags: {}, completedScriptIds: [],
    unlockedCompanionIds: party.filter((c) => c.kind === 'companion').map((c) => c.id),
    ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {},
    ...over,
  } as GameState
  const affinities = Object.fromEntries(
    party.filter((c) => c.kind === 'companion').map((c) => [c.id, freshAffinity(c.id)]),
  )
  return { gameState, affinities, party, now: NOW, newId: () => 'next-id', openHighCount: 0, roll }
}

const PLAYER = char('vanguard', 'player', 'player')
const todo = (priority: Todo['priority']): DomainEvent => ({
  type: 'TodoCompleted',
  todo: { id: 't', title: 't', priority, status: 'done', tags: [], createdAt: TODAY },
})

describe('§25 enemy move rotation (no MP)', () => {
  it('advances patternIdx each enemy turn and wraps around', () => {
    const boss = makeMonster({
      archetype: 'boss', pattern: ARCHETYPE_PATTERNS.boss.map((m) => ({ ...m })), patternIdx: 0,
    })
    const r = gameReducer(makeInput([PLAYER], { enemies: [boss], charge: { m1: 95 } }), todo('low'))
    expect(r.gameState.enemies[0].patternIdx).toBe(1) // attack consumed → next slot (spd 9: no lap)
  })

  it('telegraphs the boss wind-up the round BEFORE it lands', () => {
    // patternIdx 2 = the attack right before the ×2.0 telegraphed heavy → after acting,
    // nextMove.telegraph fires the HUD warning effect.
    const boss = makeMonster({
      archetype: 'boss', pattern: ARCHETYPE_PATTERNS.boss.map((m) => ({ ...m })), patternIdx: 2,
    })
    const r = gameReducer(makeInput([PLAYER], { enemies: [boss], charge: { m1: 95 } }), todo('low'))
    const tg = r.effects.find((e) => e.type === 'enemyTelegraph')
    expect(tg).toMatchObject({ enemyId: 'm1', text: '蓄力' })
    expect(r.gameState.enemies[0].patternIdx).toBe(3) // heavy is next
  })

  it('a boss heavy (×2.0) is capped at 60% of the current party pool', () => {
    const boss = makeMonster({
      atk: 1000, // absurd — uncapped this would one-shot
      archetype: 'boss', pattern: ARCHETYPE_PATTERNS.boss.map((m) => ({ ...m })), patternIdx: 3,
    })
    const r = gameReducer(makeInput([PLAYER], { enemies: [boss], charge: { m1: 95 } }), todo('low'))
    const hit = r.effects.find((e) => e.type === 'enemyAttack')
    expect(hit && hit.type === 'enemyAttack' ? hit.heavy : false).toBe(true)
    // traveler pool 120 → cap 72 → survives the nuke with 48.
    expect(r.gameState.resources.player.hp).toBe(120 - 72)
  })

  it('a wipe resets every enemy rotation off its heavy slot (death-spiral guard)', () => {
    const boss = makeMonster({
      atk: 80, archetype: 'boss', pattern: ARCHETYPE_PATTERNS.boss.map((m) => ({ ...m })), patternIdx: 3,
    })
    // 1-HP lone member: the heavy (capped 60% of 1 ≈ ≥1) downs them → wipe → patternIdx 0.
    const input = makeInput([PLAYER], { enemies: [boss], charge: { m1: 95 }, resources: { player: { hp: 1, mp: 0 } } })
    const r = gameReducer(input, todo('low'))
    expect(r.effects.some((e) => e.type === 'partyWiped')).toBe(true)
    expect(r.gameState.enemies[0].patternIdx).toBe(0)
  })
})

describe('§25 true miss / crit through the live round', () => {
  it('a member can MISS (amount-0 damage effect, enemy untouched by that swing)', () => {
    // roll 0.99 every time → every hit roll fails (rate ≤ 98.8%? traveler hit 12 vs eva 6 → 95.2%).
    const r = gameReducer(makeInput([PLAYER], { enemies: [makeMonster({ eva: 6 })] }, () => 0.97), todo('low'))
    const miss = r.effects.find((e) => e.type === 'damage')
    expect(miss && miss.type === 'damage' ? miss.missed : false).toBe(true)
    expect(miss && miss.type === 'damage' ? miss.amount : -1).toBe(0)
    expect(r.gameState.enemies[0].hp).toBe(400) // the swing whiffed
  })

  it('a crit lands ×1.6 and stamps the effect (会心一击)', () => {
    // roll 0 → hit lands AND crit fires (rate ≥ 5%) AND variance bottoms (×0.92).
    const r = gameReducer(makeInput([PLAYER], {}, () => 0), todo('low'))
    const dmg = r.effects.find((e) => e.type === 'damage')
    expect(dmg && dmg.type === 'damage' ? dmg.crit : false).toBe(true)
    // traveler: raw 14×1 − 5 = 9 → ×1.6 ×0.92 = 13.248 → 13
    expect(dmg && dmg.type === 'damage' ? dmg.amount : -1).toBe(13)
  })

  it('weakness tags multiply damage and stamp typeMult (效果拔群)', () => {
    // Traveler default weapon = sword (pierce 刺). Enemy weak to pierce → ×1.5.
    const weak = makeMonster({ physWeak: ['pierce'] })
    const r = gameReducer(makeInput([PLAYER], { enemies: [weak] }), todo('low'))
    const dmg = r.effects.find((e) => e.type === 'damage')
    // raw 14×1 − 5 = 9 → ×1.5 = 13.5 → 14 (mid variance)
    expect(dmg && dmg.type === 'damage' ? dmg.amount : -1).toBe(14)
    expect(dmg && dmg.type === 'damage' ? dmg.typeMult : 0).toBeCloseTo(1.5)
  })
})
