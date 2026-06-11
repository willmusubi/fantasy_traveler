// §32 — the PURE mapping from a reducer effect batch to a scene TIMELINE: who lunges, who
// flashes, when the particles pop, when the camera punches. Parallel to cuesFor (§27) and
// built ON it — each effect's particle/SFX/shake recipe comes from cuesFor([e]), so the two
// presentation layers can never disagree about what a crit looks like.
//
// Two modes, per the productivity-first principle:
//   'full'      — step-through path: every action gets its complete beat.
//   'highlight' — sync path (auto players): mandatory moments (crit/拔群/heavy/boss phase/
//                 downed/victory/duo/wipe) play complete; filler collapses to 80ms ticks;
//                 the whole reel is compressed to ≤ 2.5s. State is ALREADY resolved before
//                 any of this plays — the timeline is a non-blocking replay.

import type { GameEffect } from '../../../domain/types'
import { cuesFor, type FxCue } from '../fxDirector'

export type SceneAction =
  /** Particle burst + SFX + shake/flash — the existing §27 cue, scheduled on the timeline. */
  | { at: number; kind: 'cue'; cue: FxCue }
  /** Figure dash toward the opposing side (stage resolves direction from the actor's side). */
  | { at: number; kind: 'lunge'; actorId: string }
  /** Figure white-out + knockback (direction away from its own side). */
  | { at: number; kind: 'hit'; actorId: string }
  /** Cast wind-up lean. */
  | { at: number; kind: 'casting'; actorId: string; seconds: number }
  /** Keel over (persists). */
  | { at: number; kind: 'downed'; actorId: string }
  /** Whole party victory hop. */
  | { at: number; kind: 'victory' }
  /** Brief color cast on one figure. */
  | { at: number; kind: 'tint'; actorId: string; color: number; seconds: number }
  /** Camera punch — a CSS zoom class on .stage-scene so DOM UI and canvas zoom together. */
  | { at: number; kind: 'camera'; preset: 'punchLight' | 'punchHeavy' }

export interface SceneTimeline {
  actions: SceneAction[]
  /** Seconds until the last action FIRES (figure tweens may trail ~0.4s past it). */
  total: number
}

export type ChoreographyMode = 'full' | 'highlight'

export const HIGHLIGHT_MAX_SECONDS = 2.5
const FILLER_BEAT = 0.08

/** The moments an auto player still deserves to SEE (everything else is filler). */
function isMandatory(e: GameEffect): boolean {
  switch (e.type) {
    case 'damage':
      return !e.missed && !e.fromSkill && (Boolean(e.crit) || (e.typeMult !== undefined && e.typeMult > 1))
    case 'skillCast':
      return e.skillKind === 'attack' && Boolean(e.crit)
    case 'enemyAttack':
      return Boolean(e.heavy)
    case 'bossPhase':
    case 'downed':
    case 'partyWiped':
    case 'victory':
    case 'encounterCleared':
    case 'questCompleted':
    case 'duoSkillCast':
      return true
    default:
      return false
  }
}

/** Dedup victory-family effects the way cuesFor does across a whole batch. */
function dedupVictories(effects: GameEffect[]): GameEffect[] {
  let seen = false
  return effects.filter((e) => {
    if (e.type !== 'victory' && e.type !== 'encounterCleared') return true
    if (seen) return false
    seen = true
    return true
  })
}

/** Append one effect's beat at cursor `t`; returns how far the cursor advances. */
function appendBeat(out: SceneAction[], e: GameEffect, t: number, full: boolean): number {
  const cues = cuesFor([e])
  const cueAt = (offset: number) => {
    for (const cue of cues) out.push({ at: t + offset, kind: 'cue', cue })
  }
  if (!full) {
    // Filler tick: particles/SFX only, no figure choreography.
    cueAt(0)
    return cues.length > 0 ? FILLER_BEAT : 0
  }
  switch (e.type) {
    case 'damage': {
      if (e.fromSkill) return 0 // the paired skillCast owns this beat (cuesFor already mutes it)
      out.push({ at: t, kind: 'lunge', actorId: e.actorId })
      cueAt(0.15)
      if (!e.missed) {
        out.push({ at: t + 0.15, kind: 'hit', actorId: e.targetId })
        if (e.crit) out.push({ at: t + 0.15, kind: 'camera', preset: 'punchLight' })
      }
      return e.crit ? 0.65 : 0.5
    }
    case 'skillCast': {
      out.push({ at: t, kind: 'casting', actorId: e.casterId, seconds: 0.22 })
      cueAt(0.24)
      if (e.skillKind === 'attack' && !e.missed && e.targetId) {
        out.push({ at: t + 0.24, kind: 'hit', actorId: e.targetId })
        if (e.crit) out.push({ at: t + 0.24, kind: 'camera', preset: 'punchLight' })
      }
      if (e.skillKind === 'debuff' && e.targetId) {
        out.push({ at: t + 0.28, kind: 'tint', actorId: e.targetId, color: 0xb48fff, seconds: 0.3 })
      }
      return 0.6
    }
    case 'heal':
      cueAt(0)
      return 0.15
    case 'enemyAttack': {
      // enemyId is §32-optional: sourceless penalty hits (and pre-§32 replays) skip the lunge.
      if (e.enemyId) out.push({ at: t, kind: 'lunge', actorId: e.enemyId })
      const impact = e.enemyId ? 0.18 : 0
      cueAt(impact)
      if (!e.missed) {
        out.push({ at: t + impact, kind: 'hit', actorId: e.targetId })
        if (e.heavy) out.push({ at: t + impact, kind: 'camera', preset: 'punchHeavy' })
      }
      return e.heavy ? 0.7 : 0.55
    }
    case 'enemyTelegraph':
      out.push({ at: t, kind: 'casting', actorId: e.enemyId, seconds: 0.4 })
      cueAt(0)
      return 0.35
    case 'statusApplied':
      cueAt(0)
      out.push({ at: t + 0.05, kind: 'tint', actorId: e.targetId, color: cues[0]?.color ?? 0xb48fff, seconds: 0.25 })
      return 0.25
    case 'counter': {
      out.push({ at: t, kind: 'lunge', actorId: e.characterId })
      cueAt(0.15)
      out.push({ at: t + 0.15, kind: 'hit', actorId: e.targetId })
      return 0.45
    }
    case 'duoSkillCast': {
      out.push({ at: t, kind: 'casting', actorId: e.casterIds[0], seconds: 0.25 })
      out.push({ at: t, kind: 'casting', actorId: e.casterIds[1], seconds: 0.25 })
      cueAt(0.27)
      if (e.targetId && !e.missed) out.push({ at: t + 0.27, kind: 'hit', actorId: e.targetId })
      out.push({ at: t + 0.27, kind: 'camera', preset: 'punchLight' })
      return 0.7
    }
    case 'bossPhase':
      cueAt(0)
      out.push({ at: t, kind: 'camera', preset: 'punchHeavy' })
      out.push({ at: t + 0.1, kind: 'tint', actorId: e.enemyId, color: 0xff5a4c, seconds: 0.5 })
      return 0.8
    case 'downed':
      cueAt(0)
      out.push({ at: t, kind: 'downed', actorId: e.characterId })
      return 0.5
    case 'partyWiped':
      cueAt(0)
      out.push({ at: t, kind: 'camera', preset: 'punchHeavy' })
      return 0.8
    case 'victory':
    case 'encounterCleared':
      cueAt(0)
      out.push({ at: t, kind: 'victory' })
      return 0.9
    case 'questCompleted':
      cueAt(0)
      return 0.6
    default:
      // Everything else (status ticks, guards, XP pings…) is a plain cue beat.
      cueAt(0)
      return cues.length > 0 ? 0.25 : 0
  }
}

/** Map one dispatch's effects to a scene timeline. Pure. */
export function choreographFor(effects: GameEffect[], mode: ChoreographyMode): SceneTimeline {
  const deduped = dedupVictories(effects)
  const actions: SceneAction[] = []
  let t = 0
  for (const e of deduped) {
    const full = mode === 'full' || isMandatory(e)
    t += appendBeat(actions, e, t, full)
  }
  // Auto players asked for a highlight reel, not a feature film: compress past the cap.
  if (mode === 'highlight' && t > HIGHLIGHT_MAX_SECONDS) {
    const scale = HIGHLIGHT_MAX_SECONDS / t
    for (const a of actions) a.at *= scale
    t = HIGHLIGHT_MAX_SECONDS
  }
  return { actions, total: t }
}
