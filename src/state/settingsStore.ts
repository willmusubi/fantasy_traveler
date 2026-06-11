import { create } from 'zustand'
import { settingsRepo } from '../data/repositories'
import type { Settings } from '../domain/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  hydrate: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  /** §29 — fold one call's token usage into the cumulative meter (persisted). */
  recordTokenUsage: (delta: { input: number; output: number; cacheRead: number; cacheWrite: number }) => Promise<void>
}

const DEFAULTS: Settings = { model: 'claude-sonnet-4-6', language: 'zh-CN', theme: 'dusk', combatDepth: 'simple', autoTactics: true, battleFx: true, sfxVolume: 70 }

/** §25 helper: deep-mode UI surfaces on? (missing field on old saves = simple). */
export function isDeepCombat(s: Settings): boolean {
  return s.combatDepth === 'deep'
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  async hydrate() {
    const raw = await settingsRepo.get()
    // §26/§27: backfill fields old saves predate.
    const settings: Settings = {
      ...raw,
      autoTactics: raw.autoTactics ?? true,
      battleFx: raw.battleFx ?? true,
      sfxVolume: raw.sfxVolume ?? 70,
    }
    set({ settings, loaded: true })
  },
  async update(patch) {
    const next = { ...get().settings, ...patch }
    await settingsRepo.put(next)
    set({ settings: next })
  },

  async recordTokenUsage(delta) {
    const cur = get().settings.tokenUsage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, since: new Date().toISOString() }
    await get().update({
      tokenUsage: {
        input: cur.input + delta.input,
        output: cur.output + delta.output,
        cacheRead: cur.cacheRead + delta.cacheRead,
        cacheWrite: cur.cacheWrite + delta.cacheWrite,
        since: cur.since,
      },
    })
  },
}))

/** §29 rough USD estimate for the cost meter (per-MTok pricing by model family). */
export function estimateUsd(u: NonNullable<Settings['tokenUsage']>, model: string): number {
  // [input, output, cacheRead, cacheWrite] $/MTok — sonnet-class default; haiku cheaper, opus pricier.
  const m = model.includes('haiku') ? [1, 5, 0.1, 1.25] : model.includes('opus') ? [15, 75, 1.5, 18.75] : [3, 15, 0.3, 3.75]
  return (u.input * m[0] + u.output * m[1] + u.cacheRead * m[2] + u.cacheWrite * m[3]) / 1_000_000
}
