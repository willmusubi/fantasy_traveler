// §32 — the full battle scene: backdrop diorama + FigureActors + the shared §27 particle
// engine, one Pixi app. Replaces the plain FX overlay when battle FX are on (same canvas
// slot, same degradation ladder). The DOM keeps every information surface (names, bars,
// chips, click targets); this stage owns ONLY the bodies and the atmosphere.
//
// Division of labor with BattleCanvas: the React side schedules timeline actions (it owns
// DOM classes for shake/flash/zoom and the cue clock); this module renders. `act()` is
// fire-and-forget per action; figure tween lifetimes ride the app ticker (die with the app).

import { Container, type Application } from 'pixi.js'
import { createParticleEngine, destroyPixiApp, initPixiApp, type FxStageHandle } from '../pixiFx'
import { createBackdrop, type BackdropHandle } from './backdrop'
import type { SceneAction } from './choreographer'
import { FigureActor } from './figures'
import { enemyCandidates, evictTexture, partyCandidates, resolveFigureArt } from './textures'

export interface SceneActor {
  id: string
  side: 'party' | 'enemy'
  /** Party art chain key (Character.portraitSet). */
  portraitSet?: string
  /** Enemy art chain key (Monster.artSet) — absent = emoji figure. */
  artSet?: string
  /** Fallback glyph — the same one the DOM sprite would show. */
  emoji: string
  /** Relative size (boss 1.15, mook 0.9, default 1). */
  scale?: number
  /** Spawn already-downed (mid-fight remounts, saved states). */
  downed?: boolean
}

export interface SceneStageHandle extends FxStageHandle {
  /** Sync the cast: new actors load art and enter; departed actors evict and leave. */
  setActors(actors: SceneActor[]): void
  /** Figure-level timeline actions (cue/camera actions are handled by BattleCanvas). */
  act(action: SceneAction): void
  /** Re-derive every figure's base position from the DOM anchors (resize, layout shifts). */
  remeasure(): void
}

/** Feet-point for an actor, in canvas coords: bottom-center of the (visibility-hidden) DOM
 *  body box, so canvas figures stand EXACTLY where the DOM sprites stood. */
export type MeasureBase = (id: string) => { x: number; y: number } | null

export async function createSceneStage(host: HTMLElement, measure: MeasureBase): Promise<SceneStageHandle> {
  const app: Application = await initPixiApp(host)

  const backdropRoot = new Container()
  const enemyLayer = new Container()
  const partyLayer = new Container() // party draws over enemies (camera-front)
  const particleLayer = new Container()
  app.stage.addChild(backdropRoot, enemyLayer, partyLayer, particleLayer)

  const backdrop: BackdropHandle = createBackdrop(app, backdropRoot)
  const engine = createParticleEngine(app, particleLayer)

  interface Entry {
    spec: SceneActor
    actor?: FigureActor
    url?: string
  }
  const cast = new Map<string, Entry>()
  let generation = 0
  let destroyed = false

  const hostH = () => app.renderer.height / app.renderer.resolution
  const hostW = () => app.renderer.width / app.renderer.resolution

  const positionActor = (id: string) => {
    const entry = cast.get(id)
    if (!entry?.actor || entry.actor.destroyed) return
    const base = measure(id)
    if (base) entry.actor.setBase(base.x, base.y)
  }

  const spawn = async (spec: SceneActor, gen: number) => {
    const hasKey = Boolean(spec.side === 'party' ? spec.portraitSet : spec.artSet)
    const candidates = spec.side === 'party' ? partyCandidates(spec.portraitSet ?? '') : enemyCandidates(spec.artSet)
    const art = await resolveFigureArt(hasKey ? candidates : [])
    if (destroyed || gen !== generation) {
      // The cast changed (or the stage died) while this texture loaded — drop it.
      return
    }
    const entry = cast.get(spec.id)
    if (!entry || entry.actor) return
    const sizeMult = spec.scale ?? 1
    const targetH =
      art.kind === 'fullbody' || art.kind === 'enemy'
        ? hostH() * 0.56 * sizeMult
        : art.kind === 'sheet'
          ? hostH() * 0.28 * sizeMult // chibi sheets fill ~99% of their frame; 0.28 keeps the compact FF-party scale (user-tuned)
          : art.kind === 'pixel'
            ? hostH() * 0.46 * sizeMult
            : hostH() * 0.3 // head token / emoji stay near the DOM sprite size
    const actor = new FigureActor(app, {
      id: spec.id,
      art,
      emoji: spec.emoji,
      facing: spec.side === 'party' ? 1 : -1,
      targetH,
    })
    entry.actor = actor
    entry.url = art.url
    ;(spec.side === 'party' ? partyLayer : enemyLayer).addChild(actor)
    if (spec.downed) actor.setDowned(true)
    positionActor(spec.id)
  }

  const setActors = (actors: SceneActor[]) => {
    if (destroyed) return
    generation++
    const next = new Set(actors.map((a) => a.id))
    for (const [id, entry] of cast) {
      if (next.has(id)) continue
      entry.actor?.destroy()
      evictTexture(entry.url)
      cast.delete(id)
    }
    for (const spec of actors) {
      if (cast.has(spec.id)) continue
      cast.set(spec.id, { spec })
      void spawn(spec, generation)
    }
  }

  const act = (action: SceneAction) => {
    if (destroyed) return
    if (action.kind === 'victory') {
      for (const e of cast.values()) {
        if (e.spec.side === 'party' && e.actor && !e.actor.destroyed) e.actor.victory()
      }
      return
    }
    if (!('actorId' in action)) return
    const entry = cast.get(action.actorId)
    const actor = entry?.actor
    if (!entry || !actor || actor.destroyed) return
    positionActor(action.actorId) // layout may have shifted (chips appeared) — stand correct first
    const dir = entry.spec.side === 'party' ? 1 : -1
    switch (action.kind) {
      case 'lunge': {
        const dist = Math.min(56, Math.max(26, hostW() * 0.055))
        actor.lunge(dir * dist)
        break
      }
      case 'hit':
        actor.hit(dir * -13) // knocked AWAY from the foe
        break
      case 'casting':
        actor.casting(action.seconds, dir * -6)
        break
      case 'downed':
        actor.setDowned(true)
        break
      case 'tint':
        actor.tintPulse(action.color, action.seconds)
        break
    }
  }

  const remeasure = () => {
    // Force the renderer to the host's CURRENT size first — scene-on grows the stage right
    // after init, and Pixi's resizeTo plugin applies asynchronously; measuring against a
    // stale 250px-tall renderer leaves every figure CSS-stretched ~30% too low.
    app.resize()
    backdrop.layout()
    for (const id of cast.keys()) positionActor(id)
  }
  const ro = new ResizeObserver(() => remeasure())
  ro.observe(host)

  // One ticker drives every figure's breathing (cheaper than per-actor ticker fns).
  const tick = () => {
    const dt = app.ticker.deltaMS / 1000
    for (const e of cast.values()) {
      if (e.actor && !e.actor.destroyed) e.actor.update(dt)
    }
  }
  app.ticker.add(tick)

  // Browser-verification probe (mirrors __fxDebug).
  ;(window as unknown as Record<string, unknown>).__sceneDebug = {
    actors: () => [...cast.keys()],
    renderer: app.renderer.name,
  }

  return {
    play: engine.play,
    setActors,
    act,
    remeasure,
    destroy: () => {
      destroyed = true
      generation++
      ro.disconnect()
      app.ticker.remove(tick)
      for (const entry of cast.values()) {
        entry.actor?.destroy()
        evictTexture(entry.url)
      }
      cast.clear()
      backdrop.destroy()
      destroyPixiApp(app)
    },
  }
}
