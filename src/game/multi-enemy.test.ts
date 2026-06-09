// Multi-enemy (enemy team) combat: auto-target, AoE, clear-only-when-all-dead, per-primary overdue.
import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import type { Affinity, Character, GameState, Monster, SkillId, Todo } from '../domain/types'
import { autoTargetEnemy, livingEnemies, primaryEnemy, teamCleared, teamFromEncounter } from './combat'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const NOW = new Date(2026, 4, 29, 12, 0, 0)
const TODAY = '2026-05-29'

function char(classId: Character['classId'], kind: Character['kind'], id: string, level = 1, skills: SkillId[] = []): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills, portraitSet: 'x', createdAt: TODAY }
}
const PLAYER = char('vanguard', 'player', 'player')
const MIRA = char('striker', 'companion', 'mira')

function mon(over: Partial<Monster> & { id: string }): Monster {
  return { nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1, ...over }
}

function makeInput(party: Character[], enemies: Monster[], gsOver: Partial<GameState> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: party.map((c) => c.id), enemies, storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '',
    encounterIndex: 0, unlockedCompanionIds: party.filter((c) => c.kind === 'companion').map((c) => c.id),
    ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [], ...gsOver,
  }
  const affinities: Record<string, Affinity> = {}
  for (const c of party) if (c.kind === 'companion') affinities[c.id] = freshAffinity(c.id, TODAY)
  return { gameState, affinities, party, now: NOW, newId: () => 'spawned', openHighCount: 0 }
}
const done = (priority: Todo['priority']): Todo => ({ id: 't', title: 't', priority, status: 'done', tags: [], createdAt: TODAY })

describe('combat helpers · enemy team', () => {
  it('livingEnemies filters hp<=0; teamCleared only when every enemy is down', () => {
    const es = [mon({ id: 'a', hp: 10 }), mon({ id: 'b', hp: 0 })]
    expect(livingEnemies(es).map((m) => m.id)).toEqual(['a'])
    expect(teamCleared(es)).toBe(false)
    expect(teamCleared([mon({ id: 'a', hp: 0 }), mon({ id: 'b', hp: 0 })])).toBe(true)
  })

  it('autoTargetEnemy picks the lowest-HP living enemy; ties → array order; undefined when all dead', () => {
    expect(autoTargetEnemy([mon({ id: 'a', hp: 400 }), mon({ id: 'b', hp: 50 })])?.id).toBe('b')
    expect(autoTargetEnemy([mon({ id: 'a', hp: 50 }), mon({ id: 'b', hp: 50 })])?.id).toBe('a') // tie → first
    expect(autoTargetEnemy([mon({ id: 'a', hp: 400 }), mon({ id: 'b', hp: 0 })])?.id).toBe('a') // skip the dead
    expect(autoTargetEnemy([mon({ id: 'a', hp: 0 })])).toBeUndefined()
  })

  it('primaryEnemy = first living, else enemies[0]', () => {
    expect(primaryEnemy([mon({ id: 'a', hp: 0 }), mon({ id: 'b', hp: 5 })])?.id).toBe('b')
    expect(primaryEnemy([mon({ id: 'a', hp: 0 }), mon({ id: 'b', hp: 0 })])?.id).toBe('a')
  })

  it('teamFromEncounter spawns primary + each add (own scaling); no adds → length 1', () => {
    let n = 0
    const id = () => `e${n++}`
    const enc = { index: 0, enemyName: 'Boss', enemyTheme: '', hpScale: 1, defScale: 1, narrationIntro: '', narrationVictory: '',
      adds: [{ enemyName: 'Add', enemyTheme: '', hpScale: 0.5, defScale: 1 }] }
    const team = teamFromEncounter(enc, 0, 0, id)
    expect(team).toHaveLength(2)
    expect(team[0].displayName).toBe('Boss')
    expect(team[1].displayName).toBe('Add')
    expect(team[1].maxHp).toBeLessThan(team[0].maxHp) // the add's lighter hpScale
    expect(teamFromEncounter({ ...enc, adds: undefined }, 0, 0, () => 'x')).toHaveLength(1)
  })
})

describe('gameReducer · enemy team', () => {
  it('a basic attack auto-targets the lowest-HP living enemy first', () => {
    const r = gameReducer(makeInput([PLAYER, MIRA], [mon({ id: 'e1', hp: 4000 }), mon({ id: 'e2', hp: 50 })]), { type: 'TodoCompleted', todo: done('high') })
    const dmgs = r.effects.filter((e) => e.type === 'damage')
    expect(dmgs[0]).toMatchObject({ targetId: 'e2' }) // the 50-HP enemy, not the 4000-HP one
  })

  it('the encounter clears ONLY when every enemy is dead', () => {
    const r = gameReducer(makeInput([PLAYER, MIRA], [mon({ id: 'e1', hp: 1 }), mon({ id: 'e2', hp: 4000 })]), { type: 'TodoCompleted', todo: done('high') })
    expect(r.effects.some((e) => e.type === 'victory' || e.type === 'encounterCleared')).toBe(false)
    expect(r.gameState.enemies).toHaveLength(2) // not respawned
    expect(r.gameState.enemies[0].hp).toBe(0) // the 1-HP enemy fell
    expect(r.gameState.enemies[1].hp).toBeGreaterThan(0) // the tanky one survives
  })

  it('an AoE attack (yexing) hits every living enemy', () => {
    const vela = char('tactician', 'companion', 'vela', 3, ['yexing'])
    const r = gameReducer(
      makeInput([vela], [mon({ id: 'e1', hp: 4000 }), mon({ id: 'e2', hp: 4000 })], { roundPlan: { vela: 'yexing' } }),
      { type: 'TodoCompleted', todo: done('high') },
    )
    const aoe = r.effects.filter((e) => e.type === 'damage' && e.fromSkill)
    expect(new Set(aoe.map((e) => (e.type === 'damage' ? e.targetId : '')))).toEqual(new Set(['e1', 'e2']))
    expect(r.gameState.enemies[0].hp).toBeLessThan(4000)
    expect(r.gameState.enemies[1].hp).toBeLessThan(4000)
  })

  it('an AoE that empties the whole team in one cast fires exactly ONE clear cascade', () => {
    const vela = char('tactician', 'companion', 'vela', 3, ['yexing'])
    const r = gameReducer(
      makeInput([vela], [mon({ id: 'e1', hp: 1 }), mon({ id: 'e2', hp: 1 })], { roundPlan: { vela: 'yexing' } }),
      { type: 'TodoCompleted', todo: done('high') },
    )
    expect(r.effects.filter((e) => e.type === 'victory')).toHaveLength(1) // endless → one victory, not two
    expect(r.gameState.enemies).toHaveLength(1) // respawned to the next single endless enemy
    expect(r.gameState.enemies[0].hp).toBe(r.gameState.enemies[0].maxHp) // fresh, full HP
  })

  it('overdue grows ONLY the primary enemy', () => {
    const r = gameReducer(
      makeInput([PLAYER, MIRA], [mon({ id: 'e1', maxHp: 400, hp: 400, atk: 14 }), mon({ id: 'e2', maxHp: 300, hp: 300, atk: 10 })]),
      { type: 'TodoOverdue', todo: done('high') },
    )
    expect(r.gameState.enemies[0].maxHp).toBe(470) // primary grew (+70)
    expect(r.gameState.enemies[0].atk).toBe(16) // primary grew (+2)
    expect(r.gameState.enemies[1].maxHp).toBe(300) // the add is untouched
    expect(r.gameState.enemies[1].atk).toBe(10)
  })
})
