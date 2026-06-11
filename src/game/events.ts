// Domain events (§7). The full union is kept for extensibility; the reducer only
// wires TodoCompleted + TodoOverdue in M0 (others are no-ops until their milestone).

import type { CalendarEvent, ID, JournalEntry, SkillId, Todo } from '../domain/types'

export type DomainEvent =
  | { type: 'TodoCompleted'; todo: Todo }
  | { type: 'TodoOverdue'; todo: Todo }
  | { type: 'TaskTimerExpired'; todo: Todo }
  | { type: 'JournalWritten'; entry: JournalEntry }
  | { type: 'CalendarEventAttended'; event: CalendarEvent }
  | { type: 'FocusStreak'; days: number }
  | { type: 'DialogueInteraction'; characterId: ID }
  // §28 growth systems
  | { type: 'TalentLearned'; characterId: ID; nodeId: string }
  /** Fired by habitStore AFTER stamping milestoneRewardedAt (grant-once lives in the store). */
  | { type: 'HabitMilestone'; habitId: ID; streak: number }
  // Interactive (FF-style) combat round, driven by the RoundResolver overlay.
  // §26: `choice` also accepts the GUARD_ACTION sentinel ('guard' — the 防御 stance).
  | { type: 'RoundBegan'; todo: Todo }
  | { type: 'RoundAdvanced'; choice?: SkillId | 'basic'; auto?: boolean; targetId?: ID }
  // Script branching (§23): the player picked a post-boss option in the ScriptChoiceModal.
  | { type: 'ScriptChoicePicked'; optionId: string }

export type DomainEventType = DomainEvent['type']

type Listener = (event: DomainEvent) => void

/** Minimal typed event bus for decoupling producers (productivity) from the game pipeline. */
export class EventBus {
  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(event: DomainEvent): void {
    for (const fn of this.listeners) fn(event)
  }
}

export const eventBus = new EventBus()
