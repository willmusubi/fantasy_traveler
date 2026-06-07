import { describe, expect, it } from 'vitest'
import { pickCompletionLine, pickWorriedLine, selectFromPool } from './cannedLines'
import { coerceExpression } from './expressions'

describe('coerceExpression', () => {
  it('passes core keys through', () => {
    expect(coerceExpression('happy')).toBe('happy')
    expect(coerceExpression('worried')).toBe('worried')
  })
  it('maps extended keys to nearest core (core-only art)', () => {
    expect(coerceExpression('heartthrob')).toBe('blush')
    expect(coerceExpression('tired')).toBe('neutral')
    expect(coerceExpression('surprised')).toBe('happy')
  })
  it('keeps extended keys when coreOnly=false', () => {
    expect(coerceExpression('heartthrob', false)).toBe('heartthrob')
  })
  it('falls back to neutral for garbage', () => {
    expect(coerceExpression('lol')).toBe('neutral')
    expect(coerceExpression(42)).toBe('neutral')
  })
})

describe('canned lines', () => {
  it('selectFromPool rotates deterministically', () => {
    const pool = ['a', 'b', 'c']
    expect(selectFromPool(pool, 0, 'x')).toBe('a')
    expect(selectFromPool(pool, 3, 'x')).toBe('a')
    expect(selectFromPool(pool, 4, 'x')).toBe('b')
    expect(selectFromPool([], 0, 'x')).toBe('x')
  })
  it('returns an in-character completion line with an expression', () => {
    const line = pickCompletionLine('raisei_hitomi', 'high', 0)
    expect(line.text).toBeTruthy()
    expect(line.expression).toBeTruthy()
  })
  it('returns a worried line', () => {
    expect(pickWorriedLine('raisei_hitomi', 0).text).toBeTruthy()
  })
})
