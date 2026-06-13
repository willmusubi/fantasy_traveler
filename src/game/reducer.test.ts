import { describe, expect, it } from 'vitest'
import { freshAffinity } from '../companion/affinity'
import { AFFINITY_JOURNAL_TOTAL, DEADLINE_CRIT_BONUS, JOURNAL_XP, TODO_XP, VICTORY_AFFINITY } from '../domain/config'
import type { Affinity, Character, GameState, JournalEntry, Monster, Mood, Quest, Todo } from '../domain/types'
import { defeatRewards } from './combat'
import { statsForClassAtLevel } from './leveling'
import { gameReducer, type ReducerInput } from './reducer'

const NOW = new Date(2026, 4, 29, 12, 0, 0)
const TODAY = '2026-05-29'

function char(classId: Character['classId'], kind: Character['kind'], id: string): Character {
  return {
    id, name: id, kind, classId,
    stats: statsForClassAtLevel(classId, 1),
    skills: [], portraitSet: 'x', createdAt: TODAY,
  }
}

const PLAYER = char('vanguard', 'player', 'player')
const MIRA = char('striker', 'companion', 'mira')
const PARTY = [PLAYER, MIRA]

function makeMonster(over: Partial<Monster> = {}): Monster {
  return { id: 'm1', nameKey: 'monster.procrastination', level: 1, maxHp: 400, hp: 400, atk: 14, def: 10, spd: 9, growth: 1, ...over }
}

function makeInput(over: Partial<ReducerInput> = {}): ReducerInput {
  const gameState: GameState = {
    partyIds: ['player', 'mira'],
    enemies: [makeMonster()],
    storyStage: 0,
    buffs: [],
    moodFlags: {},
    lastResolvedAt: '',
    encounterIndex: 0,
    unlockedCompanionIds: ['mira'],
    ownedEquipment: [],
    resources: {},
    gold: 0,
    partyBuffs: [],
    combatLog: [],
    charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
  }
  const affinities: Record<string, Affinity> = { mira: freshAffinity('mira', TODAY) }
  return { gameState, affinities, party: PARTY, now: NOW, newId: () => 'm-next', openHighCount: 0, ...over }
}

const todo = (priority: Todo['priority']): Todo => ({
  id: 't1', title: 't', priority, status: 'done', tags: [], createdAt: TODAY,
})

describe('gameReducer · TodoCompleted', () => {
  it('damages the monster, grants player XP, and raises affinity', () => {
    const r = gameReducer(makeInput(), { type: 'TodoCompleted', todo: todo('high') })
    // A speed-ordered round of INDIVIDUAL hits (§25 soak 0.5): 米拉 (str18) 40, then 旅人 (str14) 30.
    expect(r.gameState.enemies[0].hp).toBe(400 - 40 - 30) // 330
    const dmgs = r.effects.filter((e) => e.type === 'damage')
    expect(dmgs.map((e) => (e.type === 'damage' ? e.amount : 0))).toEqual([40, 30])
    expect(dmgs[0]).toMatchObject({ amount: 40, monsterHpAfter: 360, actorId: 'mira' })
    expect(r.effects.find((e) => e.type === 'charXp' && e.characterId === 'player')).toMatchObject({ amount: TODO_XP.high })
    expect(r.characterStats.player.xp).toBe(TODO_XP.high) // small per-task chip XP
    // The whole on-field party gains XP, not just the player.
    expect(r.effects.find((e) => e.type === 'charXp' && e.characterId === 'mira')).toMatchObject({ amount: TODO_XP.high })
    expect(r.characterStats.mira.xp).toBe(TODO_XP.high)
    expect(r.affinities.mira.points).toBe(5)
    expect(r.affinities.mira.rank).toBe('C')
    expect(r.effects.find((e) => e.type === 'affinity')).toMatchObject({ rankedUpTo: 'C' })
  })

  it('does not mutate the input game state', () => {
    const input = makeInput()
    gameReducer(input, { type: 'TodoCompleted', todo: todo('high') })
    expect(input.gameState.enemies[0].hp).toBe(400)
  })

  it('grants affinity to EVERY on-field companion, not just the first', () => {
    const vela = char('tactician', 'companion', 'vela')
    const r = gameReducer(
      makeInput({
        party: [PLAYER, MIRA, vela],
        affinities: { mira: freshAffinity('mira', TODAY), vela: freshAffinity('vela', TODAY) },
      }),
      { type: 'TodoCompleted', todo: todo('high') },
    )
    expect(r.affinities.mira.points).toBe(5)
    expect(r.affinities.vela.points).toBe(5)
  })

  it('a caster basic-attacks with its best offensive stat (mag), not its low atk', () => {
    const nova = char('medic', 'companion', 'nova') // support: str 8, wis 15, no skills → basic attack
    const r = gameReducer(
      makeInput({ party: [PLAYER, nova], affinities: { nova: freshAffinity('nova', TODAY) } }),
      { type: 'TodoCompleted', todo: todo('low') },
    )
    const aiHit = r.effects.find((e) => e.type === 'damage' && e.actorId === 'nova')
    // low priority (mult 1): wis 15 swings MAGIC vs mdef (def×0.8=8): 15 − 8×0.5 = 11 (§25).
    expect(aiHit && aiHit.type === 'damage' ? aiHit.amount : -1).toBe(11)
  })
})

describe('gameReducer · TodoOverdue', () => {
  it('grows the monster and sets the companion worried', () => {
    const r = gameReducer(makeInput(), { type: 'TodoOverdue', todo: todo('high') })
    expect(r.gameState.enemies[0].maxHp).toBe(470) // +OVERDUE_HP_GROW 70
    expect(r.gameState.enemies[0].atk).toBe(16) // +OVERDUE_ATK_GROW 2
    expect(r.gameState.moodFlags.mira).toBe('worried')
    expect(r.effects.find((e) => e.type === 'mood')).toMatchObject({ flag: 'worried' })
  })
})

describe('gameReducer · TaskTimerExpired', () => {
  it('lands exactly one ordinary enemy attack and does NOT grow the monster', () => {
    const input = makeInput()
    const r = gameReducer(input, { type: 'TaskTimerExpired', todo: todo('high') })
    // One enemy swing on the sturdiest member (旅人, full HP 120): round(atk14*1.25 − def12*0.5) = 12.
    const hits = r.effects.filter((e) => e.type === 'enemyAttack')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ type: 'enemyAttack', targetId: 'player', amount: 12 })
    // No growth, and the party never strikes the enemy (it's a free swing, not a round).
    expect(r.effects.some((e) => e.type === 'monsterGrew')).toBe(false)
    expect(r.effects.some((e) => e.type === 'damage')).toBe(false)
    expect(r.gameState.enemies[0].maxHp).toBe(400)
    expect(r.gameState.enemies[0].atk).toBe(14)
    expect(r.gameState.enemies[0].hp).toBe(400) // enemy untouched
  })

  it('sets the active companion worried', () => {
    const r = gameReducer(makeInput(), { type: 'TaskTimerExpired', todo: todo('low') })
    expect(r.gameState.moodFlags.mira).toBe('worried')
    expect(r.effects.find((e) => e.type === 'mood')).toMatchObject({ flag: 'worried' })
  })

  it('does not mutate the input game state', () => {
    const input = makeInput()
    gameReducer(input, { type: 'TaskTimerExpired', todo: todo('high') })
    expect(input.gameState.enemies[0].hp).toBe(400)
    expect(input.gameState.resources).toEqual({})
  })

  it('triggers a wipe setback (revive + logged monster heal) when the hit fells the lone member', () => {
    const input = makeInput({ party: [PLAYER] })
    input.gameState.enemies[0] = { ...input.gameState.enemies[0], hp: 200 } // below max so the wipe-heal is visible
    input.gameState.resources = { player: { hp: 1, mp: 0 } }
    const r = gameReducer(input, { type: 'TaskTimerExpired', todo: todo('high') })
    const wiped = r.effects.find((e) => e.type === 'partyWiped')
    expect(wiped).toMatchObject({ type: 'partyWiped', monsterHealed: 120, monsterHpAfter: 320 }) // +30% of maxHp 400
    expect(r.gameState.resources.player.hp).toBeGreaterThan(1) // revived low
  })
})

const journal = (mood: Mood): JournalEntry => ({
  id: 'j1', date: TODAY, mood, body: '今天还行', createdAt: TODAY,
})

describe('gameReducer · JournalWritten', () => {
  it('grants party-wide XP + companion affinity + a mood flag, and never touches the enemy', () => {
    const r = gameReducer(makeInput(), { type: 'JournalWritten', entry: journal('great') })
    // Reflection is NOT combat: the enemy is untouched, no enemy attack / damage / victory.
    expect(r.gameState.enemies[0].hp).toBe(400)
    expect(r.effects.some((e) => e.type === 'damage' || e.type === 'enemyAttack' || e.type === 'victory')).toBe(false)
    // Party-wide XP (the whole on-field party, like a defeat — but small, and once per day).
    expect(r.effects.find((e) => e.type === 'charXp' && e.characterId === 'player')).toMatchObject({ amount: JOURNAL_XP })
    expect(r.characterStats.player.xp).toBe(JOURNAL_XP)
    expect(r.characterStats.mira.xp).toBe(JOURNAL_XP)
    // One present companion → the whole affinity pool goes to her.
    expect(r.affinities.mira.points).toBe(AFFINITY_JOURNAL_TOTAL)
    // A 'great' mood reads as pride; the flag biases her next line.
    expect(r.gameState.moodFlags.mira).toBe('proud')
    expect(r.effects.find((e) => e.type === 'mood')).toMatchObject({ flag: 'proud' })
    expect(r.gameState.lastJournalRewardOn).toBe(TODAY)
  })

  it('a low mood reads as concern', () => {
    const r = gameReducer(makeInput(), { type: 'JournalWritten', entry: journal('bad') })
    expect(r.gameState.moodFlags.mira).toBe('concerned')
    expect(r.effects.find((e) => e.type === 'mood')).toMatchObject({ flag: 'concerned' })
  })

  it('a neutral mood sets no flag (but still pays the daily reward)', () => {
    const r = gameReducer(makeInput(), { type: 'JournalWritten', entry: journal('neutral') })
    expect(r.effects.find((e) => e.type === 'mood')).toBeUndefined()
    expect(Object.keys(r.gameState.moodFlags)).toHaveLength(0)
    expect(r.characterStats.player.xp).toBe(JOURNAL_XP)
  })

  it('splits the affinity pool across all present companions (floor/N)', () => {
    const vela = char('tactician', 'companion', 'vela')
    const r = gameReducer(
      makeInput({
        party: [PLAYER, MIRA, vela],
        affinities: { mira: freshAffinity('mira', TODAY), vela: freshAffinity('vela', TODAY) },
      }),
      { type: 'JournalWritten', entry: journal('good') },
    )
    // 8 split across 2 companions → 4 each.
    expect(r.affinities.mira.points).toBe(Math.floor(AFFINITY_JOURNAL_TOTAL / 2))
    expect(r.affinities.vela.points).toBe(Math.floor(AFFINITY_JOURNAL_TOTAL / 2))
  })

  it('does not pay a second time the same local day (anti-farm), but still reacts', () => {
    const input = makeInput()
    input.gameState.lastJournalRewardOn = TODAY
    const r = gameReducer(input, { type: 'JournalWritten', entry: journal('great') })
    expect(r.effects.some((e) => e.type === 'charXp')).toBe(false)
    expect(r.characterStats).toEqual({})
    expect(r.affinities.mira.points).toBe(0) // unchanged
    expect(r.gameState.moodFlags.mira).toBe('proud') // the in-character reaction still fires
  })
})

describe('gameReducer · victory', () => {
  it('fires a victory burst and spawns the next monster (idempotent)', () => {
    const input = makeInput({ gameState: {
      partyIds: ['player', 'mira'], enemies: [makeMonster({ hp: 50 })], storyStage: 0,
      buffs: [], moodFlags: {}, lastResolvedAt: '',
      encounterIndex: 0, unlockedCompanionIds: ['mira'], ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
    } })
    const r = gameReducer(input, { type: 'TodoCompleted', todo: todo('high') })
    expect(r.effects.find((e) => e.type === 'victory')).toMatchObject({ storyStage: 1, defeatedMonsterId: 'm1' })
    expect(r.gameState.storyStage).toBe(1)
    expect(r.gameState.enemies[0].id).toBe('m-next')
    expect(r.gameState.clearedEncounterKey).toBe('endless:0:m1')
    // defeat XP burst present for the party, scaled to the enemy (in addition to chip XP)
    const defeatXp = defeatRewards(makeMonster({ hp: 50 })).xp
    const xpBurst = r.effects.filter((e) => e.type === 'charXp')
    expect(xpBurst.some((e) => e.type === 'charXp' && e.characterId === 'player' && e.amount === defeatXp)).toBe(true)
    expect(xpBurst.some((e) => e.type === 'charXp' && e.characterId === 'mira' && e.amount === defeatXp)).toBe(true)
    // victory affinity present
    const aff = r.affinities.mira.points
    expect(aff).toBe(5 + VICTORY_AFFINITY) // completion +5, victory +20, within daily cap 30
  })

  it('does not double-fire victory for an already-cleared encounter key', () => {
    const input = makeInput({ gameState: {
      partyIds: ['player', 'mira'], enemies: [makeMonster({ id: 'm1', hp: 50 })], storyStage: 3,
      clearedEncounterKey: 'endless:0:m1', buffs: [], moodFlags: {}, lastResolvedAt: '',
      encounterIndex: 0, unlockedCompanionIds: ['mira'], ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
    } })
    const r = gameReducer(input, { type: 'TodoCompleted', todo: todo('high') })
    expect(r.effects.find((e) => e.type === 'victory')).toBeUndefined()
    expect(r.gameState.storyStage).toBe(3)
  })
})

function makeQuest(): Quest {
  return {
    id: 'q1', worldId: 'stargazers', title: 'T', lore: 'L',
    encounters: [
      { index: 0, enemyName: '敌人1', enemyTheme: '', hpScale: 1, defScale: 1, narrationIntro: '', narrationVictory: '胜利1' },
      { index: 1, enemyName: '敌人2', enemyTheme: '', hpScale: 1, defScale: 1, narrationIntro: '', narrationVictory: '胜利2' },
    ],
    reward: { equipmentDefIds: ['starlit_blade'], unlockCompanionIds: ['vela'], playerXp: 50 },
    status: 'active', generatedAt: '', generatedByModel: '', schemaVersion: 1,
  }
}

function questInput(encounterIndex: number, monsterOver: Partial<Monster> = {}) {
  const quest = makeQuest()
  return makeInput({
    quest,
    gameState: {
      partyIds: ['player', 'mira'], enemies: [makeMonster({ hp: 50, ...monsterOver })], storyStage: 0,
      buffs: [], moodFlags: {}, lastResolvedAt: '',
      encounterIndex, unlockedCompanionIds: ['mira'], ownedEquipment: [], resources: {}, gold: 0, partyBuffs: [], combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
      activeWorldId: 'stargazers', activeQuestId: 'q1',
    },
  })
}

describe('gameReducer · quest-driven combat', () => {
  it('clearing a non-final encounter advances to the next', () => {
    const r = gameReducer(questInput(0), { type: 'TodoCompleted', todo: todo('high') })
    expect(r.gameState.encounterIndex).toBe(1)
    expect(r.gameState.enemies[0].displayName).toBe('敌人2')
    expect(r.effects.find((e) => e.type === 'encounterCleared')).toMatchObject({ encounterIndex: 0, nextEnemy: '敌人2' })
    expect(r.effects.find((e) => e.type === 'questCompleted')).toBeUndefined()
    expect(r.gameState.activeQuestId).toBe('q1')
  })

  it('clearing the final encounter completes the quest with recruit + loot', () => {
    const r = gameReducer(questInput(1), { type: 'TodoCompleted', todo: todo('high') })
    expect(r.effects.find((e) => e.type === 'questCompleted')).toBeTruthy()
    expect(r.effects.find((e) => e.type === 'recruited')).toMatchObject({ companionId: 'vela' })
    expect(r.effects.find((e) => e.type === 'equipmentGranted')).toMatchObject({ defId: 'starlit_blade' })
    expect(r.gameState.unlockedCompanionIds).toContain('vela')
    expect(r.gameState.ownedEquipment).toHaveLength(1)
    expect(r.gameState.activeQuestId).toBeUndefined()
  })

  it('does not recruit a companion that is already unlocked (idempotent)', () => {
    const input = questInput(1)
    input.gameState.unlockedCompanionIds = ['mira', 'vela'] // already have vela
    const r = gameReducer(input, { type: 'TodoCompleted', todo: todo('high') })
    expect(r.effects.find((e) => e.type === 'recruited')).toBeUndefined()
    expect(r.gameState.unlockedCompanionIds.filter((id) => id === 'vela')).toHaveLength(1)
  })
})

describe('gameReducer · habit buffs (untilVictory)', () => {
  const withBuffs = (monsterOver: Partial<Monster>): ReducerInput =>
    makeInput({
      gameState: {
        partyIds: ['player', 'mira'], enemies: [makeMonster(monsterOver)], storyStage: 0,
        buffs: [], moodFlags: {}, lastResolvedAt: '', encounterIndex: 0, unlockedCompanionIds: ['mira'],
        ownedEquipment: [], resources: {}, gold: 0,
        partyBuffs: [
          { id: 'run', kind: 'defPct', magnitude: 0.2, untilVictory: true },
          { id: 'skill', kind: 'atkPct', magnitude: 0.1, turnsLeft: 3 },
        ],
        combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
      },
    })

  it('clears untilVictory buffs on a victory while a skill buff keeps decaying', () => {
    const r = gameReducer(withBuffs({ hp: 50 }), { type: 'TodoCompleted', todo: todo('high') })
    expect(r.effects.find((e) => e.type === 'victory')).toBeTruthy()
    expect(r.gameState.partyBuffs.some((b) => b.untilVictory)).toBe(false) // habit buff gone
    expect(r.gameState.partyBuffs.find((b) => b.id === 'skill')).toBeTruthy() // skill buff survives
  })

  it('without a victory, decay leaves untilVictory buffs untouched but expires a skill buff', () => {
    const input = makeInput({
      gameState: {
        partyIds: ['player', 'mira'], enemies: [makeMonster({ hp: 4000 })], storyStage: 0, // tanky → no victory
        buffs: [], moodFlags: {}, lastResolvedAt: '', encounterIndex: 0, unlockedCompanionIds: ['mira'],
        ownedEquipment: [], resources: {}, gold: 0,
        partyBuffs: [
          { id: 'run', kind: 'defPct', magnitude: 0.2, untilVictory: true },
          { id: 'skill', kind: 'atkPct', magnitude: 0.1, turnsLeft: 1 },
        ],
        combatLog: [], charge: {}, roundPlan: {}, scriptFlags: {}, completedScriptIds: [],
      },
    })
    const r = gameReducer(input, { type: 'TodoCompleted', todo: todo('low') })
    expect(r.effects.find((e) => e.type === 'victory')).toBeUndefined()
    expect(r.gameState.partyBuffs.find((b) => b.id === 'run')).toBeTruthy() // untilVictory untouched
    expect(r.gameState.partyBuffs.find((b) => b.id === 'skill')).toBeUndefined() // turnsLeft 1 → 0 → removed
  })
})

// §35 准时暴击: finishing a task on or before its deadline grants a round-wide crit bonus.
// NOW = 2026-05-29 12:00 local → due '2026-05-29' (end-of-day) and any later date are ON TIME;
// '2026-05-28' is overdue. A todo with no `due` is never eligible.
describe('gameReducer · §35 准时暴击 (deadline crit bonus)', () => {
  const datedTodo = (due: string | undefined, priority: Todo['priority'] = 'med'): Todo => ({
    id: 't1', title: 't', priority, status: 'done', tags: [], createdAt: TODAY, due,
  })

  it('banners the round-wide bonus when a task is finished on or before its deadline', () => {
    const r = gameReducer(makeInput(), { type: 'TodoCompleted', todo: datedTodo('2026-05-29') })
    expect(r.effects.find((e) => e.type === 'deadlineBonus')).toMatchObject({ pct: DEADLINE_CRIT_BONUS })
  })

  it('also banners for a FUTURE deadline (any date not yet passed is on time)', () => {
    const r = gameReducer(makeInput(), { type: 'TodoCompleted', todo: datedTodo('2026-05-30') })
    expect(r.effects.find((e) => e.type === 'deadlineBonus')).toMatchObject({ pct: DEADLINE_CRIT_BONUS })
  })

  it('grants NO bonus for an overdue task (the 心魔 already fed on the delay)', () => {
    const r = gameReducer(makeInput(), { type: 'TodoCompleted', todo: datedTodo('2026-05-28') })
    expect(r.effects.some((e) => e.type === 'deadlineBonus')).toBe(false)
  })

  it('grants NO bonus for a task with no deadline (you must set one to claim it)', () => {
    const r = gameReducer(makeInput(), { type: 'TodoCompleted', todo: datedTodo(undefined) })
    expect(r.effects.some((e) => e.type === 'deadlineBonus')).toBe(false)
  })

  it('actually lifts the crit rate of the round it drives', () => {
    // One player, skl 0 → base critRate 5%. A constant 0.10 roll lands the hit, sits at 10% on the
    // crit roll, and mid-variance — so the basic attack crits ONLY once the +15 on-time bonus folds in.
    const player: Character = { ...PLAYER, stats: { ...statsForClassAtLevel('vanguard', 1), skl: 0 } }
    const base = makeInput()
    const input = makeInput({
      party: [player],
      gameState: { ...base.gameState, partyIds: ['player'], unlockedCompanionIds: [], enemies: [makeMonster({ maxHp: 9999, hp: 9999 })] },
      roll: () => 0.1,
    })
    const playerCrit = (due: string) =>
      gameReducer(input, { type: 'TodoCompleted', todo: datedTodo(due) })
        .effects.some((e) => e.type === 'damage' && e.actorId === 'player' && e.crit === true)
    expect(playerCrit('2026-05-30')).toBe(true) // on time → the round can crit
    expect(playerCrit('2026-05-28')).toBe(false) // overdue → same roll, no crit
  })

  it('lifts the crit rate of a planned attack SKILL too (shared critBonusOf, not basics-only)', () => {
    // 米拉 lvl-6 with 流光击 planned, skl 0 → base critRate 5%. Same 0.10 roll: the skill cast
    // crits ONLY once the +15 on-time bonus folds in — proving skills share the round bonus.
    const caster: Character = {
      id: 'mira', name: 'mira', kind: 'companion', classId: 'striker',
      stats: { ...statsForClassAtLevel('striker', 6), skl: 0 },
      skills: ['liuguang'], portraitSet: 'x', createdAt: TODAY,
    }
    const base = makeInput()
    const input = makeInput({
      party: [PLAYER, caster],
      gameState: { ...base.gameState, roundPlan: { mira: 'liuguang' }, enemies: [makeMonster({ maxHp: 9999, hp: 9999 })] },
      roll: () => 0.1,
    })
    const skillCrit = (due: string) => {
      const cast = gameReducer(input, { type: 'TodoCompleted', todo: datedTodo(due) })
        .effects.find((e) => e.type === 'skillCast' && e.skillId === 'liuguang')
      return cast?.type === 'skillCast' && cast.crit === true
    }
    expect(skillCrit('2026-05-30')).toBe(true) // on time → the skill can crit
    expect(skillCrit('2026-05-28')).toBe(false) // overdue → same roll, no crit
  })

  it('freezes the bonus onto the ActiveRound so the step-through reuses it', () => {
    const r = gameReducer(makeInput(), { type: 'RoundBegan', todo: datedTodo('2026-05-29') })
    expect(r.gameState.activeRound?.critBonusPct).toBe(DEADLINE_CRIT_BONUS)
  })

  it('the step-through RESUME applies the bonus to a real attack, not just stores the value', () => {
    // RoundBegan pauses at the (plan-less) player's first turn; RoundAdvanced resolves the basic
    // attack on the resumed dispatch — which must re-read ar.critBonusPct, or the crit never lands.
    const player: Character = { ...PLAYER, stats: { ...statsForClassAtLevel('vanguard', 1), skl: 0 } }
    const base = makeInput()
    const resumeCrit = (due: string) => {
      const input = makeInput({
        party: [player],
        gameState: { ...base.gameState, partyIds: ['player'], unlockedCompanionIds: [], roundPlan: {}, enemies: [makeMonster({ maxHp: 9999, hp: 9999, atk: 1 })] },
        roll: () => 0.1,
      })
      const r0 = gameReducer(input, { type: 'RoundBegan', todo: datedTodo(due) })
      expect(r0.gameState.activeRound).toBeTruthy() // paused at the player's decision (not finalized)
      const r1 = gameReducer({ ...input, gameState: r0.gameState, affinities: r0.affinities }, { type: 'RoundAdvanced', choice: 'basic' })
      return r1.effects.some((e) => e.type === 'damage' && e.actorId === 'player' && e.crit === true)
    }
    expect(resumeCrit('2026-05-30')).toBe(true) // resume re-reads the frozen bonus → crit
    expect(resumeCrit('2026-05-28')).toBe(false) // overdue → no bonus on resume
  })
})
