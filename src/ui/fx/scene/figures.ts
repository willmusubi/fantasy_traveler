// §32 — FigureActor: one battle character ON the canvas. Wraps whatever art resolved
// (spritesheet → AnimatedSprite; pixel/fullbody/head → Sprite; nothing → emoji Text) behind
// one animation API, so the choreographer never cares which asset tier a character has.
// Visual-only: positions derive from the DOM anchor rects, state lives in the reducer.

import {
  AnimatedSprite,
  ColorMatrixFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  type Application,
} from 'pixi.js'
import type { FigureArt } from './textures'
import { CancelBag, delay, ease, tween } from './tween'

export interface FigureOpts {
  id: string
  art: FigureArt
  /** Final fallback glyph (CLASS_EMOJI / enemyEmoji — same casting as the DOM sprite). */
  emoji: string
  /** +1 faces right (party side), −1 faces left (enemy side). Only textured art flips. */
  facing: 1 | -1
  /** Standing height in px for fullbody/pixel art (head tokens & emoji keep native sizing). */
  targetH: number
}

const FLASH = new ColorMatrixFilter()
FLASH.brightness(2.6, false)

/** Sheet animation names the spec asks generators for. Missing names degrade to 'idle'. */
type SheetAnim = 'idle' | 'attack' | 'hurt' | 'ko' | 'victory'

export class FigureActor extends Container {
  readonly figureId: string
  private app: Application
  private visual: Container
  private sheetSprite?: AnimatedSprite
  private art: FigureArt
  private bag = new CancelBag()
  private baseX = 0
  private baseY = 0
  private offX = 0
  private offY = 0
  private breathClock = Math.random() * Math.PI * 2 // desync the party's breathing
  private breathing = true
  private isDowned = false
  private grayscale = new ColorMatrixFilter()

  constructor(app: Application, opts: FigureOpts) {
    super()
    this.app = app
    this.figureId = opts.id
    this.art = opts.art
    this.grayscale.desaturate()
    this.visual = this.buildVisual(opts)
    this.addChild(this.visual)
  }

  private buildVisual(opts: FigureOpts): Container {
    const { art, targetH } = opts
    if (art.kind === 'sheet' && art.sheet) {
      const anims = art.sheet.animations
      const idle = anims.idle ?? anims[Object.keys(anims)[0]]
      const sp = new AnimatedSprite(idle && idle.length > 0 ? idle : [art.texture!])
      sp.anchor.set(0.5, 1)
      sp.animationSpeed = 0.12
      sp.play()
      const s = targetH / sp.height
      sp.scale.set(s * opts.facing, s)
      this.sheetSprite = sp
      return sp
    }
    if (art.texture && (art.kind === 'fullbody' || art.kind === 'pixel' || art.kind === 'enemy')) {
      const sp = new Sprite(art.texture)
      sp.anchor.set(0.5, 1)
      const s = targetH / art.texture.height
      sp.scale.set(s * opts.facing, s)
      return sp
    }
    if (art.texture && art.kind === 'head') {
      // Gold-framed combat token (mirrors the DOM .bsprite-art look): frame + masked head.
      const token = new Container()
      const SIZE = 60
      const frame = new Graphics()
        .roundRect(-SIZE / 2 - 3, -SIZE - 3, SIZE + 6, SIZE + 6, 11)
        .fill(0x141833)
        .stroke({ width: 2, color: 0xc79a35 })
      const head = new Sprite(art.texture)
      head.anchor.set(0.5, 1)
      const s = SIZE / Math.max(art.texture.width, art.texture.height)
      head.scale.set(s)
      const mask = new Graphics().roundRect(-SIZE / 2, -SIZE, SIZE, SIZE, 9).fill(0xffffff)
      head.mask = mask
      token.addChild(frame, head, mask)
      return token
    }
    const t = new Text({ text: opts.emoji, style: { fontSize: 52 } })
    t.anchor.set(0.5, 1)
    return t
  }

  /** Where the figure STANDS (feet point), in canvas coordinates — from the DOM anchor rect. */
  setBase(x: number, y: number): void {
    this.baseX = x
    this.baseY = y
    this.applyPosition()
  }

  private applyPosition(bob = 0): void {
    this.position.set(this.baseX + this.offX, this.baseY + this.offY + bob)
  }

  /** Frame driver — the scene stage calls this from its single ticker. */
  update(dtSeconds: number): void {
    if (!this.breathing || this.isDowned) {
      this.applyPosition()
      return
    }
    this.breathClock += dtSeconds
    const wave = Math.sin(this.breathClock * 2.1)
    this.scale.y = 1 + wave * 0.006 // breathe via the OUTER container; art scale stays untouched
    this.applyPosition(wave * 1.8)
  }

  /** Cancel every in-flight action tween and return to the neutral pose (downed persists). */
  interrupt(): void {
    this.bag.cancelAll()
    this.offX = 0
    this.offY = 0
    this.rotation = this.isDowned ? this.rotation : 0
    this.visual.filters = this.isDowned ? [this.grayscale] : []
    this.alpha = this.isDowned ? 0.45 : 1
    if (this.sheetSprite && !this.isDowned) this.playSheet('idle', true)
    this.applyPosition()
  }

  private playSheet(name: SheetAnim, loop: boolean): void {
    const sheet = this.art.sheet
    const sp = this.sheetSprite
    if (!sheet || !sp) return
    const frames = sheet.animations[name] ?? sheet.animations.idle
    if (!frames || frames.length === 0) return
    sp.textures = frames
    sp.loop = loop
    sp.gotoAndPlay(0)
    if (!loop) sp.onComplete = () => this.playSheet('idle', true)
  }

  /** Dash toward the foe and back. `dist` is signed (party lunges +x, enemies −x).
   *  Full cycle ≈ 0.42s; the impact moment is at ~0.15s (choreographer schedules around it). */
  lunge(dist: number): void {
    if (this.destroyed || this.isDowned) return
    this.playSheet('attack', false)
    this.bag.add(
      tween(this.app, {
        duration: 0.15,
        ease: ease.outCubic,
        onUpdate: (k) => {
          this.offX = dist * k
          this.applyPosition()
        },
        onComplete: () => {
          this.bag.add(
            delay(this.app, 0.1, () => {
              this.bag.add(
                tween(this.app, {
                  duration: 0.17,
                  ease: ease.inOutQuad,
                  onUpdate: (k) => {
                    this.offX = dist * (1 - k)
                    this.applyPosition()
                  },
                }),
              )
            }),
          )
        },
      }),
    )
  }

  /** White-out flash + knockback recoil. `knock` is signed (away from the attacker). */
  hit(knock: number): void {
    if (this.destroyed) return
    this.playSheet('hurt', false)
    this.visual.filters = this.isDowned ? [this.grayscale] : [FLASH]
    this.bag.add(
      delay(this.app, 0.12, () => {
        if (!this.destroyed) this.visual.filters = this.isDowned ? [this.grayscale] : []
      }),
    )
    this.bag.add(
      tween(this.app, {
        duration: 0.22,
        ease: ease.outQuad,
        onUpdate: (k) => {
          // Out fast, settle back: triangle profile peaking at k=0.35.
          const wave = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65
          this.offX = knock * wave
          this.applyPosition()
        },
      }),
    )
  }

  /** Cast wind-up: lean back + a scale pulse held for `seconds`. */
  casting(seconds = 0.25, lean = -6): void {
    if (this.destroyed || this.isDowned) return
    this.bag.add(
      tween(this.app, {
        duration: seconds,
        ease: ease.inOutQuad,
        onUpdate: (k) => {
          const wave = Math.sin(k * Math.PI)
          this.offX = lean * wave
          this.scale.x = 1 + 0.03 * wave
          this.applyPosition()
        },
        onComplete: () => {
          this.scale.x = 1
        },
      }),
    )
  }

  /** Keel over at the feet pivot + desaturate. Persists until setDowned(false). */
  setDowned(down: boolean): void {
    if (this.destroyed) return
    this.isDowned = down
    if (down) {
      this.playSheet('ko', false)
      this.visual.filters = [this.grayscale]
      this.bag.add(
        tween(this.app, {
          duration: 0.35,
          ease: ease.outQuad,
          onUpdate: (k) => {
            this.rotation = -0.5 * k * (this.visual.scale.x >= 0 ? 1 : -1)
            this.alpha = 1 - 0.55 * k
          },
        }),
      )
    } else {
      this.visual.filters = []
      this.rotation = 0
      this.alpha = 1
      this.playSheet('idle', true)
    }
  }

  /** Victory hop (outBack overshoot). */
  victory(): void {
    if (this.destroyed || this.isDowned) return
    this.playSheet('victory', false)
    this.bag.add(
      tween(this.app, {
        duration: 0.55,
        ease: ease.outBack,
        onUpdate: (k) => {
          this.offY = -14 * Math.sin(k * Math.PI)
          this.applyPosition()
        },
        onComplete: () => {
          this.offY = 0
          this.applyPosition()
        },
      }),
    )
  }

  /** Brief color cast (debuff purple, boss-phase red...). Multiplicative, so light art dims.
   *  Pixi v8 Containers tint their whole subtree — covers Sprite, token, and Text alike. */
  tintPulse(color: number, seconds = 0.3): void {
    if (this.destroyed) return
    this.visual.tint = color
    this.bag.add(
      delay(this.app, seconds, () => {
        if (!this.destroyed) this.visual.tint = 0xffffff
      }),
    )
  }

  override destroy(): void {
    this.bag.cancelAll()
    super.destroy({ children: true })
  }
}
