import { describe, expect, it } from 'vitest'
import { getWorldEquipment } from './equipment'

describe('getWorldEquipment', () => {
  it('includes world-agnostic + matching-world items', () => {
    const e = getWorldEquipment('cats_eye')
    expect(e.practice_dagger).toBeTruthy() // world-agnostic
    expect(e.moonlit_dagger).toBeTruthy() // cats_eye-scoped
    expect(e.cats_eye_card).toBeTruthy()
  })

  it('excludes items scoped to a different world', () => {
    const e = getWorldEquipment('some_other_world')
    expect(e.practice_dagger).toBeTruthy() // agnostic kept
    expect(e.moonlit_dagger).toBeUndefined() // cats_eye-only excluded
  })
})
