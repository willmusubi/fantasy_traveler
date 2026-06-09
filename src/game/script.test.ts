// §23 branching script: chapter transitions, the post-boss choice + persistent flags, the finale
// (NO endless-loop — the "repeats one task forever" bug fix), and back-compat with the linear path.
import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import { materializeQuest } from '../ai/storyline'
import type { Affinity, Character, GameState, Monster, Quest, ScriptChapter, ScriptChoice, ScriptDef, Todo } from '../domain/types'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const NOW = new Date(2026, 4, 29, 12, 0, 0)
const TODAY = '2026-05-29'

function char(classId: Character['classId'], kind: Character['kind'], id: string): Character {
  return { id, name: id, kind, classId, stats: statsForClassAtLevel(classId, 1), skills: [], portraitSet: 'x', createdAt: TODAY }
}
const PARTY = [char('vanguard', 'player', 'player'), char('striker', 'companion', 'mira')]

function mon(id: string, hp = 1): Monster {
  return { id, nameKey: 'monster.procrastination', displayName: id, level: 1, maxHp: 400, hp, atk: 14, def: 10, spd: 9, growth: 1 }
}

function chapter(id: string, next: ScriptChapter['next']): ScriptChapter {
  return {
    id, title: id, lore: '',
    encounters: [{ enemyName: id.toUpperCase(), enemyTheme: '', hpScale: 1, defScale: 1, narrationIntro: '', narrationVictory: `${id} cleared` }],
    reward: { equipmentDefIds: [], unlockCompanionIds: [], playerXp: 0 },
    next,
  }
}

const CHOICE: ScriptChoice = {
  prompt: '救还是不救？',
  options: [
    { id: 'save', label: '救', description: '', nextChapterId: 'ch3', setFlags: { rebecca: 'rescued' }, unlockCompanionIds: ['vela'] },
    { id: 'flee', label: '不救', description: '', nextChapterId: 'ch3', setFlags: { rebecca: 'dead' } },
  ],
}

function makeScript(): ScriptDef {
  return {
    id: 's1', worldId: 'stargazers', title: 'T', synopsis: '', startChapterId: 'ch1',
    chapters: { ch1: chapter('ch1', 'ch2'), ch2: chapter('ch2', CHOICE), ch3: chapter('ch3', null) },
    flags: [{ key: 'rebecca', description: '蕾贝卡是否生还', values: { rescued: '被救下', dead: '战死' } }],
  }
}

function questFor(ch: ScriptChapter): Quest {
  return materializeQuest(ch, 'stargazers', NOW, () => `q-${ch.id}`, '')
}

interface InputOpts {
  chapterId: string
  enemies?: Monster[]
  flags?: Record<string, string | boolean>
  completed?: string[] // §24: scriptIds already cleared before this turn
  script?: ScriptDef | null // null = no script (legacy path)
  quest?: Quest | null
}
function makeInput(opts: InputOpts): ReducerInput {
  const script = opts.script === undefined ? makeScript() : (opts.script ?? undefined)
  const ch = script?.chapters[opts.chapterId]
  const quest = opts.quest === undefined ? (ch ? questFor(ch) : undefined) : (opts.quest ?? undefined)
  const gameState: GameState = {
    partyIds: ['player', 'mira'], enemies: opts.enemies ?? [mon('e1', 1)], storyStage: 0, buffs: [], moodFlags: {}, lastResolvedAt: '',
    encounterIndex: 0, unlockedCompanionIds: ['mira'], ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [],
    charge: {}, roundPlan: {}, scriptFlags: opts.flags ?? {}, completedScriptIds: opts.completed ?? [],
    activeScriptId: script?.id, currentChapterId: script ? opts.chapterId : undefined, activeQuestId: quest?.id,
  }
  const affinities: Record<string, Affinity> = { mira: freshAffinity('mira', TODAY) }
  return { gameState, affinities, party: PARTY, now: NOW, newId: () => 'spawned', openHighCount: 0, quest, script }
}

const done = (priority: Todo['priority'] = 'high'): Todo => ({ id: 't', title: 't', priority, status: 'done', tags: [], createdAt: TODAY })

describe('gameReducer · script (§23)', () => {
  it('a linear chapter advances to the next chapter on boss clear (no endless spawn)', () => {
    const r = gameReducer(makeInput({ chapterId: 'ch1' }), { type: 'TodoCompleted', todo: done() })
    expect(r.effects.some((e) => e.type === 'scriptChapterAdvanced' && e.chapterId === 'ch2')).toBe(true)
    expect(r.gameState.currentChapterId).toBe('ch2')
    expect(r.gameState.encounterIndex).toBe(0)
    expect(r.gameState.activeScriptId).toBe('s1')
    expect(r.effects.some((e) => e.type === 'victory')).toBe(false) // script path never spawns endless
    expect(r.gameState.enemies).toHaveLength(1)
    expect(r.gameState.enemies[0].hp).toBe(0) // defeated boss kept until the pipeline materializes ch2
  })

  it('a chapter ending in a ScriptChoice pauses for the post-boss modal (no advance, no respawn)', () => {
    const r = gameReducer(makeInput({ chapterId: 'ch2' }), { type: 'TodoCompleted', todo: done() })
    const offered = r.effects.find((e) => e.type === 'scriptChoiceOffered')
    expect(offered && offered.type === 'scriptChoiceOffered' && offered.options.map((o) => o.id)).toEqual(['save', 'flee'])
    expect(r.effects.some((e) => e.type === 'scriptChapterAdvanced')).toBe(false)
    expect(r.gameState.activeQuestId).toBe('q-ch2') // still set — paused on the choice
    expect(r.gameState.enemies[0].hp).toBe(0)
  })

  it('ScriptChoicePicked applies persistent flags + recruits + advances', () => {
    const r = gameReducer(makeInput({ chapterId: 'ch2' }), { type: 'ScriptChoicePicked', optionId: 'save' })
    expect(r.gameState.scriptFlags.rebecca).toBe('rescued') // persists for the whole campaign
    expect(r.effects.some((e) => e.type === 'recruited' && e.companionId === 'vela')).toBe(true) // rescued → joins
    expect(r.effects.some((e) => e.type === 'scriptChapterAdvanced' && e.chapterId === 'ch3')).toBe(true)
    expect(r.gameState.currentChapterId).toBe('ch3')
  })

  it('the finale (next: null) ends the campaign cleanly — NO endless loop', () => {
    const r = gameReducer(makeInput({ chapterId: 'ch3', flags: { rebecca: 'rescued' } }), { type: 'TodoCompleted', todo: done() })
    const fin = r.effects.find((e) => e.type === 'scriptCompleted')
    expect(fin && fin.type === 'scriptCompleted' && fin.scriptId).toBe('s1')
    expect(fin && fin.type === 'scriptCompleted' && fin.flags).toEqual({ rebecca: 'rescued' })
    expect(r.gameState.activeScriptId).toBeUndefined()
    expect(r.gameState.activeQuestId).toBeUndefined()
    expect(r.gameState.currentChapterId).toBeUndefined()
    expect(r.gameState.enemies).toHaveLength(0) // the fix: no spawnMonster respawn
    expect(r.gameState.completedScriptIds).toEqual(['s1']) // §24: campaign marked 已通过 (no silent re-entry)
  })

  it('§24: re-finishing an already-cleared script does not duplicate it in completedScriptIds', () => {
    const r = gameReducer(
      makeInput({ chapterId: 'ch3', flags: { rebecca: 'rescued' }, completed: ['s1'] }),
      { type: 'TodoCompleted', todo: done() },
    )
    expect(r.gameState.completedScriptIds).toEqual(['s1']) // replayed campaign stays a single entry
  })

  it('ScriptChoicePicked with an unknown option is a no-op (state intact)', () => {
    const r = gameReducer(makeInput({ chapterId: 'ch2', flags: { x: true } }), { type: 'ScriptChoicePicked', optionId: 'nope' })
    expect(r.effects).toHaveLength(0)
    expect(r.gameState.scriptFlags).toEqual({ x: true })
    expect(r.gameState.currentChapterId).toBe('ch2')
  })

  it('back-compat: a legacy quest clear with no script still completes + spawns an endless monster', () => {
    const legacyQuest = questFor(chapter('lq', null))
    const r = gameReducer(
      makeInput({ chapterId: 'ch1', script: null, quest: legacyQuest, enemies: [mon('e1', 1)] }),
      { type: 'TodoCompleted', todo: done() },
    )
    expect(r.effects.some((e) => e.type === 'questCompleted')).toBe(true)
    expect(r.effects.some((e) => e.type === 'scriptChapterAdvanced' || e.type === 'scriptCompleted')).toBe(false)
    expect(r.gameState.activeQuestId).toBeUndefined()
    expect(r.gameState.enemies).toHaveLength(1)
    expect(r.gameState.enemies[0].hp).toBe(r.gameState.enemies[0].maxHp) // fresh endless spawn
  })
})
