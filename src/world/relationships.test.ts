import { describe, expect, it } from 'vitest'
import { activeSynergiesFor } from './relationships'

describe('activeSynergiesFor', () => {
  it('all three sisters activate the trio synergy', () => {
    const syn = activeSynergiesFor(['mira', 'vela', 'nova'])
    expect(syn.find((s) => s.id === 'stargazers_trio')).toBeTruthy()
  })

  it('two sisters activate only the matching pair synergy', () => {
    const syn = activeSynergiesFor(['mira', 'vela'])
    expect(syn.find((s) => s.id === 'stargazers_trio')).toBeUndefined()
    expect(syn.find((s) => s.id === 'pair_mira_vela')).toBeTruthy()
  })

  it('a lone companion activates no synergy', () => {
    expect(activeSynergiesFor(['mira'])).toHaveLength(0)
  })
})
