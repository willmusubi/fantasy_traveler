// Chat store: multi-target threading (per-companion solo + party group chat). Runs against a
// real (faked) IndexedDB, with the Anthropic chat() call mocked. MODE==='test' forces the shipped
// 观星会 cast, so the primary companion is 'mira' and the party can hold 'vela'/'nova'.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIMARY_COMPANION_ID, createCompanionCharacter } from '../companion/roster'
import { closeDb } from '../data/db'
import { chatRepo } from '../data/repositories'
import type { ChatMessage } from '../domain/types'
import { useGame } from './gameStore'
import { useTodos } from './todoStore'

// Mock ONLY chatStream() (§29 — the store streams now); keep AIError real so the store's
// error handling runs for real. The mock ignores onDelta unless a test drives it.
vi.mock('../ai/clientStream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/clientStream')>()
  return { ...actual, chatStream: vi.fn() }
})
import { AIError } from '../ai/client'
import { chatStream } from '../ai/clientStream'
import { threadIdFor, useChat } from './chatStore'

const mockChat = vi.mocked(chatStream)

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('fantasy-traveler')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  useGame.setState({ gameState: null, characters: [], affinities: {}, reaction: null, toasts: [], lastDamageByEnemy: {}, activeQuest: null, recruitedId: null, ready: false })
  useTodos.setState({ todos: [], loaded: false, completionCount: 0 })
  useChat.setState({ target: { kind: 'solo', companionId: PRIMARY_COMPANION_ID }, messages: [], sending: false, thinkingName: null, streamingText: null, streamingSender: null, error: null })
  mockChat.mockReset()
})

/** Recruit the given companions AND put them in the active party (after seedNewGame). */
function addPartyCompanions(ids: string[]) {
  const now = new Date()
  const g = useGame.getState()
  const gs = g.gameState!
  const newChars = ids.map((id) => createCompanionCharacter(id, now))
  useGame.setState({
    characters: [...g.characters, ...newChars],
    gameState: {
      ...gs,
      partyIds: [...gs.partyIds, ...ids],
      unlockedCompanionIds: [...gs.unlockedCompanionIds, ...ids],
    },
  })
}

const mkMsg = (over: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'threadId' | 'sender' | 'text'>): ChatMessage => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('threadIdFor — target → persistent thread', () => {
  it('maps the primary companion to the legacy key, others to solo-<id>, group to group-party', () => {
    expect(threadIdFor({ kind: 'solo', companionId: PRIMARY_COMPANION_ID })).toBe('solo-primary')
    expect(threadIdFor({ kind: 'solo', companionId: 'vela' })).toBe('solo-vela')
    expect(threadIdFor({ kind: 'group' })).toBe('group-party')
  })
})

describe('setTarget — switching loads that thread', () => {
  it('loads the selected companion’s own message history', async () => {
    await useGame.getState().seedNewGame('阿旅')
    await chatRepo.putMessage(mkMsg({ id: 'v1', threadId: 'solo-vela', sender: 'player', text: '嗨薇拉', createdAt: '2026-01-01T00:00:00.000Z' }))
    await chatRepo.putMessage(mkMsg({ id: 'v2', threadId: 'solo-vela', sender: 'vela', text: '你好，旅人', createdAt: '2026-01-01T00:00:01.000Z' }))

    await useChat.getState().setTarget({ kind: 'solo', companionId: 'vela' })

    expect(useChat.getState().target).toEqual({ kind: 'solo', companionId: 'vela' })
    expect(useChat.getState().messages.map((m) => m.id)).toEqual(['v1', 'v2'])
  })
})

describe('send — solo (1-on-1)', () => {
  it('appends the user line + one bot reply and persists under the companion’s thread', async () => {
    await useGame.getState().seedNewGame('阿旅') // primary = mira, target defaults to solo-primary
    mockChat.mockResolvedValue({ reply: '嗨，我在的！', expression: 'smile' })

    await useChat.getState().send('在吗')

    const msgs = useChat.getState().messages
    expect(msgs.map((m) => m.sender)).toEqual(['player', 'mira']) // in-memory order is deterministic
    expect(msgs[1].text).toBe('嗨，我在的！')
    expect(mockChat).toHaveBeenCalledTimes(1)
    expect(useChat.getState().sending).toBe(false)

    const persisted = await chatRepo.messages('solo-primary')
    expect(persisted).toHaveLength(2)
    expect(persisted.some((m) => m.sender === 'mira')).toBe(true)
  })
})

describe('send — group (队伍群聊)', () => {
  it('every party companion replies once, in party order, each seeing the prior replies', async () => {
    await useGame.getState().seedNewGame('阿旅') // mira in party
    addPartyCompanions(['vela', 'nova']) // party companions: mira, vela, nova
    let n = 0
    mockChat.mockImplementation(async () => {
      n += 1
      return { reply: `reply-${n}`, expression: 'smile' }
    })

    await useChat.getState().setTarget({ kind: 'group' })
    await useChat.getState().send('大家好')

    const msgs = useChat.getState().messages
    expect(msgs.map((m) => m.sender)).toEqual(['player', 'mira', 'vela', 'nova'])
    expect(mockChat).toHaveBeenCalledTimes(3)
    expect(useChat.getState().sending).toBe(false)
    expect(useChat.getState().thinkingName).toBeNull()

    // Transcript grows: the 2nd speaker sees reply-1; the 3rd sees reply-1 and reply-2.
    expect(mockChat.mock.calls[1][0].contextBlock).toContain('reply-1')
    expect(mockChat.mock.calls[2][0].contextBlock).toContain('reply-1')
    expect(mockChat.mock.calls[2][0].contextBlock).toContain('reply-2')
  })

  it('a missing API key surfaces ONE error and stops the round (no fallback spam)', async () => {
    await useGame.getState().seedNewGame('阿旅')
    addPartyCompanions(['vela', 'nova']) // 3 party companions
    mockChat.mockRejectedValue(new AIError('no-key', '尚未设置 API Key'))

    await useChat.getState().setTarget({ kind: 'group' })
    await useChat.getState().send('hi')

    expect(mockChat).toHaveBeenCalledTimes(1) // stopped after the first failure
    expect(useChat.getState().messages.map((m) => m.sender)).toEqual(['player']) // only the player line
    expect(useChat.getState().error).toContain('API Key')
    expect(useChat.getState().sending).toBe(false)
    expect(useChat.getState().thinkingName).toBeNull()
  })
})

describe('§29 streaming state machine', () => {
  it('streamingText grows via onDelta, then commits as a message and clears', async () => {
    const { useGame: game } = await import('./gameStore')
    await game.getState().seedNewGame('旅人')
    const observed: (string | null)[] = []
    mockChat.mockImplementation(async (_req, onDelta) => {
      onDelta('你')
      observed.push(useChat.getState().streamingText)
      onDelta('你好呀')
      observed.push(useChat.getState().streamingText)
      return { reply: '你好呀，旅人！', expression: 'smile' as const }
    })
    await useChat.getState().send('在吗')
    expect(observed).toEqual(['你', '你好呀'])
    const s = useChat.getState()
    expect(s.streamingText).toBeNull()
    expect(s.streamingSender).toBeNull()
    expect(s.sending).toBe(false)
    expect(s.messages.at(-1)?.text).toBe('你好呀，旅人！')
  })
})
