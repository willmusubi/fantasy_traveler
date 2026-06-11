// §29 — the streaming reply extractor peels the `reply` string value out of a PARTIAL
// tool-input JSON buffer (the forced respond-tool streams input_json_delta fragments).
// These cases pin the tricky bits: escapes split across chunks, trailing lone backslash,
// CJK passthrough, and the not-yet-started state.

import { describe, expect, it } from 'vitest'
import { extractReplyPrefix } from './clientStream'

describe('extractReplyPrefix', () => {
  it('returns empty until the reply value has opened', () => {
    expect(extractReplyPrefix('')).toBe('')
    expect(extractReplyPrefix('{"re')).toBe('')
    expect(extractReplyPrefix('{"reply"')).toBe('')
    expect(extractReplyPrefix('{"reply":')).toBe('')
  })

  it('extracts a growing CJK prefix chunk by chunk', () => {
    expect(extractReplyPrefix('{"reply":"你')).toBe('你')
    expect(extractReplyPrefix('{"reply":"你好，旅')).toBe('你好，旅')
    expect(extractReplyPrefix('{"reply":"你好，旅人！今天状态如何？')).toBe('你好，旅人！今天状态如何？')
  })

  it('stops at the closing quote (later fields never leak in)', () => {
    expect(extractReplyPrefix('{"reply":"加油哦","expression":"smile"}')).toBe('加油哦')
  })

  it('unescapes JSON escapes (\\n, \\", unicode)', () => {
    expect(extractReplyPrefix('{"reply":"第一行\\n第二行')).toBe('第一行\n第二行')
    expect(extractReplyPrefix('{"reply":"他说\\"好\\"')).toBe('他说"好"')
    expect(extractReplyPrefix('{"reply":"star\\u2728')).toBe('star✨')
  })

  it('a trailing lone backslash (escape split across chunks) is held back, then resolves', () => {
    // The \\ has arrived but its partner char hasn't — the prefix excludes it…
    expect(extractReplyPrefix('{"reply":"等等\\')).toBe('等等')
    // …and once the n lands the escape decodes.
    expect(extractReplyPrefix('{"reply":"等等\\n')).toBe('等等\n')
  })

  it('tolerates whitespace around the colon', () => {
    expect(extractReplyPrefix('{ "reply" : "嗯嗯')).toBe('嗯嗯')
  })
})
