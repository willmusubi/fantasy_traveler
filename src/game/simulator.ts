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
  const maxPool = members.reduce((sum, s) => sum + s.maxHp, 0)
  let pool = maxPool
  let hp = enemy.maxHp
  let wipes = 0
  let patternIdx = 0

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
      if (hp <= 0) return { rounds: round, wipes, killed: true }
    }

    // Enemy: next rotation move against the pool (sturdiest-member vit as the soak).
    const pattern = enemy.pattern ?? [{ kind: 'attack' as const }]
    const move = pattern[patternIdx % pattern.length]
    patternIdx++
    const mult = move.mult ?? 1
    const sturdyVit = Math.max(...members.map((s) => s.vit))
    const hitOut = rollDamage({
      pow: enemy.atk * 1.25,
      power: mult,
      def: sturdyVit,
      attackerHit: enemy.hit ?? ENEMY_HIT(stage),
      targetEva: members[0].eva,
      roll, // enemies never crit (no skl)
    })
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
