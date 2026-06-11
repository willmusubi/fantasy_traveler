import { create } from 'zustand'
import { settingsRepo } from '../data/repositories'
import type { Settings } from '../domain/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  hydrate: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

const DEFAULTS: Settings = { model: 'claude-sonnet-4-6', language: 'zh-CN', theme: 'dusk', combatDepth: 'simple', autoTactics: true }

/** §25 helper: deep-mode UI surfaces on? (missing field on old saves = simple). */
export function isDeepCombat(s: Settings): boolean {
  return s.combatDepth === 'deep'
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  async hydrate() {
    const raw = await settingsRepo.get()
    // §26: backfill autoTactics for old saves that predate this field.
    const settings: Settings = { ...raw, autoTactics: raw.autoTactics ?? true }
    set({ settings, loaded: true })
  },
  async update(patch) {
    const next = { ...get().settings, ...patch }
    await settingsRepo.put(next)
    set({ settings: next })
  },
}))
