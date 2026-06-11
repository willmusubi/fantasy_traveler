// §26 status-effect unit tests. Covers both the pure status.ts helpers and
// the reducer-level integration (round-end DOT/HOT, action gates, guard, silence,
// skill inflict/cleanse, smart tactics, slow/CTB).
//
// Fixtures follow the same char()/makeMonster()/makeInput() pattern as the other
// test files — no imports from test files, only from source modules.

import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import { GUARD_ACTION, SLOW_DEFAULT_PCT } from '../domain/config'
import type { Affinity, Character, CombatStatus, GameState, Monster, SkillId, StatusEffectSpec, StatusKind, Todo } from '../domain/types'
import { ctbRound } from './combat'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'
import {
  applyStatus,
  clearStatusKinds,
  cloneStatusMap,
  hasStatus,
  incapacitatedBy,
  resolveMagnitude,
  slowedSpd,
  statusesOf,
  tickDurations,
  type StatusMap,
} from './status'

// ============================================================
// Shared fixtures
// ============================================================

const NOW = new Date(2026, 5, 10, 12, 0, 0)
const TODAY = '2026-06-10'

function char(classId: Character['classId'], kind: Character['kind'], id: string, skills: SkillId[] = [], level = 1): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills, portraitSet: 'x', createdAt: TODAY }
}

const PLAYER = char('vanguard', 'player', 'player', [], 1)

function charWithLevel(classId: Character['classId'], kind: Character['kind'], id: string, skills: SkillId[], level: number): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills, portraitSet: 'x', createdAt: TODAY }
}

function makeMonster(over: Partial<Monster> = {}): Monster {
  return { id: 'm1', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1, ...over }
}

function makeInput(party: Character[], gsOver: Partial<GameState> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: party.map((c) => c.id),
    enemies: [makeMonster()],
    storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '',
    encounterIndex: 0,
    unlockedCompanionIds: party.filter((c) => c.kind === 'companion').map((c) => c.id),
    ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {},
    roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
    ...gsOver,
  }
  const affinities: Record<string, Affinity> = {}
  for (const c of party) if (c.kind === 'companion') affinities[c.id] = freshAffinity(c.id, TODAY)
  return { gameState, affinities, party, now: NOW, newId: () => 'sid-' + Math.random().toFixed(6), openHighCount: 0 }
}

const todo = (priority: Todo['priority']): { type: 'TodoCompleted'; todo: Todo } => ({
  type: 'TodoCompleted',
  todo: { id: 't1', title: 't', priority, status: 'done', tags: [], createdAt: TODAY },
})

let idCtr = 0
function newId(): string { return `id-${++idCtr}` }

function mkStatus(kind: StatusKind, roundsLeft: number, magnitude?: number): CombatStatus {
  return { id: newId(), kind, roundsLeft, magnitude }
}

// ============================================================
// 1. Pure status.ts helpers
// ============================================================

describe('applyStatus — replace-same-kind', () => {
  it('adds a new status when none exists', () => {
    const spec: StatusEffectSpec = { kind: 'poison', rounds: 3 }
    const map = applyStatus(undefined, 'tgt', spec, 200, newId)
    expect(map['tgt']).toHaveLength(1)
    expect(map['tgt'][0].kind).toBe('poison')
    expect(map['tgt'][0].roundsLeft).toBe(3)
  })

  it('keeps max roundsLeft when the same kind is re-applied', () => {
    const spec1: StatusEffectSpec = { kind: 'poison', rounds: 3, magnitude: 10 }
    const spec2: StatusEffectSpec = { kind: 'poison', rounds: 5, magnitude: 8 }
    const map1 = applyStatus(undefined, 'tgt', spec1, 200, newId)
    const map2 = applyStatus(map1, 'tgt', spec2, 200, newId)
    expect(map2['tgt']).toHaveLength(1)
    expect(map2['tgt'][0].roundsLeft).toBe(5) // max(3, 5)
    expect(map2['tgt'][0].magnitude).toBe(10) // max(10, 8)
  })

  it('keeps max magnitude when new application is weaker', () => {
    const spec1: StatusEffectSpec = { kind: 'burn', rounds: 2, magnitude: 20 }
    const spec2: StatusEffectSpec = { kind: 'burn', rounds: 4, magnitude: 5 }
    const map1 = applyStatus(undefined, 'tgt', spec1, 200, newId)
    const map2 = applyStatus(map1, 'tgt', spec2, 200, newId)
    expect(map2['tgt'][0].magnitude).toBe(20)
    expect(map2['tgt'][0].roundsLeft).toBe(4)
  })

  it('does not stack multiple entries of the same kind', () => {
    const spec: StatusEffectSpec = { kind: 'sleep', rounds: 2 }
    let map = applyStatus(undefined, 'tgt', spec, 100, newId)
    map = applyStatus(map, 'tgt', spec, 100, newId)
    map = applyStatus(map, 'tgt', spec, 100, newId)
    const sleeps = map['tgt'].filter((s) => s.kind === 'sleep')
    expect(sleeps).toHaveLength(1)
  })

  it('can hold multiple DIFFERENT status kinds simultaneously', () => {
    let map = applyStatus(undefined, 'tgt', { kind: 'poison', rounds: 2 }, 100, newId)
    map = applyStatus(map, 'tgt', { kind: 'slow', rounds: 2 }, 100, newId)
    expect(map['tgt']).toHaveLength(2)
  })
})

describe('resolveMagnitude', () => {
  it('returns explicit magnitude when provided', () => {
    expect(resolveMagnitude({ kind: 'poison', rounds: 2, magnitude: 42 }, 1000)).toBe(42)
  })

  it('defaults poison to 5% maxHp (min 1)', () => {
    expect(resolveMagnitude({ kind: 'poison', rounds: 2 }, 200)).toBe(Math.max(1, Math.round(200 * 0.05)))
    // 200 * 0.05 = 10
    expect(resolveMagnitude({ kind: 'poison', rounds: 2 }, 200)).toBe(10)
  })

  it('returns min 1 for tiny maxHp', () => {
    expect(resolveMagnitude({ kind: 'poison', rounds: 2 }, 5)).toBe(1)
  })

  it('defaults burn to 6% maxHp', () => {
    expect(resolveMagnitude({ kind: 'burn', rounds: 2 }, 200)).toBe(Math.round(200 * 0.06)) // 12
  })

  it('defaults regen to 6% maxHp', () => {
    expect(resolveMagnitude({ kind: 'regen', rounds: 2 }, 200)).toBe(Math.round(200 * 0.06)) // 12
  })

  it('defaults slow to SLOW_DEFAULT_PCT (0.3)', () => {
    expect(resolveMagnitude({ kind: 'slow', rounds: 2 }, 100)).toBe(SLOW_DEFAULT_PCT)
  })

  it('returns undefined for kinds with no default (e.g. sleep)', () => {
    expect(resolveMagnitude({ kind: 'sleep', rounds: 1 }, 100)).toBeUndefined()
  })
})

describe('clearStatusKinds', () => {
  it('removes specified kinds and reports what was cleared', () => {
    const map: StatusMap = { tgt: [mkStatus('poison', 2), mkStatus('burn', 1), mkStatus('slow', 3)] }
    const { map: next, cleared } = clearStatusKinds(map, 'tgt', ['poison', 'burn'])
    expect(cleared).toEqual(expect.arrayContaining(['poison', 'burn']))
    expect(next['tgt']).toHaveLength(1)
    expect(next['tgt'][0].kind).toBe('slow')
  })

  it('returns empty cleared when no matching kinds', () => {
    const map: StatusMap = { tgt: [mkStatus('sleep', 1)] }
    const { cleared } = clearStatusKinds(map, 'tgt', ['poison'])
    expect(cleared).toHaveLength(0)
  })

  it('deletes the key when all statuses are cleared', () => {
    const map: StatusMap = { tgt: [mkStatus('burn', 1)] }
    const { map: next } = clearStatusKinds(map, 'tgt', ['burn'])
    expect(next['tgt']).toBeUndefined()
  })
})

describe('slowedSpd', () => {
  it('returns original spd when not slowed', () => {
    expect(slowedSpd(12, [])).toBe(12)
    expect(slowedSpd(12, [mkStatus('poison', 2)])).toBe(12)
  })

  it('applies the slow magnitude to cut spd', () => {
    const statuses: CombatStatus[] = [{ id: 's1', kind: 'slow', roundsLeft: 2, magnitude: 0.3 }]
    // 12 * (1 - 0.3) = 8.4 → round = 8
    expect(slowedSpd(12, statuses)).toBe(Math.max(1, Math.round(12 * (1 - 0.3))))
    expect(slowedSpd(12, statuses)).toBe(8)
  })

  it('floors at 1 even with 100% slow magnitude', () => {
    const statuses: CombatStatus[] = [{ id: 's1', kind: 'slow', roundsLeft: 1, magnitude: 1.0 }]
    expect(slowedSpd(20, statuses)).toBe(1)
  })

  it('uses SLOW_DEFAULT_PCT when magnitude is absent', () => {
    const statuses: CombatStatus[] = [{ id: 's1', kind: 'slow', roundsLeft: 1 }]
    const expected = Math.max(1, Math.round(12 * (1 - SLOW_DEFAULT_PCT)))
    expect(slowedSpd(12, statuses)).toBe(expected)
  })
})

describe('tickDurations', () => {
  it('decrements roundsLeft and keeps statuses with >0 left', () => {
    const statuses = [mkStatus('poison', 3), mkStatus('burn', 1)]
    const { kept, expired } = tickDurations(statuses)
    expect(kept).toHaveLength(1)
    expect(kept[0].kind).toBe('poison')
    expect(kept[0].roundsLeft).toBe(2)
    expect(expired).toHaveLength(1)
    expect(expired[0].kind).toBe('burn')
  })

  it('expires everything when all are at roundsLeft 1', () => {
    const statuses = [mkStatus('sleep', 1), mkStatus('paralysis', 1)]
    const { kept, expired } = tickDurations(statuses)
    expect(kept).toHaveLength(0)
    expect(expired).toHaveLength(2)
  })
})

describe('incapacitatedBy ordering', () => {
  it('returns sleep before paralysis', () => {
    const map: StatusMap = { tgt: [mkStatus('paralysis', 1), mkStatus('sleep', 2)] }
    expect(incapacitatedBy(map, 'tgt')).toBe('sleep')
  })

  it('returns paralysis when only paralyzed', () => {
    const map: StatusMap = { tgt: [mkStatus('paralysis', 1)] }
    expect(incapacitatedBy(map, 'tgt')).toBe('paralysis')
  })

  it('returns undefined when neither sleep nor paralysis', () => {
    const map: StatusMap = { tgt: [mkStatus('poison', 2), mkStatus('burn', 1)] }
    expect(incapacitatedBy(map, 'tgt')).toBeUndefined()
  })

  it('returns undefined for an empty/absent map', () => {
    expect(incapacitatedBy(undefined, 'tgt')).toBeUndefined()
    expect(incapacitatedBy({}, 'tgt')).toBeUndefined()
  })
})

describe('cloneStatusMap isolation', () => {
  it('clones arrays so mutations do not leak back', () => {
    const original: StatusMap = { a: [mkStatus('poison', 2)], b: [mkStatus('burn', 1)] }
    const clone = cloneStatusMap(original)
    clone['a'].push(mkStatus('sleep', 1))
    expect(original['a']).toHaveLength(1) // original untouched
    expect(clone['a']).toHaveLength(2)
  })

  it('handles undefined / empty gracefully', () => {
    expect(cloneStatusMap(undefined)).toEqual({})
    expect(cloneStatusMap({})).toEqual({})
  })
})

// ============================================================
// 2. Round-end DOT via TodoCompleted (synchronous reducer path)
// ============================================================

describe('round-end poison — enemy', () => {
  it('a poisoned enemy loses magnitude HP at round end (statusTick effect emitted)', () => {
    const poisonMag = 20
    const m = makeMonster({ hp: 400, maxHp: 400 })
    const statusMap: Record<string, CombatStatus[]> = {
      m1: [{ id: 'p1', kind: 'poison', roundsLeft: 3, magnitude: poisonMag }],
    }
    const r = gameReducer(makeInput([PLAYER], { enemies: [m], activeStatuses: statusMap }), todo('low'))
    const tick = r.effects.find((e) => e.type === 'statusTick' && e.targetId === 'm1')
    expect(tick).toBeDefined()
    expect(tick!.type === 'statusTick' && tick.amount).toBe(poisonMag)
  })

  it('poison duration is decremented (roundsLeft 3 → 2)', () => {
    const m = makeMonster({ hp: 400, maxHp: 400 })
    const statusMap: Record<string, CombatStatus[]> = {
      m1: [{ id: 'p1', kind: 'poison', roundsLeft: 3, magnitude: 20 }],
    }
    const r = gameReducer(makeInput([PLAYER], { enemies: [m], activeStatuses: statusMap }), todo('low'))
    const remaining = r.gameState.activeStatuses?.['m1']?.find((s) => s.kind === 'poison')
    expect(remaining?.roundsLeft).toBe(2)
  })

  it('poison killing the LAST enemy at round-end fires the full clear cascade (victory effect)', () => {
    // Enemy survives the party's swings (huge def → chip floor only) but the round-end
    // poison tick (magnitude 200 ≥ remaining HP) finishes it — the clear cascade must
    // fire from the DOT path exactly as it does from a normal hit.
    const m2 = makeMonster({ hp: 200, maxHp: 400, def: 999 }) // huge def: party can't kill it in their turn
    const statusMap2: Record<string, CombatStatus[]> = {
      m1: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 200 }],
    }
    const r = gameReducer(makeInput([PLAYER], { enemies: [m2], activeStatuses: statusMap2 }), todo('low'))
    // The victory effect is either 'victory' or storyStage+1 happened
    const hasVictory = r.effects.some((e) => e.type === 'victory') || r.gameState.storyStage > 0
    expect(hasVictory).toBe(true)
  })
})

describe('round-end poison — party member', () => {
  it('a poisoned party member takes statusTick damage at round end', () => {
    const poisonMag = 15
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: poisonMag }],
    }
    // Give player low HP so we can see it; not so low they die from member attack
    const r = gameReducer(makeInput([PLAYER], { resources: { player: { hp: 100, mp: 30 } }, activeStatuses: statusMap }), todo('low'))
    const tick = r.effects.find((e) => e.type === 'statusTick' && e.targetId === 'player')
    expect(tick).toBeDefined()
    if (tick?.type === 'statusTick') expect(tick.amount).toBe(poisonMag)
  })

  it('a poisoned party member downed by the tick emits downed + sheds statuses', () => {
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 100 }],
    }
    const r = gameReducer(
      makeInput([PLAYER], { resources: { player: { hp: 5, mp: 30 } }, activeStatuses: statusMap }),
      todo('low'),
    )
    expect(r.effects.some((e) => e.type === 'downed' && e.characterId === 'player')).toBe(true)
    // After being downed statuses should be shed
    const statuses = r.gameState.activeStatuses?.['player']
    expect(!statuses || statuses.length === 0).toBe(true)
  })
})

describe('round-end regen', () => {
  it('heals a party member that is below max', () => {
    const regenMag = 20
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'r1', kind: 'regen', roundsLeft: 3, magnitude: regenMag }],
    }
    const r = gameReducer(
      makeInput([PLAYER], { resources: { player: { hp: 50, mp: 30 } }, activeStatuses: statusMap }),
      todo('low'),
    )
    const tick = r.effects.find((e) => e.type === 'statusTick' && e.targetId === 'player' && e.kind === 'regen')
    expect(tick).toBeDefined()
    if (tick?.type === 'statusTick') expect(tick.amount).toBeGreaterThan(0)
  })

  it('does NOT emit a statusTick when the member is already at max HP', () => {
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'r1', kind: 'regen', roundsLeft: 3, magnitude: 30 }],
    }
    // Player at full HP. Enemy must not act this round so the player remains at full HP
    // when the round-end regen check runs. spd=0 means the CTB excludes the enemy entirely.
    const safeMonster = makeMonster({ spd: 0 })
    const r = gameReducer(makeInput([PLAYER], { enemies: [safeMonster], activeStatuses: statusMap }), todo('low'))
    const regenTick = r.effects.find((e) => e.type === 'statusTick' && e.kind === 'regen')
    expect(regenTick).toBeUndefined()
  })
})

// ============================================================
// 3. Sleep on enemy — patternIdx frozen; paralysis — patternIdx advances
// ============================================================

describe('sleep on enemy', () => {
  it('emits statusSkipped and does NOT advance patternIdx', () => {
    const pattern = [{ kind: 'attack' as const }, { kind: 'heavy' as const, mult: 2, telegraph: '蓄力' }]
    const m = makeMonster({ hp: 400, pattern, patternIdx: 0, spd: 99 }) // very fast so it acts this round
    const statusMap: Record<string, CombatStatus[]> = {
      m1: [{ id: 'sl1', kind: 'sleep', roundsLeft: 1 }],
    }
    const r = gameReducer(makeInput([PLAYER], { enemies: [m], charge: { m1: 95 }, activeStatuses: statusMap }), todo('high'))
    expect(r.effects.some((e) => e.type === 'statusSkipped' && e.targetId === 'm1' && e.kind === 'sleep')).toBe(true)
    // patternIdx should still be 0 (frozen)
    // The status expires (1 round) but patternIdx should not have advanced
    expect(r.effects.some((e) => e.type === 'enemyTelegraph')).toBe(false)
  })
})

describe('paralysis on enemy', () => {
  it('emits statusSkipped and ADVANCES the pattern (telegraphs next heavy)', () => {
    // Pattern: attack(0) → heavy+telegraph(1). Enemy starts at idx 0 with paralysis.
    // After skip + advance: idx = 1 (heavy has telegraph), so enemyTelegraph should fire.
    const pattern = [{ kind: 'attack' as const }, { kind: 'heavy' as const, mult: 2, telegraph: '蓄力' }]
    const m = makeMonster({ hp: 400, pattern, patternIdx: 0, spd: 99 })
    const statusMap: Record<string, CombatStatus[]> = {
      m1: [{ id: 'par1', kind: 'paralysis', roundsLeft: 1 }],
    }
    const r = gameReducer(makeInput([PLAYER], { enemies: [m], charge: { m1: 95 }, activeStatuses: statusMap }), todo('high'))
    expect(r.effects.some((e) => e.type === 'statusSkipped' && e.targetId === 'm1' && e.kind === 'paralysis')).toBe(true)
    // Pattern advances → enemy is now pointing to the heavy slot → telegraph should fire
    expect(r.effects.some((e) => e.type === 'enemyTelegraph' && e.enemyId === 'm1')).toBe(true)
  })
})

// ============================================================
// 4. Sleep on party member — statusSkipped, no damage; isLiveDecision via RoundBegan
// ============================================================

describe('sleep on party member', () => {
  it('emits statusSkipped and no damage effect from the slept member', () => {
    const MIRA = charWithLevel('striker', 'companion', 'mira', ['liuguang'], 6)
    const statusMap: Record<string, CombatStatus[]> = {
      mira: [{ id: 'sl1', kind: 'sleep', roundsLeft: 1 }],
    }
    const r = gameReducer(makeInput([PLAYER, MIRA], { activeStatuses: statusMap }), todo('high'))
    expect(r.effects.some((e) => e.type === 'statusSkipped' && e.targetId === 'mira')).toBe(true)
    // mira should not contribute a damage effect
    const miraDmg = r.effects.filter((e) => e.type === 'damage' && e.actorId === 'mira')
    expect(miraDmg).toHaveLength(0)
  })

  it('a round whose only party member is asleep finalizes without activeRound (isLiveDecision=false)', () => {
    // Use single-member party with sleep so there is no live decision → RoundBegan finalizes immediately
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'sl1', kind: 'sleep', roundsLeft: 1 }],
    }
    const input = makeInput([PLAYER], { activeStatuses: statusMap })
    const r = gameReducer(input, { type: 'RoundBegan', todo: { id: 't', title: 't', priority: 'high', status: 'done', tags: [], createdAt: TODAY } })
    // If there is no live decision the round should finalize: activeRound will be undefined
    expect(r.gameState.activeRound).toBeUndefined()
  })
})

// ============================================================
// 5. Guard — halves enemy TURN damage; expires silently after round end
// ============================================================

describe('guard', () => {
  it('RoundAdvanced with GUARD_ACTION emits guarded effect and applies guard status', () => {
    const MIRA = charWithLevel('striker', 'companion', 'mira', ['liuguang'], 6)
    const input = makeInput([PLAYER, MIRA])
    // Start interactive round — MIRA acts first (striker is fast)
    const r0 = gameReducer(input, { type: 'RoundBegan', todo: { id: 't', title: 't', priority: 'high', status: 'done', tags: [], createdAt: TODAY } })
    // The first live decision is the first party member. Let's advance with GUARD_ACTION
    const r1 = gameReducer({ ...input, gameState: r0.gameState, affinities: r0.affinities }, { type: 'RoundAdvanced', choice: GUARD_ACTION })
    expect(r1.effects.some((e) => e.type === 'guarded')).toBe(true)
    // The guard status should now be live
    const actingId = r0.gameState.activeRound?.order[r0.gameState.activeRound.index]?.id
    if (actingId) {
      const hasGuard = hasStatus(r1.gameState.activeStatuses, actingId, 'guard')
      expect(hasGuard).toBe(true)
    }
  })

  it('a guarding member takes half damage from an enemy strike', () => {
    // Compare: guard vs no-guard for the same enemy hit
    const m = makeMonster({ hp: 400, atk: 40, spd: 99 }) // fast enemy, hard hit
    // No guard run — enemy charges high and hits
    const noGuardInput = makeInput([PLAYER], { enemies: [m], charge: { m1: 95 } })
    const noGuard = gameReducer(noGuardInput, todo('high'))
    const noGuardHit = noGuard.effects.find((e) => e.type === 'enemyAttack' && !e.missed)

    // Guard run — apply guard status to player manually
    const guardInput = makeInput([PLAYER], {
      enemies: [m], charge: { m1: 95 },
      activeStatuses: { player: [{ id: 'g1', kind: 'guard', roundsLeft: 1 }] },
    })
    const withGuard = gameReducer(guardInput, todo('high'))
    const guardHit = withGuard.effects.find((e) => e.type === 'enemyAttack' && !e.missed)

    if (noGuardHit?.type === 'enemyAttack' && guardHit?.type === 'enemyAttack' && !noGuardHit.missed && !guardHit.missed) {
      expect(guardHit.amount).toBeLessThan(noGuardHit.amount)
      // The guarded hit should be ≈ half (GUARD_DAMAGE_REDUCTION=0.5)
      expect(guardHit.amount).toBe(Math.max(1, Math.round(noGuardHit.amount * 0.5)))
    }
  })

  it('guard status expires silently after round end — no statusExpired for guard', () => {
    // Apply guard status, complete a task — guard should expire silently (no statusExpired effect)
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'g1', kind: 'guard', roundsLeft: 1 }],
    }
    const r = gameReducer(makeInput([PLAYER], { activeStatuses: statusMap }), todo('low'))
    const guardExpiry = r.effects.find((e) => e.type === 'statusExpired' && e.kind === 'guard')
    expect(guardExpiry).toBeUndefined()
    // Guard should be gone from the state
    const guardLeft = r.gameState.activeStatuses?.['player']?.find((s) => s.kind === 'guard')
    expect(guardLeft).toBeUndefined()
  })
})

// ============================================================
// 6. Silence — member with planned skill falls back to basic attack
// ============================================================

describe('silence', () => {
  it('a silenced member with a planned skill basic-attacks instead (no skillCast effect)', () => {
    const MIRA = charWithLevel('striker', 'companion', 'mira', ['liuguang'], 6)
    const statusMap: Record<string, CombatStatus[]> = {
      mira: [{ id: 'si1', kind: 'silence', roundsLeft: 2 }],
    }
    const r = gameReducer(
      makeInput([MIRA], { roundPlan: { mira: 'liuguang' }, activeStatuses: statusMap }),
      todo('low'),
    )
    expect(r.effects.some((e) => e.type === 'skillCast')).toBe(false)
    expect(r.effects.some((e) => e.type === 'damage' && e.actorId === 'mira')).toBe(true)
  })
})

// ============================================================
// 7. Skill integration: mianxing, fenxing, jingxing
// ============================================================

describe('mianxing (vela) — sleeps the enemy (chance .85, default roll 0.5 → lands)', () => {
  it('inflicts sleep on the enemy via debuff (pure status move, no def shred)', () => {
    const VELA = charWithLevel('tactician', 'companion', 'vela', ['mianxing'], 8)
    // Use a sturdy enemy with high HP so it survives the round (sleep applied stays in effects).
    // Sleep has 1 round; after round-end tick it expires. We check the statusApplied EFFECT
    // which is immutably pushed regardless of the tick, and also check that the enemy had the
    // status during the round (confirmed by statusApplied in effects).
    const sturdyMonster = makeMonster({ hp: 2000, maxHp: 2000, def: 999 })
    const r = gameReducer(
      makeInput([VELA], { enemies: [sturdyMonster], roundPlan: { vela: 'mianxing' }, resources: { vela: { hp: 90, mp: 20 } } }),
      todo('low'),
    )
    const statusApplied = r.effects.find((e) => e.type === 'statusApplied' && e.kind === 'sleep')
    expect(statusApplied).toBeDefined()
    // sleep was applied (confirmed by the effect). After round-end tick it expires (1 round).
    expect(r.effects.some((e) => e.type === 'statusExpired' && e.kind === 'sleep')).toBe(true)
  })

  it('mianxing does NOT lower enemy def (power 0 = pure status move)', () => {
    const VELA = charWithLevel('tactician', 'companion', 'vela', ['mianxing'], 8)
    const r = gameReducer(
      makeInput([VELA], { roundPlan: { vela: 'mianxing' }, resources: { vela: { hp: 90, mp: 20 } } }),
      todo('low'),
    )
    // Enemy def should be unchanged
    expect(r.gameState.enemies[0].def).toBe(10)
  })
})

describe('fenxing (mira lvl 8) — attack skill inflicts burn (chance .7, default roll 0.5 → lands)', () => {
  it('inflicts burn on hit', () => {
    const MIRA = charWithLevel('striker', 'companion', 'mira', ['fenxing'], 8)
    const r = gameReducer(
      makeInput([MIRA], { roundPlan: { mira: 'fenxing' }, resources: { mira: { hp: 95, mp: 20 } } }),
      todo('low'),
    )
    const burnApplied = r.effects.find((e) => e.type === 'statusApplied' && e.kind === 'burn')
    expect(burnApplied).toBeDefined()
    expect(hasStatus(r.gameState.activeStatuses, 'm1', 'burn')).toBe(true)
  })
})

describe('jingxing (nova) — cleanses an afflicted ally, prefers afflicted over more-injured healthy', () => {
  it('cleanses all harmful statuses from the afflicted ally', () => {
    const NOVA = charWithLevel('medic', 'companion', 'nova', ['jingxing'], 5)
    // Player is poisoned; nova is healthy. Nova should cleanse player.
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 10 }],
    }
    const r = gameReducer(
      makeInput([PLAYER, NOVA], {
        roundPlan: { nova: 'jingxing' },
        resources: { player: { hp: 80, mp: 30 }, nova: { hp: 100, mp: 20 } },
        activeStatuses: statusMap,
      }),
      todo('low'),
    )
    const expired = r.effects.find((e) => e.type === 'statusExpired' && e.targetId === 'player' && e.kind === 'poison')
    expect(expired).toBeDefined()
    expect(hasStatus(r.gameState.activeStatuses, 'player', 'poison')).toBe(false)
  })

  it('prefers afflicted ally over a more-injured-but-healthy ally', () => {
    const NOVA = charWithLevel('medic', 'companion', 'nova', ['jingxing'], 5)
    // PLAYER has 30 HP (very injured, but no status)
    // MIRA has poison (but 90 HP)
    const MIRA = charWithLevel('striker', 'companion', 'mira', ['liuguang'], 6)
    const statusMap: Record<string, CombatStatus[]> = {
      mira: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 10 }],
    }
    const r = gameReducer(
      makeInput([PLAYER, MIRA, NOVA], {
        roundPlan: { nova: 'jingxing' },
        resources: { player: { hp: 30, mp: 20 }, mira: { hp: 90, mp: 20 }, nova: { hp: 100, mp: 20 } },
        activeStatuses: statusMap,
      }),
      todo('low'),
    )
    // The cleanse should have targeted mira (the afflicted one), not player (the injured one)
    const expiredOnMira = r.effects.find((e) => e.type === 'statusExpired' && e.targetId === 'mira' && e.kind === 'poison')
    expect(expiredOnMira).toBeDefined()
  })
})

// ============================================================
// 8. Smart tactics
// ============================================================

describe('smart tactics: nova with jingxing + a poisoned ally → auto-casts jingxing', () => {
  it('smart tactics auto-casts jingxing when an ally is poisoned', () => {
    const NOVA = charWithLevel('medic', 'companion', 'nova', ['jingxing'], 5)
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 10 }],
    }
    // No roundPlan — PLAIN tactics (default) must NOT volunteer the cleanse (control run)…
    const rPlain = gameReducer(
      makeInput([PLAYER, NOVA], {
        resources: { player: { hp: 100, mp: 20 }, nova: { hp: 100, mp: 20 } },
        activeStatuses: statusMap,
      }),
      { type: 'TodoCompleted', todo: { id: 't', title: 't', priority: 'low', status: 'done', tags: [], createdAt: TODAY } },
    )
    expect(rPlain.effects.some((e) => e.type === 'skillCast' && e.skillId === 'jingxing')).toBe(false)
    // …while SMART tactics fills it in on its own.
    const rSmart = gameReducer(
      { ...makeInput([PLAYER, NOVA], {
        resources: { player: { hp: 100, mp: 20 }, nova: { hp: 100, mp: 20 } },
        activeStatuses: statusMap,
      }), tactics: 'smart' },
      { type: 'TodoCompleted', todo: { id: 't', title: 't', priority: 'low', status: 'done', tags: [], createdAt: TODAY } },
    )
    const skillCast = rSmart.effects.find((e) => e.type === 'skillCast' && e.skillId === 'jingxing')
    expect(skillCast).toBeDefined()
    // The cleanse should have cleared player's poison
    expect(hasStatus(rSmart.gameState.activeStatuses, 'player', 'poison')).toBe(false)
  })
})

describe('smart tactics: member below 30% maxHp guards', () => {
  it('smart tactics makes player GUARD when at critically low HP (no skills)', () => {
    const playerStats = PLAYER.stats
    const criticalHp = Math.floor(playerStats.maxHp * 0.25) // 25% < 30% threshold
    const input: ReducerInput = {
      ...makeInput([PLAYER], { resources: { player: { hp: criticalHp, mp: 30 } } }),
      tactics: 'smart',
    }
    // Use interactive path so we can see the guard action
    const r0 = gameReducer(input, { type: 'RoundBegan', todo: { id: 't', title: 't', priority: 'high', status: 'done', tags: [], createdAt: TODAY } })
    // If the round finalizes without pausing, the player auto-guarded (no live decision)
    // The guarded effect should be present (from the player's auto-guard action)
    // Or activeRound is still present and we need to advance
    if (r0.gameState.activeRound) {
      const r1 = gameReducer({ ...input, gameState: r0.gameState, affinities: r0.affinities }, { type: 'RoundAdvanced', auto: true })
      expect(r1.effects.some((e) => e.type === 'guarded' && e.characterId === 'player')).toBe(true)
    } else {
      // Already finalized — check the accumulated effects
      const allEffects = [...r0.effects]
      expect(allEffects.some((e) => e.type === 'guarded' && e.characterId === 'player')).toBe(true)
    }
  })
})

describe('smart tactics disabled — plain mode does NOT auto-guard or cleanse', () => {
  it('without tactics:smart, a poisoned ally is NOT auto-cleansed', () => {
    const NOVA = charWithLevel('medic', 'companion', 'nova', ['jingxing'], 5)
    const statusMap: Record<string, CombatStatus[]> = {
      player: [{ id: 'p1', kind: 'poison', roundsLeft: 2, magnitude: 10 }],
    }
    // plain mode (default) — no roundPlan, no smart tactics
    const r = gameReducer(
      makeInput([PLAYER, NOVA], {
        resources: { player: { hp: 100, mp: 20 }, nova: { hp: 100, mp: 20 } },
        activeStatuses: statusMap,
      }),
      { type: 'TodoCompleted', todo: { id: 't', title: 't', priority: 'low', status: 'done', tags: [], createdAt: TODAY } },
    )
    // jingxing should NOT have been cast in plain mode
    const skillCast = r.effects.find((e) => e.type === 'skillCast' && e.skillId === 'jingxing')
    expect(skillCast).toBeUndefined()
  })
})

// ============================================================
// 9. Slow — CTB order affected for slowed enemy
// ============================================================

describe('slow — enemy spd reduced changes CTB order', () => {
  it('a slowed enemy (spd 12 → 8) acts later in the round order', () => {
    // Normal enemy spd=12; with 30% slow → spd = max(1, round(12*0.7)) = 8
    const normalSpd = 12
    const slowMag = 0.3
    const slowedSpdVal = Math.max(1, Math.round(normalSpd * (1 - slowMag)))
    expect(slowedSpdVal).toBe(8)

    // Build units for CTB comparison
    const fastParty: Array<{ side: 'party' | 'enemy'; id: string; spd: number; charge: number }> = [
      { side: 'party', id: 'player', spd: 11, charge: 0 },
    ]
    const normalEnemy = [...fastParty, { side: 'enemy' as const, id: 'm1', spd: normalSpd, charge: 0 }]
    const slowedEnemy = [...fastParty, { side: 'enemy' as const, id: 'm1', spd: slowedSpdVal, charge: 0 }]

    const normalOrder = ctbRound(normalEnemy).order
    const slowedOrder = ctbRound(slowedEnemy).order

    // With normal spd (12 > 11), enemy acts first
    // With slowed spd (8 < 11), player acts first
    const normalFirstIsEnemy = normalOrder[0]?.side === 'enemy'
    const slowedFirstIsParty = slowedOrder[0]?.side === 'party'
    expect(normalFirstIsEnemy).toBe(true)
    expect(slowedFirstIsParty).toBe(true)
  })

  it('slowedSpd correctly reduces a 12-spd enemy to 8 at 30% slow', () => {
    const statuses: CombatStatus[] = [{ id: 's1', kind: 'slow', roundsLeft: 2, magnitude: 0.3 }]
    expect(slowedSpd(12, statuses)).toBe(8)
  })
})

// ============================================================
// 10. Status interaction: hasStatus and statusesOf
// ============================================================

describe('hasStatus and statusesOf', () => {
  it('hasStatus returns true for a matching status', () => {
    const map: StatusMap = { tgt: [mkStatus('burn', 2)] }
    expect(hasStatus(map, 'tgt', 'burn')).toBe(true)
    expect(hasStatus(map, 'tgt', 'poison')).toBe(false)
  })

  it('statusesOf returns empty array for unknown id', () => {
    const map: StatusMap = { a: [mkStatus('sleep', 1)] }
    expect(statusesOf(map, 'missing')).toEqual([])
    expect(statusesOf(undefined, 'tgt')).toEqual([])
  })
})
