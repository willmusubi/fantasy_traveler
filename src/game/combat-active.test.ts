// Active combat: monster attacks on its own turn, per-character HP/MP, gold, and skill casts.

import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import { GOLD_TODO, MP_REGEN_TODO } from '../domain/config'
import type { Affinity, Character, GameState, Monster, Todo } from '../domain/types'
import { defeatRewards } from './combat'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'
import type { DomainEvent } from './events'

const NOW = new Date(2026, 4, 30, 12, 0, 0)
const TODAY = '2026-05-30'

function char(classId: Character['classId'], kind: Character['kind'], id: string, level = 1): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills: roster(id), portraitSet: 'x', createdAt: TODAY }
}
function roster(id: string): string[] {
  if (id === 'hitomi') return ['jiying', 'jixi', 'yishumibao', 'wanmeishouguan']
  if (id === 'rui') return ['wuyeyugao', 'yemuxiezou', 'qiyezhiyue', 'maoyancangpin']
  if (id === 'ai') return ['zhiliaowurenji', 'yingjiyuanzhu', 'shentoupzhunbei', 'wanmeiyuan']
  return []
}

function makeMonster(over: Partial<Monster> = {}): Monster {
  return { id: 'm1', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1, ...over }
}

function makeInput(party: Character[], gsOver: Partial<GameState> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: party.map((c) => c.id),
    monster: makeMonster(),
    storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '',
    encounterIndex: 0, unlockedCompanionIds: party.filter((c) => c.kind === 'companion').map((c) => c.id),
    ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {},
    ...gsOver,
  }
  const affinities: Record<string, Affinity> = {}
  for (const c of party) if (c.kind === 'companion') affinities[c.id] = freshAffinity(c.id, TODAY)
  return { gameState, affinities, party, now: NOW, newId: () => 'm-next', openHighCount: 0 }
}

const PLAYER = char('vanguard', 'player', 'player')
const HITOMI = char('striker', 'companion', 'hitomi')
const todo = (priority: Todo['priority']): DomainEvent => ({ type: 'TodoCompleted', todo: { id: 't', title: 't', priority, status: 'done', tags: [], createdAt: TODAY } })

describe('active combat — enemy attack, resources, gold', () => {
  it('the enemy attacks on its turn once its gauge fills', () => {
    // Seed the enemy near-ready so it acts this completion; it strikes the sturdiest member.
    const r = gameReducer(makeInput([PLAYER, HITOMI], { charge: { m1: 95 } }), todo('high'))
    // enemy attack = round(14*1.25 − def 12*0.5) = 12, on the sturdiest member (player).
    expect(r.gameState.resources.player.hp).toBe(120 - 12)
    expect(r.effects.find((e) => e.type === 'enemyAttack')).toMatchObject({ targetId: 'player', amount: 12 })
  })

  it('regenerates MP for a below-full member on completion', () => {
    const r = gameReducer(makeInput([PLAYER, HITOMI], { resources: { hitomi: { hp: 95, mp: 0 } } }), todo('high'))
    expect(r.gameState.resources.hitomi.mp).toBe(MP_REGEN_TODO.high)
  })

  it('defeat rewards scale with the enemy — tougher enemies pay more', () => {
    const weak = defeatRewards(makeMonster({ maxHp: 200, level: 1 }))
    const boss = defeatRewards(makeMonster({ maxHp: 700, level: 6 }))
    expect(boss.xp).toBeGreaterThan(weak.xp)
    expect(boss.gold).toBeGreaterThan(weak.gold)
  })

  it('earns gold on completion, plus a victory bonus on a kill', () => {
    const chip = gameReducer(makeInput([PLAYER, HITOMI]), todo('high')).gameState.gold
    expect(chip).toBe(GOLD_TODO.high) // small per-task chip
    const kill = gameReducer(makeInput([PLAYER, HITOMI], { monster: makeMonster({ hp: 50 }) }), todo('high'))
    expect(kill.gameState.gold).toBeGreaterThan(chip) // a defeated enemy pays a big bonus on top
  })

  it('a downed member does not contribute to the party attack', () => {
    // hitomi is downed → only the player (vanguard atk 18) attacks: 18*2.5 − def 10 = 35.
    const r = gameReducer(makeInput([PLAYER, HITOMI], { resources: { hitomi: { hp: 0, mp: 24 } } }), todo('high'))
    expect(r.effects.find((e) => e.type === 'damage')).toMatchObject({ amount: 35 })
  })

  it('all members downed → setback (revive low + enemy recovers)', () => {
    const input = makeInput([PLAYER, HITOMI], { resources: { player: { hp: 0, mp: 10 }, hitomi: { hp: 0, mp: 10 } }, monster: makeMonster({ hp: 100 }) })
    const overdue: DomainEvent = { type: 'TodoOverdue', todo: { id: 't', title: 't', priority: 'high', status: 'open', tags: [], createdAt: TODAY } }
    const r = gameReducer(input, overdue)
    expect(r.effects.some((e) => e.type === 'partyWiped')).toBe(true)
    expect(r.gameState.resources.player.hp).toBeGreaterThan(0) // revived
    expect(r.gameState.monster.hp).toBeGreaterThan(100) // grew (overdue) + recovered (wipe)
  })

  it('a charged-up fast member laps for a BONUS hit — without stealing the slow member’s turn', () => {
    // 瞳 enters with a near-full gauge → she crosses TWICE this round; 旅人 STILL acts once (the
    // old `ctbResolve(units, partySize)` would have let 瞳 eat 旅人's only turn).
    const r = gameReducer(makeInput([PLAYER, HITOMI], { charge: { hitomi: 50 } }), todo('high'))
    const dmgs = r.effects.filter((e) => e.type === 'damage')
    expect(dmgs).toHaveLength(3) // 瞳 ×2 (lap) + 旅人 ×1
    expect(dmgs.filter((e) => e.type === 'damage' && e.actorId === 'hitomi')).toHaveLength(2)
    expect(dmgs.filter((e) => e.type === 'damage' && e.actorId === 'player')).toHaveLength(1)
    expect(r.gameState.monster.hp).toBe(400 - 40 - 40 - 35) // 瞳 40+40, 旅人 35
  })
})

describe('active combat — planned skills (executed when a task completes)', () => {
  // roundPlan is keyed by member id; the planned skill fires on that member's first turn of the round.
  const plan = (p: Record<string, string>) => p as GameState['roundPlan']

  it('a planned attack skill fires on completion — spends MP, damages the enemy', () => {
    const input = makeInput([HITOMI], { roundPlan: plan({ hitomi: 'jiying' }), resources: { hitomi: { hp: 95, mp: 20 } } })
    const r = gameReducer(input, todo('low'))
    // jiying: hitomi atk 20 * 1.2 * 3 − def 10 = 62 (skills are NOT priority-scaled).
    expect(r.effects.find((e) => e.type === 'skillCast')).toMatchObject({ skillKind: 'attack', amount: 62 })
    expect(r.gameState.monster.hp).toBe(400 - 62) // single member → only the skill hit lands on the monster
    expect(r.gameState.resources.hitomi.mp).toBe(20 - 8 + MP_REGEN_TODO.low) // cast −8, then low regen +6
  })

  it('a planned heal skill restores the most-injured ally', () => {
    const AI = char('medic', 'companion', 'ai')
    const input = makeInput([PLAYER, AI], { roundPlan: plan({ ai: 'zhiliaowurenji' }), resources: { player: { hp: 40, mp: 30 } } })
    const r = gameReducer(input, todo('low'))
    expect(r.effects.some((e) => e.type === 'heal')).toBe(true)
    expect(r.gameState.resources.player.hp).toBeGreaterThan(40) // the injured player got healed
  })

  it('a planned skill the caster cannot afford falls back to a basic attack', () => {
    const input = makeInput([HITOMI], { roundPlan: plan({ hitomi: 'jiying' }), resources: { hitomi: { hp: 95, mp: 2 } } })
    const r = gameReducer(input, todo('high'))
    expect(r.effects.some((e) => e.type === 'skillCast')).toBe(false) // 2 MP < 8 → skill never fires
    // basic attack instead: hitomi atk 20 * 2.5 (high) − def 10 = 40.
    expect(r.effects.find((e) => e.type === 'damage')).toMatchObject({ actorId: 'hitomi', amount: 40 })
  })

  it('a planned debuff skill lowers the enemy defense', () => {
    const RUI = char('tactician', 'companion', 'rui')
    const r = gameReducer(makeInput([RUI], { roundPlan: plan({ rui: 'wuyeyugao' }) }), todo('low'))
    expect(r.gameState.monster.def).toBe(Math.round(10 * (1 - 0.3))) // 7
  })

  it('a planned magic attack skill scales off the caster mag, not atk', () => {
    const RUI = char('tactician', 'companion', 'rui', 3) // L3 tactician: mag 20, atk 14, spd 18 (laps)
    const r = gameReducer(makeInput([RUI], { roundPlan: plan({ rui: 'yemuxiezou' }) }), todo('low'))
    // mag 20 * 1.4 * 3 − def 10 = 74 (would be 49 if it wrongly scaled off atk 14). The skillCast
    // amount is the definitive proof; RUI also laps a basic attack, so monster.hp drops by a bit more.
    expect(r.effects.find((e) => e.type === 'skillCast')).toMatchObject({ skillKind: 'attack', amount: 74 })
    expect(r.gameState.monster.hp).toBeLessThanOrEqual(400 - 74)
  })

  it('a planned buff fires only when the skill is unlocked by level', () => {
    // L1 hitomi: yishumibao (unlock 6) isn't unlocked → falls back to a basic attack, no buff.
    const lvl1 = gameReducer(makeInput([HITOMI], { roundPlan: plan({ hitomi: 'yishumibao' }) }), todo('low'))
    expect(lvl1.gameState.partyBuffs).toHaveLength(0)
    // At level 6 it fires (turnsLeft 3 → 2 after this round's decay, so it survives).
    const hi6 = char('striker', 'companion', 'hitomi', 6)
    const r = gameReducer(makeInput([hi6], { roundPlan: plan({ hitomi: 'yishumibao' }) }), todo('low'))
    expect(r.gameState.partyBuffs).toHaveLength(1)
    expect(r.gameState.partyBuffs[0]).toMatchObject({ kind: 'atkPct', magnitude: 0.2 })
  })
})
