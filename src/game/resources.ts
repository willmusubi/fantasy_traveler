// Pure helpers for per-character combat resources (current HP/MP). A MISSING entry in
// GameState.resources means "full" — so new characters, recruits, and pre-resource saves
// all read as full without any eager backfill.

import type { CharResource, Character, GameState } from '../domain/types'

/** Current HP/MP for a character; missing → full (max from the character's stats). */
export function resourceOf(gs: GameState, char: Character): CharResource {
  return gs.resources[char.id] ?? { hp: char.stats.maxHp, mp: char.stats.maxMp }
}

/** Clamp + round a resource to the character's [0, max] range. */
export function clampResource(r: CharResource, char: Character): CharResource {
  return {
    hp: Math.max(0, Math.min(char.stats.maxHp, Math.round(r.hp))),
    mp: Math.max(0, Math.min(char.stats.maxMp, Math.round(r.mp))),
  }
}

export function isDowned(gs: GameState, char: Character): boolean {
  return resourceOf(gs, char).hp <= 0
}
