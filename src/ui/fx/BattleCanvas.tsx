// §27 battle FX overlay. A transparent PixiJS canvas stacked ABOVE the DOM battle
// sprites (pointer-events none): the DOM keeps owning layout/bars/intel (it already
// works and is accessible), Pixi adds what DOM can't — particles, hit flashes, screen
// shake, synth SFX. Anchors come from the sprites' data-fx-anchor attributes, so the
// overlay follows the layout with zero coordinate bookkeeping.
//
// Degradation ladder (效率优先): 战斗特效 off OR prefers-reduced-motion → no canvas, no
// shake (SFX stays unless volume 0); test env → fully inert. Pixi loads in an async
// chunk on first mount and never blocks first paint.

import { useEffect, useRef } from 'react'
import { playSfx, setSfxVolume } from '../../audio/sfx'
import { useSettings } from '../../state/settingsStore'
import { prefersReducedMotion } from '../reducedMotion'
import { subscribeBattleFX } from './battleFXBus'
import { cuesFor, type FxCue } from './fxDirector'
import type { FxStageHandle } from './pixiFx'

/** Stagger between cue beats — long enough to read each hit, short enough to feel snappy. */
const BEAT_MS = 110
/** Hard cap per dispatch so a long AoE round can't queue seconds of noise. */
const MAX_CUES_PER_BATCH = 10

export function BattleCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const fxOn = useSettings((s) => s.settings.battleFx !== false)
  const sfxVolume = useSettings((s) => s.settings.sfxVolume ?? 70)

  useEffect(() => {
    setSfxVolume(sfxVolume)
  }, [sfxVolume])

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return // jsdom: fully inert
    const reduced = prefersReducedMotion()
    let stage: FxStageHandle | null = null
    let disposed = false
    const timers: ReturnType<typeof setTimeout>[] = []

    if (fxOn && !reduced && hostRef.current) {
      void import('./pixiFx')
        .then(async (m) => {
          // Pixi owns its canvas (appended into the host) — see createFxStage for why a
          // caller-owned canvas breaks under StrictMode's dev double-mount.
          const s = await m.createFxStage(hostRef.current!)
          if (disposed) s.destroy()
          else stage = s
        })
        .catch(() => {
          /* WebGL unavailable → SFX/shake-only mode */
        })
    }

    /** Anchor → host-local point (sprite center, biased up into the body). */
    const pointFor = (anchorId?: string): { x: number; y: number } => {
      const host = hostRef.current
      const box = host?.getBoundingClientRect()
      if (!host || !box) return { x: 0, y: 0 }
      const fallback = { x: box.width / 2, y: box.height / 2 }
      if (!anchorId) return fallback
      const el = host.closest('.stage-scene')?.querySelector(`[data-fx-anchor="${CSS.escape(anchorId)}"]`)
      if (!el) return fallback
      const r = el.getBoundingClientRect()
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height * 0.42 }
    }

    const sceneEl = (): HTMLElement | null => hostRef.current?.closest('.stage-scene') ?? null

    const pulseClass = (cls: string) => {
      const el = sceneEl()
      if (!el) return
      el.classList.remove(cls)
      void el.offsetWidth // restart the CSS animation
      el.classList.add(cls)
    }

    const playCue = (cue: FxCue) => {
      if (cue.sfx) playSfx(cue.sfx)
      if (!reduced && fxOn) {
        if (cue.shake) pulseClass(cue.shake === 'heavy' ? 'fx-shake-heavy' : 'fx-shake')
        if (cue.flash) pulseClass('fx-flash')
        const host = hostRef.current
        if (stage && host) {
          stage.play(cue, pointFor(cue.anchorId), { w: host.clientWidth, h: host.clientHeight })
        }
      }
    }

    const unsub = subscribeBattleFX((effects) => {
      const cues = cuesFor(effects).slice(0, MAX_CUES_PER_BATCH)
      cues.forEach((cue, i) => {
        if (i === 0) playCue(cue)
        else timers.push(setTimeout(() => playCue(cue), i * BEAT_MS))
      })
    })

    return () => {
      disposed = true
      unsub()
      for (const t of timers) clearTimeout(t)
      stage?.destroy()
      stage = null
    }
  }, [fxOn])

  return <div ref={hostRef} className="battle-canvas" aria-hidden />
}
