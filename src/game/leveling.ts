// Pure leveling math (§21, §25). Builds profile stat blocks and applies XP gains.
// The class system is gone — stats derive from per-character StatProfiles.

import { CLASS_TEMPLATE_MAP, MAX_LEVEL, PROFILE_TEMPLATES, xpForLevel } from '../domain/config'
import type { ClassId, StatProfile, Stats } from '../domain/types'

/** Build a Stats block for a profile at a given level (level 1 = base; clamped to MAX_LEVEL). */
export function statsForProfileAtLevel(profile: StatProfile, level: number): Stats {
  const lv = Math.min(Math.max(1, level), MAX_LEVEL)
  const steps = lv - 1
  const { base, growth } = profile
  return {
    level: lv,
    xp: 0,
    maxHp: base.maxHp + growth.maxHp * steps,
    maxMp: base.maxMp + growth.maxMp * steps,
    str: base.str + growth.str * steps,
    vit: base.vit + growth.vit * steps,
    wis: base.wis + growth.wis * steps,
    spr: base.spr + growth.spr * steps,
    spd: base.spd + growth.spd * steps,
    skl: base.skl + growth.skl * steps,
    hit: base.hit + growth.hit * steps,
    eva: base.eva + growth.eva * steps,
  }
}

/** @deprecated §25 legacy shim — classId resolves to its profile TEMPLATE. Kept for
 *  test fixtures and any straggler content still authoring classIds. */
export function statsForClassAtLevel(classId: ClassId, level: number): Stats {
  return statsForProfileAtLevel(PROFILE_TEMPLATES[CLASS_TEMPLATE_MAP[classId] ?? 'balanced'], level)
}

export interface LevelUpResult {
  stats: Stats
  levelsGained: number
}

/**
 * Add XP and resolve any level-ups, applying profile growth per level. Hard-capped at
 * MAX_LEVEL — overflow XP at the cap is discarded (bounded curves by construction).
 * Pure: returns new stats; never mutates the input.
 */
export function applyXp(stats: Stats, profile: StatProfile, amount: number): LevelUpResult {
  const g = profile.growth
  let { level, xp, maxHp, maxMp, str, vit, wis, spr, spd, skl, hit, eva } = stats
  xp += amount
  let levelsGained = 0

  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level)
    level += 1
    levelsGained += 1
    maxHp += g.maxHp
    maxMp += g.maxMp
    str += g.str
    vit += g.vit
    wis += g.wis
    spr += g.spr
    spd += g.spd
    skl += g.skl
    hit += g.hit
    eva += g.eva
  }
  if (level >= MAX_LEVEL) xp = 0 // cap reached — discard overflow

  return { stats: { level, xp, maxHp, maxMp, str, vit, wis, spr, spd, skl, hit, eva }, levelsGained }
}
