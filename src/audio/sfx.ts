// §27 synth SFX — chiptune-style cues generated with raw WebAudio oscillators.
// ZERO asset files by design: retro bleeps fit the FF/SNES pixel aesthetic, weigh
// nothing, and need no licensing/sourcing. (Howler + real recorded audio can slot in
// later behind the same playSfx() API — Phase 5 note.) Volume comes from
// Settings.sfxVolume (0–100, default 70); 0 = silent. Safe under jsdom (no-ops).

export type SfxName =
  | 'hit' | 'crit' | 'weak' | 'miss'
  | 'enemyhit' | 'heavy'
  | 'skill' | 'heal' | 'buff' | 'debuff'
  | 'status' | 'sleep' | 'guard' | 'telegraph' | 'phase'
  | 'downed' | 'wipe' | 'victory' | 'fanfare' | 'levelup'

interface Tone {
  /** Oscillator type, or 'noise' for a white-noise burst (impacts). */
  wave: OscillatorType | 'noise'
  /** Start → end frequency (Hz); end omitted = flat. */
  f0: number
  f1?: number
  /** Seconds. */
  dur: number
  /** Relative gain 0–1. */
  gain: number
  /** Start offset in seconds (for multi-note cues). */
  at?: number
}

/** Tiny per-cue recipes. Tuned by ear for "SNES menu" character — short, soft attack. */
const RECIPES: Record<SfxName, Tone[]> = {
  hit: [{ wave: 'square', f0: 220, f1: 110, dur: 0.09, gain: 0.5 }, { wave: 'noise', f0: 0, dur: 0.05, gain: 0.35 }],
  crit: [
    { wave: 'square', f0: 440, f1: 110, dur: 0.16, gain: 0.6 },
    { wave: 'noise', f0: 0, dur: 0.1, gain: 0.5 },
    { wave: 'square', f0: 880, f1: 440, dur: 0.1, gain: 0.4, at: 0.05 },
  ],
  weak: [{ wave: 'square', f0: 330, f1: 165, dur: 0.12, gain: 0.55 }, { wave: 'noise', f0: 0, dur: 0.07, gain: 0.4 }],
  miss: [{ wave: 'triangle', f0: 300, f1: 200, dur: 0.12, gain: 0.3 }],
  enemyhit: [{ wave: 'sawtooth', f0: 160, f1: 70, dur: 0.12, gain: 0.45 }, { wave: 'noise', f0: 0, dur: 0.06, gain: 0.3 }],
  heavy: [
    { wave: 'sawtooth', f0: 120, f1: 40, dur: 0.28, gain: 0.6 },
    { wave: 'noise', f0: 0, dur: 0.18, gain: 0.55 },
  ],
  skill: [{ wave: 'square', f0: 520, f1: 780, dur: 0.1, gain: 0.4 }, { wave: 'square', f0: 780, f1: 390, dur: 0.12, gain: 0.45, at: 0.08 }],
  heal: [
    { wave: 'triangle', f0: 523, dur: 0.09, gain: 0.4 },
    { wave: 'triangle', f0: 659, dur: 0.09, gain: 0.4, at: 0.08 },
    { wave: 'triangle', f0: 784, dur: 0.14, gain: 0.45, at: 0.16 },
  ],
  buff: [{ wave: 'triangle', f0: 392, f1: 784, dur: 0.18, gain: 0.4 }],
  debuff: [{ wave: 'triangle', f0: 392, f1: 196, dur: 0.18, gain: 0.4 }],
  status: [{ wave: 'square', f0: 260, f1: 180, dur: 0.14, gain: 0.35 }],
  sleep: [
    { wave: 'triangle', f0: 392, f1: 330, dur: 0.16, gain: 0.35 },
    { wave: 'triangle', f0: 330, f1: 262, dur: 0.2, gain: 0.3, at: 0.14 },
  ],
  guard: [{ wave: 'square', f0: 196, dur: 0.06, gain: 0.4 }, { wave: 'square', f0: 262, dur: 0.1, gain: 0.4, at: 0.06 }],
  telegraph: [{ wave: 'square', f0: 880, dur: 0.06, gain: 0.3 }, { wave: 'square', f0: 880, dur: 0.06, gain: 0.3, at: 0.12 }],
  phase: [
    { wave: 'sawtooth', f0: 80, f1: 160, dur: 0.4, gain: 0.55 },
    { wave: 'square', f0: 220, f1: 440, dur: 0.3, gain: 0.35, at: 0.1 },
  ],
  downed: [{ wave: 'triangle', f0: 330, f1: 82, dur: 0.4, gain: 0.45 }],
  wipe: [{ wave: 'sawtooth', f0: 220, f1: 55, dur: 0.7, gain: 0.5 }],
  victory: [
    { wave: 'square', f0: 523, dur: 0.1, gain: 0.4 },
    { wave: 'square', f0: 659, dur: 0.1, gain: 0.4, at: 0.1 },
    { wave: 'square', f0: 784, dur: 0.1, gain: 0.4, at: 0.2 },
    { wave: 'square', f0: 1047, dur: 0.22, gain: 0.45, at: 0.3 },
  ],
  fanfare: [
    { wave: 'square', f0: 523, dur: 0.12, gain: 0.42 },
    { wave: 'square', f0: 523, dur: 0.06, gain: 0.36, at: 0.14 },
    { wave: 'square', f0: 523, dur: 0.06, gain: 0.36, at: 0.22 },
    { wave: 'square', f0: 698, dur: 0.3, gain: 0.46, at: 0.3 },
    { wave: 'square', f0: 880, dur: 0.34, gain: 0.42, at: 0.44 },
  ],
  levelup: [
    { wave: 'triangle', f0: 659, dur: 0.08, gain: 0.4 },
    { wave: 'triangle', f0: 880, dur: 0.08, gain: 0.4, at: 0.07 },
    { wave: 'triangle', f0: 1175, dur: 0.16, gain: 0.45, at: 0.14 },
  ],
}

let ctx: AudioContext | null = null
let noiseBuf: AudioBuffer | null = null
/** Read at play time so the settings slider applies immediately. Set by settingsStore. */
let masterVolume = 0.7

export function setSfxVolume(pct: number): void {
  masterVolume = Math.max(0, Math.min(100, pct)) / 100
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  // Browsers gate audio behind a user gesture; cues fire from click-driven flows, so a
  // suspended context usually resumes right here.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

/** Play one named cue. No-op when volume is 0 or WebAudio is unavailable (jsdom/SSR). */
export function playSfx(name: SfxName): void {
  if (masterVolume <= 0) return
  const ac = ensureCtx()
  if (!ac) return
  const t0 = ac.currentTime
  for (const tone of RECIPES[name]) {
    const at = t0 + (tone.at ?? 0)
    const g = ac.createGain()
    // Soft attack → exponential decay: the whole "chip" character lives in this envelope.
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, tone.gain * masterVolume * 0.5), at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + tone.dur)
    g.connect(ac.destination)
    if (tone.wave === 'noise') {
      const src = ac.createBufferSource()
      src.buffer = noise(ac)
      src.connect(g)
      src.start(at)
      src.stop(at + tone.dur)
    } else {
      const osc = ac.createOscillator()
      osc.type = tone.wave
      osc.frequency.setValueAtTime(tone.f0, at)
      if (tone.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.f1), at + tone.dur)
      osc.connect(g)
      osc.start(at)
      osc.stop(at + tone.dur + 0.02)
    }
  }
}
