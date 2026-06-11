// §27 FX director — the PURE mapping from a reducer effect batch to presentation cues.
// One cue = one beat of juice: a particle burst at an anchor, an optional screen shake,
// an optional synth SFX. BattleCanvas plays cues staggered; this module decides WHAT
// plays (trivially unit-testable), the canvas decides HOW.

import type { GameEffect, StatusKind } from '../../domain/types'
import type { SfxName } from '../../audio/sfx'

export interface FxCue {
  /** Particle recipe key (BattleCanvas maps it to a spawner). 'none' = SFX/shake only. */
  kind:
    | 'impact' | 'crit' | 'weak' | 'miss'
    | 'enemyHit' | 'enemyHeavy'
    | 'skill' | 'heal' | 'buff' | 'debuff'
    | 'status' | 'statusTick' | 'guard' | 'sleepZzz'
    | 'telegraph' | 'phase' | 'downed' | 'victory' | 'wipe' | 'levelup'
    | 'none'
  /** Combatant id whose DOM sprite anchors the burst (data-fx-anchor). Absent = stage center. */
  anchorId?: string
  /** Tint for kind-agnostic spawners (e.g. status puffs). */
  color?: number
  shake?: 'light' | 'heavy'
  flash?: boolean
  sfx?: SfxName
}

const STATUS_COLOR: Record<StatusKind, number> = {
  poison: 0x7ed957, burn: 0xff8a3d, regen: 0x5fd29a,
  sleep: 0x9aa7ff, paralysis: 0xffe14d, silence: 0xc9c9c9, slow: 0x8fd3ff,
  guard: 0x6fb1ff,
}

/** Map one dispatch's effects to an ordered cue list. Pure. */
export function cuesFor(effects: GameEffect[]): FxCue[] {
  const cues: FxCue[] = []
  let victoryCued = false
  for (const e of effects) {
    switch (e.type) {
      case 'damage':
        if (e.missed) cues.push({ kind: 'miss', anchorId: e.targetId, sfx: 'miss' })
        // fromSkill damage is covered by its paired skillCast cue (no double-burst).
        else if (!e.fromSkill) {
          if (e.crit) cues.push({ kind: 'crit', anchorId: e.targetId, flash: true, shake: 'light', sfx: 'crit' })
          else if (e.typeMult !== undefined && e.typeMult > 1) cues.push({ kind: 'weak', anchorId: e.targetId, sfx: 'weak' })
          else cues.push({ kind: 'impact', anchorId: e.targetId, sfx: 'hit' })
        }
        break
      case 'skillCast':
        if (e.skillKind === 'attack') {
          if (e.missed) cues.push({ kind: 'miss', anchorId: e.targetId, sfx: 'miss' })
          else cues.push({ kind: 'skill', anchorId: e.targetId, flash: e.crit, shake: e.crit ? 'light' : undefined, sfx: e.crit ? 'crit' : 'skill' })
        } else if (e.skillKind === 'heal') cues.push({ kind: 'heal', anchorId: e.targetId, sfx: 'heal' })
        else if (e.skillKind === 'buff') cues.push({ kind: 'buff', sfx: 'buff' })
        else cues.push({ kind: 'debuff', sfx: 'debuff' })
        break
      case 'heal':
        cues.push({ kind: 'heal', anchorId: e.targetId }) // skillCast already played the SFX
        break
      case 'enemyAttack':
        if (e.missed) cues.push({ kind: 'miss', anchorId: e.targetId, sfx: 'miss' })
        else if (e.heavy) cues.push({ kind: 'enemyHeavy', anchorId: e.targetId, shake: 'heavy', flash: true, sfx: 'heavy' })
        else cues.push({ kind: 'enemyHit', anchorId: e.targetId, shake: 'light', sfx: 'enemyhit' })
        break
      case 'enemyTelegraph':
        cues.push({ kind: 'telegraph', anchorId: e.enemyId, sfx: 'telegraph' })
        break
      case 'statusApplied':
        cues.push({
          kind: e.kind === 'sleep' ? 'sleepZzz' : 'status',
          anchorId: e.targetId, color: STATUS_COLOR[e.kind], sfx: e.kind === 'sleep' ? 'sleep' : 'status',
        })
        break
      case 'statusTick':
        cues.push({ kind: 'statusTick', anchorId: e.targetId, color: STATUS_COLOR[e.kind] })
        break
      case 'statusSkipped':
        cues.push({ kind: 'sleepZzz', anchorId: e.targetId, color: STATUS_COLOR[e.kind] })
        break
      case 'guarded':
        cues.push({ kind: 'guard', anchorId: e.characterId, color: STATUS_COLOR.guard, sfx: 'guard' })
        break
      case 'bossPhase':
        cues.push({ kind: 'phase', anchorId: e.enemyId, shake: 'heavy', flash: true, sfx: 'phase' })
        break
      case 'downed':
        cues.push({ kind: 'downed', anchorId: e.characterId, sfx: 'downed' })
        break
      case 'partyWiped':
        cues.push({ kind: 'wipe', flash: true, shake: 'heavy', sfx: 'wipe' })
        break
      case 'victory':
      case 'encounterCleared':
        if (!victoryCued) { cues.push({ kind: 'victory', sfx: 'victory' }); victoryCued = true }
        break
      case 'questCompleted':
        cues.push({ kind: 'victory', sfx: 'fanfare' })
        break
      case 'charXp':
        if (e.levelsGained > 0) cues.push({ kind: 'levelup', anchorId: e.characterId, sfx: 'levelup' })
        break
      // affinity / mood / monsterGrew / equipmentGranted / recruited / script* → toasts/modals
      // already carry them; no stage juice.
    }
  }
  return cues
}
