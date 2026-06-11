// §25 balance simulator core. Pure + seeded — used by scripts/sim-balance.ts (the
// human-readable TTK report) and sim.guard.test.ts (CI bounds assertions). NOT imported
// by the app. Models the productivity loop conservatively: 3 members, basic attacks
// only (no skills/laps — the HP budget's ENGAGEMENT_FACTOR covers those), med-priority
// tasks, enemy on its §25 move rotation, wipe = revive 40% + enemy heals 30%.

import {
  BOSS_HEAVY_POOL_CAP, ENEMY_HIT, NEUTRAL_PRIORITY_MULT,
  PROFILE_TEMPLATES, WEAPON_CATEGORY, clampStage,
} from '../domain/config'
import type { EnemyArchetype, StatProfile } from '../domain/types'
import { rollDamage } from './damage'
import { statsForProfileAtLevel } from './leveling'
import { spawnMonster } from './combat'

/** mulberry32 — tiny seeded PRNG for reproducible runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FightSpec {
  level: number
  archetype: EnemyArchetype
  /** true = the player solves the puzzle: weakness-matched weapon + element advantage. */
  exploit: boolean
  seed: number
  maxRounds?: number
  /** Enemy skips its swing AND patternIdx is frozen for the first N rounds (models a sleep window). */
  sleepRounds?: number
  /** Boss phase transitions: models atkBoost + pattern swap when hp crosses a threshold.
   *  Authored DESCENDING by triggerHpPct — same ordering contract as BossPhase[]. */
  phases?: { triggerHpPct: number; atkBoost?: number; newPattern?: { kind: 'attack' | 'heavy'; mult?: number; telegraph?: boolean }[] }[]
  /** Scale the party pool down (0 < x ≤ 1) to simulate a punishing difficulty tier where
   *  wipes become likely.  Default 1 (no change). Useful in test scenarios that need sleep to
   *  have a measurable TTK impact. */
  poolScale?: number
}

export interface FightResult {
  /** Rounds (real tasks) until the kill; maxRounds if it never lands. */
  rounds: number
  wipes: number
  killed: boolean
}

interface SimMember {
  profile: StatProfile
  weaponStr: number
}

const PARTY: SimMember[] = [
  { profile: PROFILE_TEMPLATES.balanced, weaponStr: 2 }, // traveler + starter blade
  { profile: PROFILE_TEMPLATES.attacker, weaponStr: 3 }, // main attacker
  { profile: PROFILE_TEMPLATES.support, weaponStr: 1 }, // support (swings, no heals modeled)
]

export function simulateFight(spec: FightSpec): FightResult {
  const roll = mulberry32(spec.seed)
  const maxRounds = spec.maxRounds ?? 99
  const stage = clampStage(spec.level - 1)
  const enemy = spawnMonster(stage, 0, () => 'sim', spec.archetype)
  // Quest-style identity so exploit mode has a puzzle to hit (the bare 心魔 is neutral).
  enemy.element = 'metal'
  enemy.physWeak = ['slash']

  const members = PARTY.map((m) => {
    const s = statsForProfileAtLevel(m.profile, spec.level)
    return { ...s, str: s.str + m.weaponStr }
  })
  const maxPool = Math.round(members.reduce((sum, s) => sum + s.maxHp, 0) * (spec.poolScale ?? 1))
  let pool = maxPool
  let hp = enemy.maxHp
  let wipes = 0
  let patternIdx = 0
  let enemyAtk = enemy.atk
  // Phase tracking: work from a sorted-descending copy; fired phases are removed.
  const pendingPhases = spec.phases
    ? [...spec.phases].sort((a, b) => b.triggerHpPct - a.triggerHpPct)
    : []
  let activePattern: { kind: 'attack' | 'heavy'; mult?: number }[] = enemy.pattern ?? [{ kind: 'attack' as const }]

  for (let round = 1; round <= maxRounds; round++) {
    // Party: one basic attack per member (med priority), best offensive stat.
    for (const s of members) {
      const usesMagic = s.wis > s.str
      const out = rollDamage({
        pow: usesMagic ? s.wis : s.str,
        power: NEUTRAL_PRIORITY_MULT,
        def: usesMagic ? (enemy.mdef ?? enemy.def) : enemy.def,
        attackerHit: s.hit,
        targetEva: enemy.eva ?? 6,
        attackerSkl: s.skl,
        physKind: spec.exploit ? 'slash' : usesMagic ? WEAPON_CATEGORY.rod : undefined,
        attackerElement: spec.exploit ? 'fire' : undefined, // 火克金
        targetElement: enemy.element,
        targetWeak: spec.exploit ? enemy.physWeak : undefined,
        targetResist: spec.exploit ? enemy.physResist : undefined,
        roll,
      })
      hp -= out.dmg
      // Check phase transitions after each damaging hit (mirrors checkBossPhases).
      while (pendingPhases.length > 0 && hp > 0 && hp / enemy.maxHp <= pendingPhases[0].triggerHpPct) {
        const phase = pendingPhases.shift()!
        if (phase.atkBoost) enemyAtk += phase.atkBoost
        if (phase.newPattern && phase.newPattern.length > 0) {
          activePattern = phase.newPattern.map((m) => ({ kind: m.kind, ...(m.mult !== undefined ? { mult: m.mult } : {}) }))
          patternIdx = 0
        }
      }
      if (hp <= 0) return { rounds: round, wipes, killed: true }
    }

    // Enemy: next rotation move against the pool (sturdiest-member vit as the soak).
    // During the sleep window: patternIdx is frozen AND the attack resolves to 0 damage.
    // RNG is still consumed to keep downstream sequences comparable (avoids artifactual TTK inversions).
    const sleeping = spec.sleepRounds !== undefined && round <= spec.sleepRounds
    const move = activePattern[patternIdx % activePattern.length]
    if (!sleeping) patternIdx++ // sleep freezes the rotation index
    const mult = move.mult ?? 1
    const sturdyVit = Math.max(...members.map((s) => s.vit))
    const hitOut = rollDamage({
      pow: enemyAtk * 1.25,
      power: mult,
      def: sturdyVit,
      attackerHit: enemy.hit ?? ENEMY_HIT(stage),
      targetEva: members[0].eva,
      roll, // enemies never crit (no skl)
    })
    if (!sleeping) {
      let dmg = hitOut.dmg
      if (spec.archetype === 'boss' && move.kind === 'heavy' && mult >= 2) {
        dmg = Math.min(dmg, Math.round(pool * BOSS_HEAVY_POOL_CAP)) // §25 heavy cap
      }
      pool -= dmg
      if (pool <= 0) {
        wipes++
        pool = Math.round(maxPool * 0.4)
        hp = Math.min(enemy.maxHp, Math.round(hp + enemy.maxHp * 0.3))
        patternIdx = 0 // §25: rotation resets off the heavy slot on a wipe
      }
    }
  }
  return { rounds: maxRounds, wipes, killed: false }
}

export interface Summary {
  mean: number
  p90: number
  wipeRate: number
  killRate: number
}

export function summarize(
  level: number, archetype: EnemyArchetype, exploit: boolean, runs = 200, seedBase = 1,
): Summary {
  const rounds: number[] = []
  let wipes = 0
  let kills = 0
  for (let i = 0; i < runs; i++) {
    const r = simulateFight({ level, archetype, exploit, seed: seedBase + i * 7919 })
    rounds.push(r.rounds)
    if (r.wipes > 0) wipes++
    if (r.killed) kills++
  }
  rounds.sort((a, b) => a - b)
  return {
    mean: rounds.reduce((s, x) => s + x, 0) / runs,
    p90: rounds[Math.floor(runs * 0.9)],
    wipeRate: wipes / runs,
    killRate: kills / runs,
  }
}

/** Like summarize but accepts a full FightSpec overlay for the additive sim extensions
 *  (sleepRounds, phases, etc.). Default behavior is byte-identical to summarize(). */
export function summarizeSpec(
  base: Omit<FightSpec, 'seed'>, runs = 200, seedBase = 1,
): Summary {
  const rounds: number[] = []
  let wipes = 0
  let kills = 0
  for (let i = 0; i < runs; i++) {
    const r = simulateFight({ ...base, seed: seedBase + i * 7919 })
    rounds.push(r.rounds)
    if (r.wipes > 0) wipes++
    if (r.killed) kills++
  }
  rounds.sort((a, b) => a - b)
  return {
    mean: rounds.reduce((s, x) => s + x, 0) / runs,
    p90: rounds[Math.floor(runs * 0.9)],
    wipeRate: wipes / runs,
    killRate: kills / runs,
  }
}
