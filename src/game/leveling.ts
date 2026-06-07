// Pure leveling math (§21). Builds class stat blocks and applies XP gains.

import { CLASS_DEFS, xpForLevel } from '../domain/config'
import type { Character, ClassId, Stats } from '../domain/types'

/** Build a Stats block for a class at a given level (level 1 = base). */
export function statsForClassAtLevel(classId: ClassId, level: number): Stats {
  const def = CLASS_DEFS[classId]
  const steps = Math.max(0, level - 1)
  return {
    level,
    xp: 0,
    maxHp: def.base.maxHp + def.growth.maxHp * steps,
    maxMp: def.base.maxMp + def.growth.maxMp * steps,
    atk: def.base.atk + def.growth.atk * steps,
    def: def.base.def + def.growth.def * steps,
    spd: def.base.spd + def.growth.spd * steps,
    mag: def.base.mag + def.growth.mag * steps,
  }
}

/** Backfill stat fields added after a character was first saved (e.g. maxMp) using
 *  the class's level-appropriate value. Read-time + idempotent, like the gameState
 *  defaults — so a pre-MP save never feeds undefined into combat or the UI. */
export function withStatsDefaults(c: Character): Character {
  if (c.stats.maxMp != null) return c
  const ref = statsForClassAtLevel(c.classId, c.stats.level)
  return { ...c, stats: { ...c.stats, maxMp: ref.maxMp } }
}

export interface LevelUpResult {
  stats: Stats
  levelsGained: number
}

/**
 * Add XP and resolve any level-ups, applying class growth per level.
 * Pure: returns new stats; never mutates the input.
 */
export function applyXp(stats: Stats, classId: ClassId, amount: number): LevelUpResult {
  const growth = CLASS_DEFS[classId].growth
  let { level, xp, maxHp, maxMp, atk, def, spd, mag } = stats
  xp += amount
  let levelsGained = 0

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level)
    level += 1
    levelsGained += 1
    maxHp += growth.maxHp
    maxMp += growth.maxMp
    atk += growth.atk
    def += growth.def
    spd += growth.spd
    mag += growth.mag
  }

  return { stats: { level, xp, maxHp, maxMp, atk, def, spd, mag }, levelsGained }
}
