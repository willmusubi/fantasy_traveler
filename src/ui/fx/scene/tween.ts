// §32 — minimal ticker-driven interpolation for the battle scene. No third-party tween lib:
// everything here rides the Pixi Application ticker, so animations die WITH the app (no
// setTimeout callbacks firing into destroyed display objects — the failure mode that killed
// naive cleanup in §27). All durations are in SECONDS.

import type { Application } from 'pixi.js'

export type Easing = (t: number) => number

export const ease = {
  linear: ((t) => t) as Easing,
  outQuad: ((t) => 1 - (1 - t) * (1 - t)) as Easing,
  inQuad: ((t) => t * t) as Easing,
  inOutQuad: ((t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)) as Easing,
  outCubic: ((t) => 1 - (1 - t) ** 3) as Easing,
  /** Overshoots past 1 then settles — victory hops, bouncy pulses. */
  outBack: ((t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
  }) as Easing,
}

/** Cancel handle: stops the tween/delay immediately; onComplete does NOT fire. */
export type Cancel = () => void

export interface TweenOpts {
  /** Seconds. */
  duration: number
  ease?: Easing
  /** Called every frame with the eased progress k ∈ [0, 1]. The caller interpolates. */
  onUpdate: (k: number) => void
  onComplete?: () => void
}

/** Drive k from 0→1 over `duration` seconds on the app ticker. Returns a cancel fn. */
export function tween(app: Application, opts: TweenOpts): Cancel {
  const easing = opts.ease ?? ease.outQuad
  let elapsed = 0
  let done = false
  const tick = () => {
    elapsed += app.ticker.deltaMS / 1000
    const t = Math.min(1, opts.duration <= 0 ? 1 : elapsed / opts.duration)
    opts.onUpdate(easing(t))
    if (t >= 1) {
      detach()
      opts.onComplete?.()
    }
  }
  const detach = () => {
    if (done) return
    done = true
    app.ticker.remove(tick)
  }
  app.ticker.add(tick)
  // Kick the first frame immediately so a 0-duration tween still lands its end state.
  if (opts.duration <= 0) tick()
  return detach
}

/** Ticker-based delay (NOT setTimeout): pauses with the ticker, dies with the app. */
export function delay(app: Application, seconds: number, fn: () => void): Cancel {
  if (seconds <= 0) {
    fn()
    return () => {}
  }
  let elapsed = 0
  let done = false
  const tick = () => {
    elapsed += app.ticker.deltaMS / 1000
    if (elapsed >= seconds) {
      detach()
      fn()
    }
  }
  const detach = () => {
    if (done) return
    done = true
    app.ticker.remove(tick)
  }
  app.ticker.add(tick)
  return detach
}

/** A disposable bag of cancel handles — one per playing timeline/actor; cancelAll on
 *  interrupt (a new batch arrives) or destroy. */
export class CancelBag {
  private bag = new Set<Cancel>()
  add(c: Cancel): Cancel {
    this.bag.add(c)
    return () => {
      this.bag.delete(c)
      c()
    }
  }
  cancelAll(): void {
    for (const c of this.bag) c()
    this.bag.clear()
  }
}
