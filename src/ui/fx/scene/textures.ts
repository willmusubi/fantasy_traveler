// §32 — battle-figure texture resolution. Walks a candidate chain (the same "drop a file in,
// the stage upgrades itself" philosophy as the DOM BattleSprite art chain) and caches results
// INCLUDING failures, so a missing file 404s exactly once per session, never per spawn.
//
// Party chain:  /sprites/sheets/<set>_sheet.json (frame-animation spritesheet, future assets)
//             → /sprites/<set>.png | /sprites/<set>_battle.png   (pixel battle art)
//             → /art/<set>_fullbody_v3.png | /art/<set>_fullbody.png  (paper-doll standing art)
//             → /portraits/heads/<set>.png                      (gold-framed token)
//             → none                                            (emoji Text fallback)
// Enemy chain: /sprites/enemies/<artSet>.png → none.

import { Assets, Spritesheet, Texture } from 'pixi.js'

export type FigureArtKind = 'sheet' | 'pixel' | 'fullbody' | 'head' | 'enemy' | 'none'

export interface FigureArt {
  kind: FigureArtKind
  texture: Texture | null
  /** Present only for kind 'sheet' — named animations (idle/attack/hurt/ko/victory). */
  sheet?: Spritesheet
  /** The url that resolved (for eviction bookkeeping). */
  url?: string
}

interface Candidate {
  kind: FigureArtKind
  url: string
}

export function partyCandidates(portraitSet: string): Candidate[] {
  return [
    { kind: 'sheet', url: `/sprites/sheets/${portraitSet}_sheet.json` },
    { kind: 'pixel', url: `/sprites/${portraitSet}.png` },
    { kind: 'pixel', url: `/sprites/${portraitSet}_battle.png` },
    { kind: 'fullbody', url: `/art/${portraitSet}_fullbody_v3.png` },
    { kind: 'fullbody', url: `/art/${portraitSet}_fullbody.png` },
    { kind: 'head', url: `/portraits/heads/${portraitSet}.png` },
  ]
}

export function enemyCandidates(artSet: string | undefined): Candidate[] {
  if (!artSet) return []
  return [
    { kind: 'enemy', url: `/sprites/enemies/${artSet}.png` },
    { kind: 'fullbody', url: `/art/${artSet}_fullbody_v3.png` }, // enemies may use the same pipeline
  ]
}

// One promise per url — concurrent spawns of the same character share a single fetch, and a
// settled null (404) short-circuits every later attempt. Module-level on purpose: texture
// identity must outlive any single scene mount (StrictMode remounts reuse the GPU upload).
const loads = new Map<string, Promise<Texture | Spritesheet | null>>()

function loadOne(url: string): Promise<Texture | Spritesheet | null> {
  let p = loads.get(url)
  if (!p) {
    p = Assets.load<Texture | Spritesheet>(url).catch(() => null)
    loads.set(url, p)
  }
  return p
}

/** Resolve the first candidate that actually loads. Never throws. */
export async function resolveFigureArt(candidates: Candidate[]): Promise<FigureArt> {
  for (const c of candidates) {
    const loaded = await loadOne(c.url)
    if (!loaded) continue
    if (loaded instanceof Spritesheet) {
      return { kind: 'sheet', texture: loaded.textures[Object.keys(loaded.textures)[0]] ?? null, sheet: loaded, url: c.url }
    }
    return { kind: c.kind, texture: loaded, url: c.url }
  }
  return { kind: 'none', texture: null }
}

/** Release a url's GPU memory (actor left the stage). Safe to call for never-loaded urls. */
export function evictTexture(url: string | undefined): void {
  if (!url || !loads.has(url)) return
  loads.delete(url)
  void Assets.unload(url).catch(() => {
    /* unloading something Pixi never registered is harmless */
  })
}

/** Test/HMR hook — drop every cached resolution. */
export function _resetTextureCacheForTests(): void {
  loads.clear()
}
