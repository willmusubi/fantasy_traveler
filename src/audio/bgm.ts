// §30 chiptune BGM — a tiny WebAudio step sequencer, ZERO asset files (same rationale
// as sfx.ts: SNES character, no sourcing/licensing, weighs nothing). Three looping
// tracks: idle (calm arpeggio), battle (driving), boss (tense minor). Defaults OFF
// (bgmVolume 0 — 效率优先: a productivity app must not sing uninvited); the settings
// slider opts in. Scheduling uses the standard 100ms-tick / 250ms-lookahead pattern.

export type BgmTrack = 'idle' | 'battle' | 'boss'

interface Pattern {
  tempo: number // BPM (one step = an 8th note)
  /** 16 steps per bar, MIDI note numbers; null = rest. Loops. */
  bass: (number | null)[]
  lead: (number | null)[]
  bassWave: OscillatorType
  leadWave: OscillatorType
}

const PATTERNS: Record<BgmTrack, Pattern> = {
  idle: {
    tempo: 76,
    bassWave: 'triangle',
    leadWave: 'triangle',
    //      A2          F2          C3          G2
    bass: [45, null, null, null, 41, null, null, null, 48, null, null, null, 43, null, null, null],
    lead: [69, null, 72, 76, null, 72, null, null, 67, null, 72, null, 76, null, 79, null],
  },
  battle: {
    tempo: 144,
    bassWave: 'square',
    leadWave: 'square',
    bass: [45, 45, null, 45, 43, 43, null, 43, 41, 41, null, 41, 43, 43, 47, 47],
    lead: [69, null, 71, 72, null, 72, 71, 69, 67, null, 69, 71, null, 74, 72, 71],
  },
  boss: {
    tempo: 160,
    bassWave: 'sawtooth',
    leadWave: 'square',
    bass: [38, 38, 38, null, 38, 38, 44, null, 37, 37, 37, null, 41, 41, 40, null],
    lead: [62, null, 65, null, 68, null, 65, 62, null, 61, null, 64, null, 67, 70, null],
  },
}

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

let ctx: AudioContext | null = null
let master: GainNode | null = null
let volume = 0 // 0–1; set from Settings.bgmVolume
let current: BgmTrack | null = null
let step = 0
let nextNoteTime = 0
let tickTimer: ReturnType<typeof setInterval> | null = null

function ensure(): { ac: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = volume * 0.16 // BGM sits well under the SFX layer
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ac: ctx, out: master! }
}

export function setBgmVolume(pct: number): void {
  volume = Math.max(0, Math.min(100, pct)) / 100
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.16, ctx.currentTime, 0.1)
  if (volume <= 0) stopBgm()
  else if (current) startLoop() // re-arm if a track is meant to be playing
}

function scheduleNote(ac: AudioContext, out: GainNode, midi: number, wave: OscillatorType, at: number, dur: number, gain: number): void {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = wave
  osc.frequency.value = midiHz(midi)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g)
  g.connect(out)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function startLoop(): void {
  const env = ensure()
  if (!env || !current || volume <= 0) return
  if (tickTimer) return // already running
  const { ac } = env
  nextNoteTime = ac.currentTime + 0.06
  tickTimer = setInterval(() => {
    const e = ensure()
    if (!e || !current) return
    const p = PATTERNS[current]
    const stepDur = 60 / p.tempo / 2 // 8th notes
    // Lookahead: schedule everything due in the next 250ms.
    while (nextNoteTime < e.ac.currentTime + 0.25) {
      const i = step % 16
      const bass = p.bass[i]
      const lead = p.lead[i]
      if (bass != null) scheduleNote(e.ac, e.out, bass, p.bassWave, nextNoteTime, stepDur * 0.9, 0.5)
      if (lead != null) scheduleNote(e.ac, e.out, lead, p.leadWave, nextNoteTime, stepDur * 0.85, 0.3)
      nextNoteTime += stepDur
      step++
    }
  }, 100)
}

/** Switch to (or keep) a track. Volume 0 = stays silent; the slider re-arms it. */
export function playBgm(track: BgmTrack): void {
  if (current === track && tickTimer) return
  current = track
  step = 0
  if (volume > 0) {
    stopTicker()
    startLoop()
  }
}

function stopTicker(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

export function stopBgm(): void {
  stopTicker()
}

/** The track playing (or armed) right now — for tests/UI. */
export function currentBgm(): BgmTrack | null {
  return current
}
