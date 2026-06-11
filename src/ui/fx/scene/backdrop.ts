// §32 — the painted night diorama behind the figures. Pure Graphics (zero texture assets),
// mirroring the palette of the CSS .stage-sky/.stage-ground it replaces while scene mode is
// active, plus what CSS can't do: a blurred far layer (depth of field), drifting starlight,
// a breathing moon halo, and a vignette. Resizes with the app (everything is re-laid-out on
// resize so the diorama never letterboxes).

import { BlurFilter, Container, Graphics, type Application } from 'pixi.js'

interface Star {
  g: Graphics
  /** 0..1 normalized position — survives resizes. */
  nx: number
  ny: number
  phase: number
  speed: number
}

export interface BackdropHandle {
  /** Re-layout to the current canvas size (call from a ResizeObserver). */
  layout(): void
  destroy(): void
}

// Palette lifted from global.css .stage-sky / .stage-ground.
const SKY_TOP = 0x1d1748
const SKY_MID = 0x392a63
const SKY_LOW = 0x6a4570
const SKY_HORIZON = 0x864e6a
const GROUND_TOP = 0x3a2a52
const GROUND_BOTTOM = 0x211733
const MOONLIGHT = 0xf6efd2

export function createBackdrop(app: Application, root: Container): BackdropHandle {
  const far = new Container() // sky gradient + moon — blurred for depth of field
  const mid = new Container() // stars
  const near = new Container() // ground + vignette
  far.filters = [new BlurFilter({ strength: 1.6, quality: 2 })]
  root.addChild(far, mid, near)

  const sky = new Graphics()
  const moonGlow = new Graphics()
  const moon = new Graphics()
  far.addChild(sky, moonGlow, moon)

  const ground = new Graphics()
  const vignette = new Graphics()
  near.addChild(ground, vignette)

  const stars: Star[] = []
  for (let i = 0; i < 26; i++) {
    const g = new Graphics().circle(0, 0, i % 3 === 0 ? 1.6 : 1).fill(0xffffff)
    stars.push({ g, nx: Math.random(), ny: Math.random() * 0.55, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 1.1 })
    mid.addChild(g)
  }

  let w = 0
  let h = 0
  const layout = () => {
    w = app.renderer.width / app.renderer.resolution
    h = app.renderer.height / app.renderer.resolution
    if (w <= 0 || h <= 0) return
    const groundTop = h * 0.64 // ground occupies the bottom 36%, like the CSS layer

    sky.clear()
    // Vertical gradient via many thin lerped bands (Graphics has no gradients; 24 bands
    // under the blur read as a smooth wash).
    const stops: Array<[number, number]> = [
      [0, SKY_TOP],
      [0.45, SKY_MID],
      [0.78, SKY_LOW],
      [1, SKY_HORIZON],
    ]
    const lerpColor = (a: number, b: number, k: number): number => {
      const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
      const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
      return (
        (Math.round(ar + (br - ar) * k) << 16) |
        (Math.round(ag + (bg - ag) * k) << 8) |
        Math.round(ab + (bb - ab) * k)
      )
    }
    const colorAt = (p: number): number => {
      for (let i = 1; i < stops.length; i++) {
        if (p <= stops[i][0]) {
          const [p0, c0] = stops[i - 1]
          const [p1, c1] = stops[i]
          return lerpColor(c0, c1, p1 === p0 ? 0 : (p - p0) / (p1 - p0))
        }
      }
      return stops[stops.length - 1][1]
    }
    const BANDS = 24
    for (let i = 0; i < BANDS; i++) {
      sky.rect(0, (h * i) / BANDS, w, h / BANDS + 1).fill(colorAt((i + 0.5) / BANDS))
    }

    // Moon mid-sky at 52%/20% — the §31 lesson: keep sky landmarks OUT of the enemy column.
    const mx = w * 0.52
    const my = h * 0.2
    moon.clear().circle(mx, my, Math.min(26, h * 0.09)).fill(MOONLIGHT)
    moonGlow.clear().circle(mx, my, Math.min(64, h * 0.22)).fill({ color: MOONLIGHT, alpha: 0.16 })

    ground.clear()
    ground.rect(0, groundTop, w, h - groundTop).fill(GROUND_BOTTOM)
    ground.rect(0, groundTop, w, (h - groundTop) * 0.45).fill(GROUND_TOP)
    ground.rect(0, groundTop, w, 2).fill({ color: MOONLIGHT, alpha: 0.3 }) // horizon edge-light
    // A soft moonlight pool on the ground under the moon.
    ground.ellipse(mx, groundTop + (h - groundTop) * 0.4, w * 0.18, (h - groundTop) * 0.3).fill({ color: MOONLIGHT, alpha: 0.04 })

    vignette.clear()
    // Cheap vignette: four edge fades (true radial gradients need textures).
    vignette.rect(0, 0, w, h * 0.12).fill({ color: 0x000000, alpha: 0.22 })
    vignette.rect(0, h * 0.88, w, h * 0.12).fill({ color: 0x000000, alpha: 0.22 })
    vignette.rect(0, 0, w * 0.06, h).fill({ color: 0x000000, alpha: 0.18 })
    vignette.rect(w * 0.94, 0, w * 0.06, h).fill({ color: 0x000000, alpha: 0.18 })

    for (const s of stars) s.g.position.set(s.nx * w, s.ny * h)
  }

  let clock = 0
  const tick = () => {
    clock += app.ticker.deltaMS / 1000
    for (const s of stars) {
      s.g.alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(clock * s.speed + s.phase)) // twinkle
    }
    moonGlow.alpha = 0.85 + 0.15 * Math.sin(clock * 0.6) // breathing halo
  }
  app.ticker.add(tick)
  layout()

  return {
    layout,
    destroy: () => {
      app.ticker.remove(tick)
      root.removeChild(far, mid, near)
      far.destroy({ children: true })
      mid.destroy({ children: true })
      near.destroy({ children: true })
    },
  }
}
