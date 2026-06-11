// §27 PixiJS particle layer — Graphics/Text-only spawners (ZERO texture assets), driven
// by FxCue recipes. This module imports pixi.js statically and is ONLY ever loaded via
// dynamic import from BattleCanvas, so Pixi lives in an async chunk and never touches
// the test environment or users with 战斗特效 off.

import { Application, Container, Graphics, Text } from 'pixi.js'
import type { FxCue } from './fxDirector'

interface Particle {
  node: Container
  vx: number
  vy: number
  /** px/s² downward; negative = floats up. */
  gravity: number
  life: number
  ttl: number
  /** Per-second scale growth (rings expand). */
  grow?: number
}

export interface FxStageHandle {
  play: (cue: FxCue, at: { x: number; y: number }, stage: { w: number; h: number }) => void
  destroy: () => void
}

const GOLD = 0xf4c64e
const RED = 0xef5a4c
const GREEN = 0x5fd29a
const CYAN = 0x9ad7ff
const GREY = 0x9aa0b4
const WHITE = 0xffffff

/** Mount a fresh Pixi app INTO `host` (we never reuse a caller-owned canvas: destroying a
 *  Pixi app calls loseContext(), and a canvas's WebGL context is PERMANENT — under React
 *  StrictMode's dev double-mount the second init would inherit a dead context and present
 *  nothing, i.e. an uninitialized white buffer. A Pixi-owned canvas per mount is immune). */
export async function createFxStage(host: HTMLElement): Promise<FxStageHandle> {
  const app = new Application()
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    preference: 'webgl',
    resizeTo: host,
  })
  app.canvas.style.width = '100%'
  app.canvas.style.height = '100%'
  app.canvas.style.display = 'block'
  host.appendChild(app.canvas)
  // Debug probe (harmless in prod): lets browser verification confirm the FX layer is live.
  ;(window as unknown as Record<string, unknown>).__fxDebug = {
    renderer: app.renderer.name,
    bgAlpha: app.renderer.background.alpha,
    tickerStarted: app.ticker.started,
  }
  const layer = new Container()
  app.stage.addChild(layer)
  const particles: Particle[] = []

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life >= p.ttl || p.node.destroyed) {
        if (!p.node.destroyed) p.node.destroy()
        particles.splice(i, 1)
        continue
      }
      p.vy += p.gravity * dt
      p.node.x += p.vx * dt
      p.node.y += p.vy * dt
      p.node.alpha = 1 - p.life / p.ttl
      if (p.grow) p.node.scale.set(p.node.scale.x + p.grow * dt)
    }
  })

  const dot = (x: number, y: number, r: number, color: number): Graphics => {
    const g = new Graphics().circle(0, 0, r).fill(color)
    g.x = x
    g.y = y
    layer.addChild(g)
    return g
  }

  const burst = (x: number, y: number, opts: { color: number; count: number; speed: number; gravity?: number; r?: [number, number]; ttl?: number }) => {
    for (let i = 0; i < opts.count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = opts.speed * (0.4 + Math.random() * 0.6)
      const [rMin, rMax] = opts.r ?? [1.5, 3.5]
      particles.push({
        node: dot(x, y, rMin + Math.random() * (rMax - rMin), opts.color),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: opts.gravity ?? 260,
        life: 0,
        ttl: (opts.ttl ?? 0.65) * (0.7 + Math.random() * 0.5),
      })
    }
  }

  const ring = (x: number, y: number, color: number, ttl = 0.5) => {
    const g = new Graphics().circle(0, 0, 14).stroke({ width: 3, color })
    g.x = x
    g.y = y
    layer.addChild(g)
    particles.push({ node: g, vx: 0, vy: 0, gravity: 0, life: 0, ttl, grow: 3.2 })
  }

  const rise = (x: number, y: number, color: number, count: number) => {
    burst(x, y, { color, count, speed: 55, gravity: -120, ttl: 0.9 })
  }

  const glyphs = (x: number, y: number, text: string, color: number, count = 3) => {
    for (let i = 0; i < count; i++) {
      const t = new Text({ text, style: { fontSize: 12 + i * 3, fill: color, fontWeight: 'bold' } })
      t.x = x + (Math.random() - 0.5) * 26
      t.y = y - i * 6
      layer.addChild(t)
      particles.push({ node: t, vx: (Math.random() - 0.5) * 20, vy: -38 - i * 10, gravity: -8, life: 0, ttl: 1.0 + i * 0.15 })
    }
  }

  const confetti = (w: number, h: number) => {
    const colors = [GOLD, RED, GREEN, CYAN, 0xf08fc0]
    for (let i = 0; i < 42; i++) {
      const g = new Graphics().rect(-2, -3, 4, 6).fill(colors[i % colors.length])
      g.x = Math.random() * w
      g.y = -10 - Math.random() * h * 0.25
      g.rotation = Math.random() * Math.PI
      layer.addChild(g)
      particles.push({ node: g, vx: (Math.random() - 0.5) * 70, vy: 90 + Math.random() * 110, gravity: 60, life: 0, ttl: 1.4 + Math.random() * 0.7 })
    }
  }

  const play = (cue: FxCue, at: { x: number; y: number }, stage: { w: number; h: number }) => {
    const { x, y } = at
    switch (cue.kind) {
      case 'impact': burst(x, y, { color: GOLD, count: 12, speed: 170 }); dotFlash(x, y); break
      case 'crit': burst(x, y, { color: GOLD, count: 14, speed: 240 }); burst(x, y, { color: RED, count: 10, speed: 220 }); ring(x, y, GOLD); break
      case 'weak': burst(x, y, { color: 0xffa14d, count: 18, speed: 210 }); ring(x, y, 0xffa14d, 0.4); break
      case 'miss': burst(x, y, { color: GREY, count: 6, speed: 70, gravity: -40, ttl: 0.5 }); break
      case 'enemyHit': burst(x, y, { color: RED, count: 12, speed: 170 }); break
      case 'enemyHeavy': burst(x, y, { color: RED, count: 26, speed: 260 }); ring(x, y, RED, 0.55); break
      case 'skill': burst(x, y, { color: CYAN, count: 18, speed: 210 }); ring(x, y, WHITE, 0.4); break
      case 'heal': rise(x, y, GREEN, 14); ring(x, y, GREEN, 0.5); break
      case 'buff': rise(stage.w / 2, stage.h * 0.7, GOLD, 18); break
      case 'debuff': burst(stage.w / 2, stage.h * 0.4, { color: 0xb48fff, count: 16, speed: 90, gravity: 140 }); break
      case 'status': burst(x, y, { color: cue.color ?? GREY, count: 10, speed: 90, gravity: -30, ttl: 0.7 }); break
      case 'statusTick': burst(x, y, { color: cue.color ?? GREY, count: 6, speed: 60, gravity: 180, ttl: 0.5 }); break
      case 'sleepZzz': glyphs(x, y - 14, 'Z', cue.color ?? 0x9aa7ff); break
      case 'guard': ring(x, y, cue.color ?? 0x6fb1ff, 0.6); ring(x, y, WHITE, 0.4); break
      case 'telegraph': ring(x, y, 0xffe14d, 0.6); break
      case 'phase': ring(x, y, RED, 0.8); burst(x, y, { color: RED, count: 30, speed: 280 }); burst(x, y, { color: GOLD, count: 14, speed: 200 }); break
      case 'downed': burst(x, y, { color: GREY, count: 14, speed: 120, gravity: 320 }); break
      case 'victory': confetti(stage.w, stage.h); break
      case 'wipe': ring(stage.w / 2, stage.h / 2, RED, 0.9); burst(stage.w / 2, stage.h / 2, { color: 0x4a4f66, count: 30, speed: 200 }); break
      case 'levelup': glyphs(x, y - 10, '★', GOLD, 3); rise(x, y, GOLD, 10); break
      case 'none': break
    }
  }

  /** A fast white pop at the impact point — reads as the "hit frame". */
  const dotFlash = (x: number, y: number) => {
    particles.push({ node: dot(x, y, 9, WHITE), vx: 0, vy: 0, gravity: 0, life: 0, ttl: 0.14, grow: 2 })
  }

  return {
    play,
    destroy: () => {
      try {
        const canvas = app.canvas
        app.destroy(false, { children: true })
        canvas.remove() // pull the dead canvas out of the host
      } catch {
        /* double-destroy on hot-reload is harmless */
      }
    },
  }
}
