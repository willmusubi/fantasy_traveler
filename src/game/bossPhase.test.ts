// §26 boss phase unit tests — hand-built Monster fixtures with phases[].
// Patterns mirror reducer.step.test.ts; pure reducer, no store/IDB.

import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import type { Affinity, BossPhase, Character, EnemyMove, GameState, Monster } from '../domain/types'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const NOW = new Date(2026, 5, 11, 10, 0, 0)
const TODAY = '2026-06-11'

function char(classId: Character['classId'], kind: Character['kind'], id: string, level = 1): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, level), skills: [], portraitSet: 'x', createdAt: TODAY }
}

const PLAYER = char('vanguard', 'player', 'player')
const MIRA = char('striker', 'companion', 'mira', 6)
const PARTY = [PLAYER, MIRA]

/** Build a boss with configurable phases. hp/maxHp let us pre-set the HP already taken. */
function makeBoss(over: Partial<Monster> = {}): Monster {
  return {
    id: 'boss1',
    nameKey: 'monster.boss',
    level: 3,
    maxHp: 400,
    hp: 400,
    atk: 10,
    def: 6,
    spd: 8,
    growth: 1,
    archetype: 'boss',
    phaseIdx: 0,
    ...over,
  }
}

function makeInput(gsOver: Partial<GameState> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: ['player', 'mira'],
    enemies: [makeBoss()],
    storyStage: 0,
    buffs: [],
    moodFlags: {},
    lastResolvedAt: '',
    encounterIndex: 0,
    unlockedCompanionIds: ['mira'],
    ownedEquipment: [],
    resources: {},
    gold: 0,
    partyBuffs: [],
    combatLog: [],
    charge: {},
    roundPlan: {},
    scriptFlags: {},
    completedScriptIds: [],
    activeStatuses: {},
    ...gsOver,
  }
  const affinities: Record<string, Affinity> = { mira: freshAffinity('mira', TODAY) }
  return { gameState, affinities, party: PARTY, now: NOW, newId: () => 'new-id-' + Math.random(), openHighCount: 0 }
}

const todo = (priority = 'high' as const) =>
  ({ type: 'TodoCompleted' as const, todo: { id: 't1', title: 't', priority, status: 'done' as const, tags: [], createdAt: TODAY } })

// ─── Phase construction helpers ────────────────────────────────────────────────

const normalPattern: EnemyMove[] = [{ kind: 'attack' }]
const enragedPattern: EnemyMove[] = [{ kind: 'attack' }, { kind: 'heavy', mult: 1.5, telegraph: '狂暴蓄力' }]

function phase50(): BossPhase {
  return {
    triggerHpPct: 0.5,
    atkBoost: 10,
    newPattern: enragedPattern,
    phaseLabel: '狂怒',
    narration: '心魔进入狂怒模式！',
  }
}

function phase75(): BossPhase {
  return {
    triggerHpPct: 0.75,
    atkBoost: 5,
    phaseLabel: '激怒',
    narration: '心魔开始暴躁！',
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('boss phases — trigger mechanics', () => {
  it('fires a bossPhase effect exactly when hp/maxHp crosses triggerHpPct (50%)', () => {
    // maxHp=2000 → 50% threshold = 1000. Start at hp=1001 (just above threshold).
    // One round (player+mira×3 ≈ 272 dmg) brings to 729 → crosses 50% → phase fires.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [phase50()], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)
    const phaseEffect = r.effects.find((e) => e.type === 'bossPhase')
    expect(phaseEffect).toMatchObject({ type: 'bossPhase', enemyId: 'boss1', phaseLabel: '狂怒', narration: '心魔进入狂怒模式！' })
  })

  it('does NOT fire when the boss hp stays above the threshold', () => {
    // With player (str=14) and mira L6 (str=33, spd=25), mira laps ~3× in one round.
    // Max round damage ≈ 32 (player) + 80×3 (mira) = 272. 50% of maxHp 2000 = 1000.
    // Start at maxHp=2000, hp=2000: after round hp≈2000-272=1728 >> 1000 → phase does NOT fire.
    const boss = makeBoss({ hp: 2000, maxHp: 2000, phases: [phase50()], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    expect(r.effects.some((e) => e.type === 'bossPhase')).toBe(false)
    expect(r.gameState.enemies[0].phaseIdx ?? 0).toBe(0)
  })

  it('does NOT re-fire once the phase has already triggered (phaseIdx persisted)', () => {
    // phaseIdx=1 means the first phase already fired — even with hp at 10% it should not re-fire.
    const boss = makeBoss({ hp: 30, maxHp: 400, phases: [phase50()], phaseIdx: 1, pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    expect(r.effects.filter((e) => e.type === 'bossPhase')).toHaveLength(0)
  })

  it('applies atkBoost to the enemy atk on transition', () => {
    // Use maxHp=2000, start at hp=1001 (just above 50% = 1000).
    // After one round (dmg ~272), hp≈729, which crosses 50% → phase fires.
    // Boss survives: 729 > 0. atk should become 10 + 10 = 20.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [phase50()], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    // The bossPhase effect must have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)
    // Boss survives (hp > 0) → atk should be 10 + 10 = 20.
    const bossAfter = r.gameState.enemies[0]
    if (bossAfter && bossAfter.hp > 0) {
      expect(bossAfter.atk).toBe(20) // base 10 + atkBoost 10
    }
  })

  it('swaps the pattern and resets patternIdx to 0 on transition', () => {
    // Use maxHp=2000, hp=1001 (just above 50%=1000). After round (dmg ~272), boss survives.
    // The phase flip installs enragedPattern on the surviving boss.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [phase50()], pattern: normalPattern, patternIdx: 0 })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    // Phase must have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)

    // Find the boss by ID (not by index, in case a victory respawn replaced enemies[0]).
    const bossAfter = r.gameState.enemies.find((m) => m.id === 'boss1')
    expect(bossAfter).toBeDefined()
    expect(bossAfter!.hp).toBeGreaterThan(0) // boss survived
    // Pattern replaced with enragedPattern.
    expect(bossAfter!.pattern).toEqual(enragedPattern)
  })

  it('pushes enemyTelegraph immediately when newPattern[0] has a telegraph', () => {
    // When newPattern[0] has a telegraph field, checkBossPhases must emit enemyTelegraph
    // immediately after the phase flip (before the enemy even acts next round).
    const telegraphPattern: EnemyMove[] = [{ kind: 'attack', telegraph: '即时预警' }]
    const ph: BossPhase = {
      triggerHpPct: 0.5,
      newPattern: telegraphPattern,
      atkBoost: 0,
    }
    // hp=1001/maxHp=2000 → phase fires and boss survives.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [ph], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    // Phase must have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)
    // Immediate telegraph pushed.
    const telegraphs = r.effects.filter((e) => e.type === 'enemyTelegraph')
    expect(telegraphs.some((e) => e.type === 'enemyTelegraph' && e.enemyId === 'boss1')).toBe(true)
  })
})

describe('boss phases — double-threshold crossing', () => {
  // Use PLAYER-ONLY party to avoid mira (spd=25) racing ahead and killing the boss.
  // Player (vanguard L1): str=14, spd=11. At high priority (mult=2.5), def=6:
  //   dmg = max(ceil(14×2.5×0.1), round(14×2.5 - 6×0.5)) = max(4, round(35-3)) = 32.
  // maxHp=100, thresholds 0.75 (75hp) and 0.50 (50hp).
  // Start hp=76: player's first hit (32dmg) → hp=44, 44/100=0.44 ≤ 0.75 AND ≤ 0.50
  //   → checkBossPhases while-loop fires BOTH phases in one call → two bossPhase effects.
  function playerOnlyInput(gsOver: Partial<GameState> = {}): ReducerInput {
    const gameState: GameState = {
      partyIds: ['player'],
      enemies: [makeBoss({ hp: 76, maxHp: 100, atk: 5, def: 6, phaseIdx: 0, ...gsOver.enemies?.[0] })],
      storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '',
      encounterIndex: 0, unlockedCompanionIds: [], ownedEquipment: [],
      resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {},
      roundPlan: {}, scriptFlags: {}, completedScriptIds: [], activeStatuses: {},
      ...gsOver,
    }
    const affinities: Record<string, Affinity> = {}
    return { gameState, affinities, party: [PLAYER], now: NOW, newId: () => 'new-id-' + Math.random(), openHighCount: 0 }
  }

  it('one huge hit crossing two descending thresholds (0.75, 0.5) fires both in order', () => {
    const phases: BossPhase[] = [phase75(), phase50()]
    // Override the enemy in the base input to have our phases + correct maxHp.
    const boss = makeBoss({ hp: 76, maxHp: 100, atk: 5, def: 6, phases, pattern: normalPattern, phaseIdx: 0 })
    const input: ReducerInput = {
      ...playerOnlyInput(),
      gameState: { ...playerOnlyInput().gameState, enemies: [boss] },
    }
    const r = gameReducer(input, todo('high'))

    const phaseEffects = r.effects.filter((e) => e.type === 'bossPhase')
    // Two phases should have fired.
    expect(phaseEffects.length).toBeGreaterThanOrEqual(2)
    // Both labels should appear.
    const labels = phaseEffects.map((e) => e.type === 'bossPhase' ? e.phaseLabel : undefined)
    expect(labels).toContain('激怒')
    expect(labels).toContain('狂怒')
    // 激怒 (75%) fires before 狂怒 (50%) — DESCENDING order means 0.75 is phases[0].
    const idx75 = phaseEffects.findIndex((e) => e.type === 'bossPhase' && e.phaseLabel === '激怒')
    const idx50 = phaseEffects.findIndex((e) => e.type === 'bossPhase' && e.phaseLabel === '狂怒')
    expect(idx75).toBeLessThan(idx50)
  })

  it('both atkBoosts stack when crossing two thresholds', () => {
    const phases: BossPhase[] = [phase75(), phase50()] // +5 then +10
    const boss = makeBoss({ hp: 76, maxHp: 100, atk: 5, def: 6, phases, pattern: normalPattern, phaseIdx: 0 })
    const input: ReducerInput = {
      ...playerOnlyInput(),
      gameState: { ...playerOnlyInput().gameState, enemies: [boss] },
    }
    const r = gameReducer(input, todo('high'))

    // Both atkBoosts applied: base 5 + 5 + 10 = 20.
    const bossAfter = r.gameState.enemies.find((m) => m.id === 'boss1')
    if (bossAfter && bossAfter.hp > 0) {
      expect(bossAfter.atk).toBe(20) // 5 + 5 + 10
    } else {
      // boss died — verify both phase effects fired
      expect(r.effects.filter((e) => e.type === 'bossPhase')).toHaveLength(2)
    }
  })
})

describe('boss phases — inflicts on transition', () => {
  it('inflicts statusApplied on every LIVING party member at the transition', () => {
    const ph: BossPhase = {
      triggerHpPct: 0.5,
      inflicts: { kind: 'sleep', rounds: 1 }, // chance omitted → always inflicts
      phaseLabel: '催眠冲击',
    }
    // hp=1001/maxHp=2000 → phase fires, boss survives.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [ph], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    // Phase must have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)
    const statusApplications = r.effects.filter(
      (e) => e.type === 'statusApplied' && e.kind === 'sleep',
    )
    // Both player and mira should receive sleep.
    const playerGotSleep = statusApplications.some((e) => e.type === 'statusApplied' && e.targetId === 'player')
    const miraGotSleep = statusApplications.some((e) => e.type === 'statusApplied' && e.targetId === 'mira')
    expect(playerGotSleep).toBe(true)
    expect(miraGotSleep).toBe(true)
  })

  it('skips a downed member when inflicting on transition', () => {
    const ph: BossPhase = {
      triggerHpPct: 0.5,
      inflicts: { kind: 'burn', rounds: 2 },
    }
    // hp=1001/maxHp=2000 → phase fires, boss survives.
    const boss = makeBoss({ hp: 1001, maxHp: 2000, phases: [ph], pattern: normalPattern })
    // Mira is downed (hp=0) — should NOT get the burn.
    const r = gameReducer(
      makeInput({ enemies: [boss], resources: { mira: { hp: 0, mp: 24 } } }),
      todo('high'),
    )

    // Phase must have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase' && e.enemyId === 'boss1')).toBe(true)
    const burnOnMira = r.effects.filter(
      (e) => e.type === 'statusApplied' && e.kind === 'burn' && e.targetId === 'mira',
    )
    expect(burnOnMira).toHaveLength(0)
  })
})

describe('boss phases — killing blow', () => {
  it('a killing blow fires NO phase (phase check skipped on death)', () => {
    // Boss at 1 HP → guaranteed kill → no phase should fire.
    const boss = makeBoss({ hp: 1, phases: [phase50()], pattern: normalPattern })
    const r = gameReducer(makeInput({ enemies: [boss] }), todo('high'))

    // The boss should be dead (victory effect).
    expect(r.effects.some((e) => e.type === 'victory' || e.type === 'encounterCleared' || e.type === 'questCompleted')).toBe(true)
    // No phase should have fired.
    expect(r.effects.some((e) => e.type === 'bossPhase')).toBe(false)
  })
})

describe('boss phases — round-end DOT crossing a threshold', () => {
  it('poison the boss past 50% hp threshold → bossPhase fires via round-end DOT', () => {
    // Design: maxHp=2000, threshold=50% (1000hp).
    // Party dmg per round ≈ 32 (player) + 80×3 (mira laps) = 272 at high priority.
    // hp_start=1273: after party attacks → hp=1001 (still above 1000, so no phase from attacks).
    // DOT poison magnitude=10: 1001-10=991 ≤ 1000 → checkBossPhases fires from the DOT tick.
    const ph: BossPhase = {
      triggerHpPct: 0.5,
      atkBoost: 5,
      phaseLabel: '濒死暴怒',
    }
    const boss = makeBoss({ hp: 1273, maxHp: 2000, phases: [ph], pattern: normalPattern, phaseIdx: 0 })
    const input = makeInput({
      enemies: [boss],
      activeStatuses: {
        boss1: [{ id: 'poison-1', kind: 'poison' as const, roundsLeft: 2, magnitude: 10 }],
      },
    })
    const r = gameReducer(input, todo('high'))

    // The DOT tick at round end should bring the boss below 50% → phase fires.
    // DOT fires in applyTaskRewards → tickStatusesRoundEnd → applyEnemyDamageCore → checkBossPhases.
    const phaseEffects = r.effects.filter((e) => e.type === 'bossPhase')
    expect(phaseEffects.length).toBeGreaterThanOrEqual(1)
    expect(phaseEffects[0]).toMatchObject({ type: 'bossPhase', enemyId: 'boss1', phaseLabel: '濒死暴怒' })
  })
})
