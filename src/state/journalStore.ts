import { create } from 'zustand'
import { pickJournalLine } from '../companion/cannedLines'
import { journalRepo } from '../data/repositories'
import type { JournalEntry, Mood } from '../domain/types'
import { dispatchEvent } from '../game/pipeline'
import { selectPartyCompanions, useGame } from './gameStore'

interface AddInput {
  /** YYYY-MM-DD (local) the entry is filed under (defaults handled by the UI). */
  date: string
  mood: Mood
  title?: string
  body: string
}

interface JournalStore {
  entries: JournalEntry[]
  loaded: boolean
  hydrate: () => Promise<void>
  add: (input: AddInput) => Promise<void>
}

/** Newest first — what the timeline/day views want. */
export function byNewest(a: JournalEntry, b: JournalEntry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

export const useJournal = create<JournalStore>((set, get) => ({
  entries: [],
  loaded: false,

  async hydrate() {
    set({ entries: await journalRepo.all(), loaded: true })
  },

  async add({ date, mood, title, body }) {
    const text = body.trim()
    if (!text) return
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      date,
      mood,
      title: title?.trim() || undefined,
      body: text,
      createdAt: new Date().toISOString(),
    }
    await journalRepo.put(entry)
    set({ entries: [...get().entries, entry] })

    // Economy is a game concern → only when a game exists (journaling is reachable only
    // after onboarding, but guard so a stray call can't throw in the pipeline).
    if (!useGame.getState().gameState) return

    // Reflection pays party-wide XP + affinity (split among present companions); the
    // reducer enforces the once-per-local-day cap and the mood flag. NOT a combat hit.
    const result = await dispatchEvent({ type: 'JournalWritten', entry })
    useGame.getState().ingestResult(result)

    // The felt reward: a RANDOM on-field companion responds (mood-keyed canned line), shown
    // with her portrait in the global ReactionPopup.
    const companions = selectPartyCompanions(useGame.getState())
    const reactor = companions[Math.floor(Math.random() * companions.length)]
    if (reactor) {
      const line = pickJournalLine(reactor.id, mood, get().entries.length)
      const aff = result.effects.find((e) => e.type === 'affinity' && e.characterId === reactor.id)
      useGame.getState().showReaction({
        companionId: reactor.id,
        text: line.text,
        expression: line.expression,
        affinityDelta: aff && aff.type === 'affinity' ? aff.amount : 0,
      })
    }
  },
}))
