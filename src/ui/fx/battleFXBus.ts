// §27 battle-FX bus. gameStore.ingestResult PUBLISHES each dispatch's GameEffect batch;
// the FX layer (BattleCanvas) SUBSCRIBES and plays juice (particles / shake / SFX) from it.
// Deliberately NOT Zustand state: effect batches are fire-and-forget presentation events —
// re-rendering React for them would be waste. Module-level singleton, zero deps.

import type { GameEffect } from '../../domain/types'

type Listener = (effects: GameEffect[]) => void

const listeners = new Set<Listener>()

export function subscribeBattleFX(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function publishBattleFX(effects: GameEffect[]): void {
  if (effects.length === 0 || listeners.size === 0) return
  for (const fn of listeners) fn(effects)
}
