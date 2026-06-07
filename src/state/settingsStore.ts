import { create } from 'zustand'
import { settingsRepo } from '../data/repositories'
import type { Settings } from '../domain/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  hydrate: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

const DEFAULTS: Settings = { model: 'claude-sonnet-4-6', language: 'zh-CN', theme: 'dusk' }

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  async hydrate() {
    const settings = await settingsRepo.get()
    set({ settings, loaded: true })
  },
  async update(patch) {
    const next = { ...get().settings, ...patch }
    await settingsRepo.put(next)
    set({ settings: next })
  },
}))
