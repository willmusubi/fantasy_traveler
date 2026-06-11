// §32 choreographer — the pure effects→timeline mapping. Mirrors fxDirector.test's role:
// WHAT plays and WHEN is unit-tested here; the Pixi stage (HOW) is browser-verified.

import { describe, expect, it } from 'vitest'
import type { GameEffect } from '../../../domain/types'
import { choreographFor, HIGHLIGHT_MAX_SECONDS, type SceneAction } from './choreographer'

const dmg = (over: Partial<Extract<GameEffect, { type: 'damage' }>> = {}): GameEffect => ({
  type: 'damage', amount: 10, monsterHpAfter: 90, actorId: 'hero', targetId: 'mob1', ...over,
})

const ofKind = <K extends SceneAction['kind']>(actions: SceneAction[], kind: K) =>
  actions.filter((a): a is Extract<SceneAction, { kind: K }> => a.kind === kind)

describe('choreographFor — full mode', () => {
  it('a basic hit: attacker lunges at 0, impact cue + target flinch land together later', () => {
    const { actions, total } = choreographFor([dmg()], 'full')
    const [lunge] = ofKind(actions, 'lunge')
    const [hit] = ofKind(actions, 'hit')
    const [cue] = ofKind(actions, 'cue')
    expect(lunge).toMatchObject({ actorId: 'hero', at: 0 })
    expect(hit.actorId).toBe('mob1')
    expect(hit.at).toBeGreaterThan(lunge.at)
    expect(cue.at).toBe(hit.at) // particles pop exactly on the flinch frame
    expect(cue.cue.kind).toBe('impact')
    expect(total).toBeGreaterThan(0)
  })

  it('a crit adds a light camera punch on the impact frame', () => {
    const { actions } = choreographFor([dmg({ crit: true })], 'full')
    const [cam] = ofKind(actions, 'camera')
    const [hit] = ofKind(actions, 'hit')
    expect(cam).toMatchObject({ preset: 'punchLight', at: hit.at })
  })

  it('fromSkill damage contributes NOTHING — the paired skillCast owns the beat', () => {
    const { actions, total } = choreographFor([dmg({ fromSkill: true })], 'full')
    expect(actions).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('skillCast attack: caster wind-up precedes the target flinch', () => {
    const e: GameEffect = {
      type: 'skillCast', skillId: 'fenxing', casterId: 'mira', targetId: 'mob1',
      skillKind: 'attack', amount: 30,
    }
    const { actions } = choreographFor([e], 'full')
    const [casting] = ofKind(actions, 'casting')
    const [hit] = ofKind(actions, 'hit')
    expect(casting).toMatchObject({ actorId: 'mira', at: 0 })
    expect(hit).toMatchObject({ actorId: 'mob1' })
    expect(hit.at).toBeGreaterThan(casting.at)
  })

  it('enemyAttack WITH enemyId lunges that enemy; sourceless penalty hits skip the lunge', () => {
    const sourced: GameEffect = { type: 'enemyAttack', targetId: 'hero', amount: 12, enemyId: 'mob2' }
    const sourceless: GameEffect = { type: 'enemyAttack', targetId: 'hero', amount: 12 }
    const a = choreographFor([sourced], 'full')
    const b = choreographFor([sourceless], 'full')
    expect(ofKind(a.actions, 'lunge')).toHaveLength(1)
    expect(ofKind(a.actions, 'lunge')[0].actorId).toBe('mob2')
    expect(ofKind(b.actions, 'lunge')).toHaveLength(0)
    expect(ofKind(b.actions, 'hit')).toHaveLength(1) // the flinch still reads
  })

  it('duo: both casters wind up simultaneously', () => {
    const e: GameEffect = {
      type: 'duoSkillCast', skillId: 'xinghuo_yeyu', casterIds: ['mira', 'vela'],
      targetId: 'mob1', amount: 60,
    }
    const { actions } = choreographFor([e], 'full')
    const castings = ofKind(actions, 'casting')
    expect(castings.map((c) => c.actorId).sort()).toEqual(['mira', 'vela'])
    expect(castings[0].at).toBe(castings[1].at)
  })

  it('victory + encounterCleared in one batch celebrate exactly once (cuesFor parity)', () => {
    const effects: GameEffect[] = [
      { type: 'victory', defeatedMonsterId: 'mob1', storyStage: 2 },
      { type: 'encounterCleared', questId: 'q1', encounterIndex: 0 },
    ]
    const { actions } = choreographFor(effects, 'full')
    expect(ofKind(actions, 'victory')).toHaveLength(1)
  })

  it('downed keels the figure over on the same beat as its cue', () => {
    const { actions } = choreographFor([{ type: 'downed', characterId: 'hero' }], 'full')
    expect(ofKind(actions, 'downed')[0]).toMatchObject({ actorId: 'hero', at: 0 })
  })

  it('empty batch → empty timeline', () => {
    expect(choreographFor([], 'full')).toEqual({ actions: [], total: 0 })
  })
})

describe('choreographFor — highlight mode (the auto player reel)', () => {
  const filler = (n: number): GameEffect[] => Array.from({ length: n }, () => dmg())

  it('plain hits collapse to cue-only filler ticks (no figure choreography)', () => {
    const { actions } = choreographFor(filler(3), 'highlight')
    expect(ofKind(actions, 'lunge')).toHaveLength(0)
    expect(ofKind(actions, 'cue')).toHaveLength(3)
  })

  it('mandatory moments keep their full beat inside the reel', () => {
    const effects = [...filler(2), dmg({ crit: true }), ...filler(2)]
    const { actions } = choreographFor(effects, 'highlight')
    expect(ofKind(actions, 'lunge')).toHaveLength(1) // only the crit lunges
    expect(ofKind(actions, 'camera')).toHaveLength(1)
  })

  it(`a huge batch compresses to ≤ ${HIGHLIGHT_MAX_SECONDS}s with order preserved`, () => {
    const effects: GameEffect[] = [
      ...filler(6),
      dmg({ crit: true }),
      { type: 'enemyAttack', targetId: 'hero', amount: 30, heavy: true, enemyId: 'mob1' },
      ...filler(6),
      { type: 'victory', defeatedMonsterId: 'mob1', storyStage: 2 },
    ]
    const { actions, total } = choreographFor(effects, 'highlight')
    expect(total).toBeLessThanOrEqual(HIGHLIGHT_MAX_SECONDS)
    const ats = actions.map((a) => a.at)
    for (let i = 1; i < ats.length; i++) expect(ats[i]).toBeGreaterThanOrEqual(ats[i - 1]) // monotone
    expect(Math.max(...ats)).toBeLessThanOrEqual(HIGHLIGHT_MAX_SECONDS)
    expect(ofKind(actions, 'victory')).toHaveLength(1)
  })

  it('short batches are NOT stretched — compression only ever shrinks', () => {
    const { total } = choreographFor([dmg()], 'highlight')
    expect(total).toBeLessThan(0.2) // one filler tick, nowhere near the cap
  })
})
