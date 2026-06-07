import { describe, expect, it } from 'vitest'
import { getWorldEquipment } from './equipment'

describe('getWorldEquipment', () => {
  it('includes world-agnostic + matching-world items', () => {
    const e = getWorldEquipment('stargazers')
    expect(e.practice_dagger).toBeTruthy() // world-agnostic
    expect(e.starlit_blade).toBeTruthy() // stargazers-scoped
    expect(e.stargazer_seal).toBeTruthy()
  })

  it('excludes items scoped to a different world', () => {
    const e = getWorldEquipment('some_other_world')
    expect(e.practice_dagger).toBeTruthy() // agnostic kept
    expect(e.starlit_blade).toBeUndefined() // stargazers-only excluded
  })
})
