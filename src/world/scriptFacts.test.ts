import { describe, expect, it } from 'vitest'
import type { ScriptDef } from '../domain/types'
import { renderScriptFacts } from './scriptFacts'

const script: ScriptDef = {
  id: 's', worldId: 'w', title: 't', synopsis: '', startChapterId: 'c', chapters: {},
  flags: [{ key: 'rebecca', description: '蕾贝卡是否生还', values: { rescued: '被救下，成为可招募同伴', dead: '战死' } }],
}

describe('renderScriptFacts (§23)', () => {
  it('returns empty string when no flags are set', () => {
    expect(renderScriptFacts({}, script)).toBe('')
  })

  it('renders a declared flag with its human meaning', () => {
    const out = renderScriptFacts({ rebecca: 'rescued' }, script)
    expect(out).toContain('【当前剧情既定事实')
    expect(out).toContain('蕾贝卡是否生还：被救下，成为可招募同伴')
  })

  it('falls back to key：value for an undeclared flag (or no script)', () => {
    expect(renderScriptFacts({ mystery: true })).toContain('mystery：true')
  })
})
