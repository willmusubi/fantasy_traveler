// §27/§32 battle canvas. With battle FX on, this mounts the FULL SCENE stage (§32): a
// painted night diorama + paper-doll battle figures + the particle engine, stacked over a
// DOM that keeps owning every information surface (names/bars/chips/click targets — the
// `.scene-on` CSS hides only the DOM bodies, preserving layout so anchors keep measuring).
// The scene-on class is added ONLY after the stage actually initializes, so a WebGL failure
// degrades to the untouched DOM sprites instead of an empty battlefield.
//
// Degradation ladder (效率优先): 战斗特效 off OR prefers-reduced-motion → no canvas, no
// shake (SFX stays unless volume 0); test env → fully inert. Pixi loads in an async
// chunk on first mount and never blocks first paint.
//
// Choreography: every dispatch maps to a SceneTimeline (pure choreographFor). The mode
// heuristic is exact because publishBattleFX fires BEFORE the store updates: an open
// activeRound at publish time = the interactive step-through ('full' beats); none = the
// sync auto path ('highlight', the ≤2.5s non-blocking reel). State is already resolved
// before a single frame plays.

import { useEffect, useRef } from 'react'
import { playSfx, setSfxVolume } from '../../audio/sfx'
import { t } from '../../i18n'
import { selectPlayer, useGame } from '../../state/gameStore'
import { useSettings } from '../../state/settingsStore'
import { resourceOf } from '../../game/resources'
import { CLASS_EMOJI, enemyEmoji } from '../battleSprites'
import { prefersReducedMotion } from '../reducedMotion'
import { subscribeBattleFX } from './battleFXBus'
import { choreographFor } from './scene/choreographer'
import type { SceneActor, SceneStageHandle } from './scene/sceneStage'
import { cuesFor, type FxCue } from './fxDirector'

/** Stagger between cue beats on the no-scene fallback path. */
const BEAT_MS = 110
/** Hard cap per dispatch so a long AoE round can't queue seconds of noise. */
const MAX_CUES_PER_BATCH = 10

/** The current cast, derived from the store (party + enemies with their art keys). */
function computeActors(): SceneActor[] {
  const st = useGame.getState()
  const gs = st.gameState
  if (!gs) return []
  const player = selectPlayer(st)
  const companions = gs.partyIds
    .map((id) => st.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null && c.kind === 'companion')
  const inQuest = Boolean(st.activeQuest)
  const party: SceneActor[] = [player, ...companions]
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      side: 'party' as const,
      portraitSet: c.portraitSet,
      emoji: c.kind === 'player' ? CLASS_EMOJI[c.classId] ?? '⚔️' : '🙂',
      downed: resourceOf(gs, c).hp <= 0,
    }))
  const enemies: SceneActor[] = gs.enemies.map((m) => ({
    id: m.id,
    side: 'enemy' as const,
    artSet: m.artSet,
    emoji: m.hp <= 0 ? '💀' : enemyEmoji(m.displayName ?? t(m.nameKey), inQuest),
    scale: m.archetype === 'boss' ? 1.18 : m.archetype === 'mook' ? 0.88 : 1,
    downed: m.hp <= 0,
  }))
  return [...party, ...enemies]
}

/** Identity key: when THIS changes the cast must re-sync (downed flips animate instead). */
function actorsKey(actors: SceneActor[]): string {
  return actors.map((a) => `${a.id}:${a.portraitSet ?? a.artSet ?? ''}:${a.scale ?? 1}`).join('|')
}

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
    let stage: SceneStageHandle | null = null
    let disposed = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let unsubActors: (() => void) | null = null

    const sceneEl = (): HTMLElement | null => hostRef.current?.closest('.stage-scene') ?? null

    /** Anchor → host-local point (sprite center, biased up into the body) — particle bursts. */
    const pointFor = (anchorId?: string): { x: number; y: number } => {
      const host = hostRef.current
      const box = host?.getBoundingClientRect()
      if (!host || !box) return { x: 0, y: 0 }
      const fallback = { x: box.width / 2, y: box.height / 2 }
      if (!anchorId) return fallback
      const el = sceneEl()?.querySelector(`[data-fx-anchor="${CSS.escape(anchorId)}"]`)
      if (!el) return fallback
      const r = el.getBoundingClientRect()
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height * 0.42 }
    }

    /** Anchor → FEET point: bottom-center of the (visibility-hidden) DOM body box, so the
     *  canvas figure stands exactly where the DOM sprite stood. */
    const basePointFor = (anchorId: string): { x: number; y: number } | null => {
      const host = hostRef.current
      const box = host?.getBoundingClientRect()
      if (!host || !box) return null
      const anchor = sceneEl()?.querySelector(`[data-fx-anchor="${CSS.escape(anchorId)}"]`)
      if (!anchor) return null
      const body = anchor.querySelector('.bsprite-body, .enemy-card-sprite') ?? anchor
      const r = body.getBoundingClientRect()
      return { x: r.left - box.left + r.width / 2, y: r.bottom - box.top }
    }

    if (fxOn && !reduced && hostRef.current) {
      void import('./scene/sceneStage')
        .then(async (m) => {
          // Pixi owns its canvas (appended into the host) — see initPixiApp for why a
          // caller-owned canvas breaks under StrictMode's dev double-mount.
          const s = await m.createSceneStage(hostRef.current!, basePointFor)
          if (disposed) {
            s.destroy()
            return
          }
          stage = s
          // Only now is it safe to hide the DOM bodies — the figures are really live.
          sceneEl()?.classList.add('scene-on')
          // Two RAFs: scene-on changes the stage height → let layout settle, then measure.
          requestAnimationFrame(() => requestAnimationFrame(() => stage?.remeasure()))
          const sync = () => {
            const actors = computeActors()
            stage?.setActors(actors)
            requestAnimationFrame(() => stage?.remeasure())
          }
          sync()
          let lastKey = actorsKey(computeActors())
          unsubActors = useGame.subscribe((state) => {
            void state
            const key = actorsKey(computeActors())
            if (key !== lastKey) {
              lastKey = key
              sync()
            }
          })
        })
        .catch(() => {
          /* WebGL unavailable → SFX/shake-only mode, DOM sprites untouched */
        })
    }

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
      if (stage) {
        // §32 scene mode: the full choreographed timeline (figures + cues + camera).
        const mode = useGame.getState().gameState?.activeRound ? 'full' : 'highlight'
        const timeline = choreographFor(effects, mode)
        for (const action of timeline.actions) {
          const run = () => {
            if (disposed) return
            if (action.kind === 'cue') playCue(action.cue)
            else if (action.kind === 'camera') pulseClass(action.preset === 'punchHeavy' ? 'fx-zoom-heavy' : 'fx-zoom-light')
            else stage?.act(action)
          }
          if (action.at <= 0) run()
          else timers.push(setTimeout(run, action.at * 1000))
        }
        return
      }
      // Fallback (no canvas / init pending): the §27 staggered cue path, byte-identical.
      const cues = cuesFor(effects).slice(0, MAX_CUES_PER_BATCH)
      cues.forEach((cue, i) => {
        if (i === 0) playCue(cue)
        else timers.push(setTimeout(() => playCue(cue), i * BEAT_MS))
      })
    })

    return () => {
      disposed = true
      unsub()
      unsubActors?.()
      for (const t of timers) clearTimeout(t)
      sceneEl()?.classList.remove('scene-on')
      stage?.destroy()
      stage = null
    }
  }, [fxOn])

  return <div ref={hostRef} className="battle-canvas" aria-hidden />
}
