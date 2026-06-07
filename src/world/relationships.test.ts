import { describe, expect, it } from 'vitest'
import { activeSynergiesFor } from './relationships'

describe('activeSynergiesFor', () => {
  it('all three sisters activate the trio synergy', () => {
    const syn = activeSynergiesFor(['raisei_hitomi', 'raisei_rui', 'raisei_ai'])
    expect(syn.find((s) => s.id === 'three_sisters')).toBeTruthy()
  })

  it('two sisters activate only the matching pair synergy', () => {
    const syn = activeSynergiesFor(['raisei_hitomi', 'raisei_rui'])
    expect(syn.find((s) => s.id === 'three_sisters')).toBeUndefined()
    expect(syn.find((s) => s.id === 'sisters_hitomi_rui')).toBeTruthy()
  })

  it('a lone companion activates no synergy', () => {
    expect(activeSynergiesFor(['raisei_hitomi'])).toHaveLength(0)
  })
})
