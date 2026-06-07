// Habit store: per-day grant-once buff offer, un-check, streak continuity/break, the
// streak-break sweep (+ random debuff), and the game-store buff-choice actions. Runs against
// a real (faked) IndexedDB, mirroring todoStore.test.ts.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../data/db'
import { habitsRepo } from '../data/repositories'
import { HABIT_BUFF_ACTIVE_CAP } from '../domain/config'
import { localDateKey } from '../domain/dates'
import type { Habit } from '../domain/types'
import { useGame } from './gameStore'
import { useHabits } from './habitStore'

/** Local date key offset from now by whole days (negative = past). */
const dayKey = (offsetDays: number) => localDateKey(new Date(Date.now() + offsetDays * 86_400_000))

const seededHabit = (over: Partial<Habit>): Habit => ({
  id: 'h-seed', title: 'x', schedule: { kind: 'daily' }, streak: 0, bestStreak: 0,
  order: 1, createdAt: '2026-01-01T00:00:00.000Z', ...over,
})

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({
    gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamage: null,
    activeQuest: null, recruitedId: null, victorySummary: null, pendingBuffChoices: [], ready: false,
  })
  useHabits.setState({ habits: [], loaded: false })
})

describe('habit store — daily grant-once + buff offer', () => {
  it('completing offers a buff, bumps the streak, and is per-day grant-once', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await useHabits.getState().add({ title: '按时起床', schedule: { kind: 'daily' } })
    const id = useHabits.getState().habits[0].id

    await useHabits.getState().complete(id)
    let h = useHabits.getState().habits[0]
    expect(h.streak).toBe(1)
    expect(h.bestStreak).toBe(1)
    expect(h.lastCompletedOn).toBe(dayKey(0))
    expect(h.rewardedOn).toBe(dayKey(0))
    expect(useGame.getState().pendingBuffChoices).toHaveLength(1) // a buff draft was offered
    expect(useGame.getState().pendingBuffChoices[0].options.length).toBeGreaterThanOrEqual(3)

    // Un-check: visual only — credit + streak stay locked.
    await useHabits.getState().uncheck(id)
    h = useHabits.getState().habits[0]
    expect(h.lastCompletedOn).toBeUndefined()
    expect(h.rewardedOn).toBe(dayKey(0))
    expect(h.streak).toBe(1)

    // Re-complete the same day: re-checks the box but offers NO new buff.
    await useHabits.getState().complete(id)
    expect(useHabits.getState().habits[0].lastCompletedOn).toBe(dayKey(0))
    expect(useGame.getState().pendingBuffChoices).toHaveLength(1) // still just the one
  })

  it('a continuous next-day completion increments the streak', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await habitsRepo.put(seededHabit({ id: 'h-cont', streak: 1, bestStreak: 1, lastCompletedOn: dayKey(-1), rewardedOn: dayKey(-1) }))
    await useHabits.getState().hydrate()

    await useHabits.getState().complete('h-cont')
    const h = useHabits.getState().habits.find((x) => x.id === 'h-cont')!
    expect(h.streak).toBe(2)
    expect(h.bestStreak).toBe(2)
  })

  it('sweepHabits breaks a missed streak, applies a debuff, and is idempotent', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await habitsRepo.put(seededHabit({ id: 'h-miss', streak: 3, bestStreak: 3, lastCompletedOn: dayKey(-2), rewardedOn: dayKey(-2) }))
    await useHabits.getState().hydrate()

    await useHabits.getState().sweepHabits()
    const h = useHabits.getState().habits.find((x) => x.id === 'h-miss')!
    expect(h.streak).toBe(0)
    expect(h.lastMissOn).toBe(dayKey(0))
    const buffs = useGame.getState().gameState!.partyBuffs
    expect(buffs.some((b) => b.untilVictory && b.magnitude < 0)).toBe(true) // a debuff landed

    // A second sweep the same day does nothing more (lastMissOn guard).
    const before = useGame.getState().gameState!.partyBuffs.length
    await useHabits.getState().sweepHabits()
    expect(useGame.getState().gameState!.partyBuffs.length).toBe(before)
  })

  it('bestStreak never decreases when a streak breaks', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    await habitsRepo.put(seededHabit({ id: 'h-best', streak: 5, bestStreak: 5, lastCompletedOn: dayKey(-3), rewardedOn: dayKey(-3) }))
    await useHabits.getState().hydrate()
    await useHabits.getState().sweepHabits()
    const h = useHabits.getState().habits.find((x) => x.id === 'h-best')!
    expect(h.streak).toBe(0)
    expect(h.bestStreak).toBe(5)
  })

  it('add refuses a blank title and a weekly habit with no days', async () => {
    await useHabits.getState().add({ title: '   ', schedule: { kind: 'daily' } })
    await useHabits.getState().add({ title: '读书', schedule: { kind: 'weekly', days: [] } })
    expect(useHabits.getState().habits).toHaveLength(0)
    await useHabits.getState().add({ title: '读书', schedule: { kind: 'weekly', days: [1, 3] } })
    expect(useHabits.getState().habits).toHaveLength(1)
  })
})

describe('game store — buff choice', () => {
  it('chooseBuff applies the picked buff (untilVictory) and dequeues it', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    useGame.getState().offerBuffChoice()
    const opt = useGame.getState().pendingBuffChoices[0].options[0]

    await useGame.getState().chooseBuff(opt.id)
    expect(useGame.getState().pendingBuffChoices).toHaveLength(0)
    const buffs = useGame.getState().gameState!.partyBuffs
    expect(buffs.some((b) => b.untilVictory && b.kind === opt.kind && b.magnitude === opt.magnitude)).toBe(true)
  })

  it('caps simultaneously-active habit buffs (FIFO eviction)', async () => {
    await useGame.getState().seedNewGame('阿旅', 'vanguard')
    for (let i = 0; i < HABIT_BUFF_ACTIVE_CAP + 2; i++) {
      useGame.getState().offerBuffChoice()
      const opt = useGame.getState().pendingBuffChoices[0].options[0]
      await useGame.getState().chooseBuff(opt.id)
    }
    const run = useGame.getState().gameState!.partyBuffs.filter((b) => b.untilVictory)
    expect(run.length).toBe(HABIT_BUFF_ACTIVE_CAP)
  })
})
