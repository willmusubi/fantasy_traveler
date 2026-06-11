// §27 — the FX director is the PURE seam between reducer effects and stage juice.
// These tests pin the effect→cue mapping; the canvas/SFX layers are presentation-only
// consumers and stay untested by design (no WebGL/WebAudio in jsdom).

import { describe, expect, it } from 'vitest'
import type { GameEffect } from '../../domain/types'
import { cuesFor } from './fxDirector'

describe('cuesFor — damage', () => {
  it('basic hit → impact cue at the target with hit SFX', () => {
    const cues = cuesFor([{ type: 'damage', amount: 12, monsterHpAfter: 88, actorId: 'p', targetId: 'm1' }])
    expect(cues).toEqual([{ kind: 'impact', anchorId: 'm1', sfx: 'hit' }])
  })

  it('crit → crit cue with flash + light shake', () => {
    const cues = cuesFor([{ type: 'damage', amount: 30, monsterHpAfter: 70, actorId: 'p', targetId: 'm1', crit: true }])
    expect(cues[0]).toMatchObject({ kind: 'crit', anchorId: 'm1', flash: true, shake: 'light', sfx: 'crit' })
  })

  it('weakness hit (typeMult>1) → weak cue', () => {
    const cues = cuesFor([{ type: 'damage', amount: 18, monsterHpAfter: 82, actorId: 'p', targetId: 'm1', typeMult: 1.5 }])
    expect(cues[0]).toMatchObject({ kind: 'weak', sfx: 'weak' })
  })

  it('miss → miss puff; fromSkill damage is silent (skillCast covers it)', () => {
    const cues = cuesFor([
      { type: 'damage', amount: 0, monsterHpAfter: 100, actorId: 'p', targetId: 'm1', missed: true },
      { type: 'damage', amount: 22, monsterHpAfter: 78, actorId: 'p', targetId: 'm1', fromSkill: true },
    ])
    expect(cues).toEqual([{ kind: 'miss', anchorId: 'm1', sfx: 'miss' }])
  })
})

describe('cuesFor — enemy attacks and telegraphs', () => {
  it('normal enemy hit → light shake; heavy → heavy shake + flash', () => {
    const cues = cuesFor([
      { type: 'enemyAttack', targetId: 'p', amount: 20 },
      { type: 'enemyAttack', targetId: 'p', amount: 60, heavy: true },
    ])
    expect(cues[0]).toMatchObject({ kind: 'enemyHit', shake: 'light', sfx: 'enemyhit' })
    expect(cues[1]).toMatchObject({ kind: 'enemyHeavy', shake: 'heavy', flash: true, sfx: 'heavy' })
  })

  it('telegraph → telegraph ring at the enemy', () => {
    const cues = cuesFor([{ type: 'enemyTelegraph', enemyId: 'm1', text: '蓄力' }])
    expect(cues).toEqual([{ kind: 'telegraph', anchorId: 'm1', sfx: 'telegraph' }])
  })
})

describe('cuesFor — §26 status effects', () => {
  it('statusApplied: sleep gets the Zzz treatment, others a colored puff', () => {
    const cues = cuesFor([
      { type: 'statusApplied', targetId: 'm1', kind: 'sleep', rounds: 1 },
      { type: 'statusApplied', targetId: 'p', kind: 'poison', rounds: 3 },
    ])
    expect(cues[0]).toMatchObject({ kind: 'sleepZzz', anchorId: 'm1', sfx: 'sleep' })
    expect(cues[1]).toMatchObject({ kind: 'status', anchorId: 'p', sfx: 'status' })
    expect(cues[1].color).toBeDefined()
  })

  it('statusTick is juice-only (no SFX spam at round end); guarded plays the guard ring', () => {
    const cues = cuesFor([
      { type: 'statusTick', targetId: 'm1', kind: 'burn', amount: 12, hpAfter: 88 },
      { type: 'guarded', characterId: 'p' },
    ])
    expect(cues[0]).toMatchObject({ kind: 'statusTick', anchorId: 'm1' })
    expect(cues[0].sfx).toBeUndefined()
    expect(cues[1]).toMatchObject({ kind: 'guard', anchorId: 'p', sfx: 'guard' })
  })

  it('bossPhase → heavy shake + flash + phase burst', () => {
    const cues = cuesFor([{ type: 'bossPhase', enemyId: 'm1', phaseLabel: '狂怒' }])
    expect(cues[0]).toMatchObject({ kind: 'phase', anchorId: 'm1', shake: 'heavy', flash: true, sfx: 'phase' })
  })
})

describe('cuesFor — round outcomes', () => {
  it('victory and encounterCleared in one batch produce ONE victory cue', () => {
    const cues = cuesFor([
      { type: 'encounterCleared', questId: 'q', encounterIndex: 0 },
      { type: 'victory', defeatedMonsterId: 'm1', storyStage: 2 },
    ])
    expect(cues.filter((c) => c.kind === 'victory')).toHaveLength(1)
  })

  it('level-up sparkles only when levelsGained > 0', () => {
    const cues = cuesFor([
      { type: 'charXp', characterId: 'p', amount: 10, levelsGained: 0 },
      { type: 'charXp', characterId: 'nova', amount: 10, levelsGained: 1 },
    ])
    expect(cues).toEqual([{ kind: 'levelup', anchorId: 'nova', sfx: 'levelup' }])
  })

  it('affinity/mood effects produce no stage cues (toasts own them)', () => {
    const effects: GameEffect[] = [
      { type: 'affinity', characterId: 'nova', amount: 5, rankedUpTo: null },
      { type: 'mood', characterId: 'nova', flag: 'proud' },
    ]
    expect(cuesFor(effects)).toEqual([])
  })
})

describe('cuesFor — §28 new effects', () => {
  it('duoSkillCast → duo cue at the target with flash + light shake + duo SFX', () => {
    const cues = cuesFor([
      { type: 'duoSkillCast', skillId: 'xinghuo_yeyu', casterIds: ['mira', 'vela'], amount: 120, targetId: 'm1' },
    ])
    expect(cues).toEqual([{ kind: 'duo', anchorId: 'm1', flash: true, shake: 'light', sfx: 'duo' }])
  })

  it('duoSkillCast without targetId still emits a duo cue (anchorId undefined)', () => {
    const cues = cuesFor([
      { type: 'duoSkillCast', skillId: 'yeyu_yuguang', casterIds: ['vela', 'nova'], amount: 80 },
    ])
    expect(cues[0]).toMatchObject({ kind: 'duo', sfx: 'duo', flash: true, shake: 'light' })
    expect(cues[0].anchorId).toBeUndefined()
  })

  it('counter riposte → skill cue at the target with hit SFX', () => {
    const cues = cuesFor([
      { type: 'counter', characterId: 'p', targetId: 'm1', amount: 15 },
    ])
    expect(cues).toEqual([{ kind: 'skill', anchorId: 'm1', sfx: 'hit' }])
  })

  it('habitMilestone → victory cue with levelup SFX', () => {
    const cues = cuesFor([
      { type: 'habitMilestone', habitId: 'h1', streak: 7, rewardText: '+1 天赋点' },
    ])
    expect(cues).toEqual([{ kind: 'victory', sfx: 'levelup' }])
  })

  it('talentLearned produces no stage cues (toast owns it)', () => {
    const effects: GameEffect[] = [
      { type: 'talentLearned', characterId: 'p', nodeId: 'tv_hp1' },
    ]
    expect(cuesFor(effects)).toEqual([])
  })
})
