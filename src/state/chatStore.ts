import { create } from 'zustand'
import { AIError, buildSystemPrompt, type ChatTurn } from '../ai/client'
import { chatStream } from '../ai/clientStream'
import { buildContext, renderContextZh } from '../ai/contextBuilder'
import { buildGroupSystemPrompt } from '../ai/prompts'
import { PRIMARY_COMPANION_ID } from '../companion/roster'
import { chatRepo } from '../data/repositories'
import type { Character, ChatMessage, MoodFlag } from '../domain/types'
import { renderScriptFacts } from '../world/scriptFacts'
import { scriptDefFor } from '../world/worlds'
import { selectPartyCompanions, selectPlayer, useGame } from './gameStore'
import { useJournal } from './journalStore'
import { useSettings } from './settingsStore'
import { useTodos } from './todoStore'

/** Who the player is currently talking to: one recruited companion (solo) or the active party (group). */
export type ChatTarget = { kind: 'solo'; companionId: string } | { kind: 'group' }

const GROUP_THREAD_ID = 'group-party'
const NO_KEY_ERROR = '还没有设置 API Key。点右上角「设置」填入你的 Anthropic Key 就能聊天啦～'

/** Map a chat target to its persistent thread id. The PRIMARY companion's solo thread keeps the
 *  legacy 'solo-primary' key so the user's pre-existing chat history isn't orphaned (the old store
 *  only ever wrote primary-companion messages there). */
export function threadIdFor(target: ChatTarget): string {
  if (target.kind === 'group') return GROUP_THREAD_ID
  return target.companionId === PRIMARY_COMPANION_ID ? 'solo-primary' : `solo-${target.companionId}`
}

function sameTarget(a: ChatTarget, b: ChatTarget): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'group' || a.companionId === (b as { kind: 'solo'; companionId: string }).companionId
}

interface ChatStore {
  target: ChatTarget
  messages: ChatMessage[]
  sending: boolean
  /** In a group round, the companion currently composing a reply (drives the thinking line). null in solo. */
  thinkingName: string | null
  /** §29 — the reply streaming in RIGHT NOW (typing effect); null when idle/committed. */
  streamingText: string | null
  /** §29 — companion id of the streaming bubble (group chat labels the speaker). */
  streamingSender: string | null
  error: string | null
  hydrate: () => Promise<void>
  setTarget: (t: ChatTarget) => Promise<void>
  send: (text: string) => Promise<void>
}

function msg(threadId: string, over: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'text'>): ChatMessage {
  return {
    id: crypto.randomUUID(),
    threadId,
    createdAt: new Date().toISOString(),
    ...over,
  }
}

export const useChat = create<ChatStore>((set, get) => ({
  target: { kind: 'solo', companionId: PRIMARY_COMPANION_ID },
  messages: [],
  sending: false,
  thinkingName: null,
  streamingText: null,
  streamingSender: null,
  error: null,

  async hydrate() {
    const messages = await chatRepo.messages(threadIdFor(get().target))
    set({ messages })
  },

  async setTarget(t) {
    if (get().sending) return // don't swap threads mid-send
    // Clear synchronously so the previous thread's bubbles never flash under the new target.
    set({ target: t, error: null, messages: [] })
    const messages = await chatRepo.messages(threadIdFor(t))
    if (sameTarget(get().target, t)) set({ messages }) // guard the async read against a newer switch
  },

  async send(text) {
    const trimmed = text.trim()
    if (!trimmed || get().sending) return
    return get().target.kind === 'group' ? runGroupRound(trimmed) : runSolo(trimmed)
  },
}))

/** 1-on-1 chat with the selected companion. Behaviorally identical to the original single-thread
 *  store, except the companion + thread are resolved from the active target. */
async function runSolo(trimmed: string): Promise<void> {
  const game = useGame.getState()
  const player = selectPlayer(game)
  const target = useChat.getState().target
  const companionId = target.kind === 'solo' ? target.companionId : PRIMARY_COMPANION_ID
  const companion = game.characters.find((c) => c.id === companionId)
  if (!player || !companion || !companion.persona) return

  const threadId = threadIdFor(target)

  // Optimistic echo of the user's message.
  const userMsg = msg(threadId, { sender: 'player', text: trimmed })
  useChat.setState({ messages: [...useChat.getState().messages, userMsg], sending: true, error: null })
  await chatRepo.putMessage(userMsg)

  const settings = useSettings.getState().settings
  const apiKey = settings.apiKey ?? ''

  const affinityRank = game.affinities[companion.id]?.rank ?? 'none'
  const moodFlag: MoodFlag = game.gameState?.moodFlags[companion.id] ?? 'idle'
  const ctx = buildContext({
    player,
    affinityRank,
    todos: useTodos.getState().todos,
    moodFlag,
    now: new Date(),
    journal: useJournal.getState().entries, // §29 — companions see your recent moods
  })

  const history: ChatTurn[] = useChat
    .getState()
    .messages.filter((m) => m.sender !== 'system')
    .slice(-10, -1) // exclude the just-added user message (passed separately)
    .map((m) => ({ role: m.sender === 'player' ? 'user' : 'assistant', text: m.text }))

  // §23: append the player's persistent story facts so the companion's reply respects the alternate
  // history they created (e.g. a rescued character is alive). Same renderer as quest generation.
  const gs = game.gameState
  const scriptFacts = gs ? renderScriptFacts(gs.scriptFlags, scriptDefFor(gs.activeScriptId)) : ''
  const contextBlock = scriptFacts ? `${renderContextZh(ctx)}\n\n${scriptFacts}` : renderContextZh(ctx)

  try {
    // §29 streaming: the reply types itself out, then commits as a normal message.
    useChat.setState({ streamingSender: companion.id, streamingText: '' })
    const reply = await chatStream(
      {
        apiKey,
        model: settings.model,
        systemPrompt: buildSystemPrompt(companion.persona, companion.name),
        contextBlock,
        history,
        userMessage: trimmed,
      },
      (replySoFar) => useChat.setState({ streamingText: replySoFar }),
    )
    if (reply.usage) void useSettings.getState().recordTokenUsage(reply.usage)
    const botMsg = msg(threadId, { sender: companion.id, text: reply.reply, expression: reply.expression })
    await chatRepo.putMessage(botMsg)
    useChat.setState({
      messages: [...useChat.getState().messages, botMsg],
      sending: false, streamingText: null, streamingSender: null,
    })
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError('unknown', String(err))
    if (e.kind === 'no-key') {
      useChat.setState({ sending: false, streamingText: null, streamingSender: null, error: NO_KEY_ERROR })
      return
    }
    const fallback = msg(threadId, {
      sender: companion.id,
      text: '（信号好像不太稳…我们待会儿再聊好不好？）',
      expression: 'worried',
    })
    await chatRepo.putMessage(fallback)
    useChat.setState({
      messages: [...useChat.getState().messages, fallback],
      sending: false, streamingText: null, streamingSender: null,
      error: e.kind === 'auth' ? 'API Key 无效，请在设置里检查。' : '网络或服务异常，已先用备用回复。',
    })
  }
}

/** Group chat: every active-party companion replies in party order, each seeing the prior replies
 *  this round (so they can play off each other). One sequential chat() call per companion. */
async function runGroupRound(trimmed: string): Promise<void> {
  const game = useGame.getState()
  const player = selectPlayer(game)
  const party = selectPartyCompanions(game) // companions in party order; benched companions excluded by design
  if (!player) return
  if (party.length === 0) {
    useChat.setState({ error: '队伍里还没有伙伴，先去「队伍」加入伙伴再群聊吧～' })
    return
  }

  const userMsg = msg(GROUP_THREAD_ID, { sender: 'player', text: trimmed })
  useChat.setState({ messages: [...useChat.getState().messages, userMsg], sending: true, error: null })
  await chatRepo.putMessage(userMsg)

  const settings = useSettings.getState().settings
  const apiKey = settings.apiKey ?? ''
  const gs = game.gameState
  const scriptFacts = gs ? renderScriptFacts(gs.scriptFlags, scriptDefFor(gs.activeScriptId)) : ''
  const allNames = party.map((c) => c.name)
  const roundStart = userMsg.createdAt

  for (const companion of party) {
    if (!companion.persona) continue
    useChat.setState({ thinkingName: companion.name })

    const affinityRank = game.affinities[companion.id]?.rank ?? 'none'
    const moodFlag: MoodFlag = gs?.moodFlags[companion.id] ?? 'idle'
    const ctx = renderContextZh(
      buildContext({
        player, affinityRank, todos: useTodos.getState().todos, moodFlag, now: new Date(),
        journal: useJournal.getState().entries, // §29
      }),
    )
    // Rebuilt every iteration from live messages → later speakers see earlier replies this round.
    const transcript = renderGroupTranscript(useChat.getState().messages, roundStart, player.name, game.characters)
    const others = allNames.filter((n) => n !== companion.name)
    const contextBlock = [ctx, scriptFacts, transcript].filter(Boolean).join('\n\n')

    try {
      // §29 streaming: each speaker's reply types out before committing (sequential round kept).
      useChat.setState({ streamingSender: companion.id, streamingText: '' })
      const reply = await chatStream(
        {
          apiKey,
          model: settings.model,
          systemPrompt: buildGroupSystemPrompt(companion.persona, companion.name, others),
          contextBlock,
          history: [], // multi-speaker history lives in the transcript above (avoids role-alternation issues)
          userMessage: `现在轮到你「${companion.name}」在群聊里接话。读上面的群聊记录，自然地回应${player.name}或其他伙伴刚说的话，只说你自己的一两句。`,
        },
        (replySoFar) => useChat.setState({ streamingText: replySoFar }),
      )
      if (reply.usage) void useSettings.getState().recordTokenUsage(reply.usage)
      const botMsg = msg(GROUP_THREAD_ID, { sender: companion.id, text: reply.reply, expression: reply.expression })
      await chatRepo.putMessage(botMsg)
      useChat.setState({
        messages: [...useChat.getState().messages, botMsg], // appears before the next speaks
        streamingText: null, streamingSender: null,
      })
    } catch (err) {
      const e = err instanceof AIError ? err : new AIError('unknown', String(err))
      if (e.kind === 'no-key') {
        // A missing key fails for everyone — surface ONE banner and stop the whole round.
        useChat.setState({ sending: false, thinkingName: null, streamingText: null, streamingSender: null, error: NO_KEY_ERROR })
        return
      }
      const fallback = msg(GROUP_THREAD_ID, {
        sender: companion.id,
        text: '（信号有点乱，我先听你们说～）',
        expression: 'worried',
      })
      await chatRepo.putMessage(fallback)
      useChat.setState({ messages: [...useChat.getState().messages, fallback], streamingText: null, streamingSender: null })
    }
  }

  useChat.setState({ sending: false, thinkingName: null, streamingText: null, streamingSender: null })
}

/** The current round as a speaker-labeled transcript, injected into each group speaker's context.
 *  Scoped to messages at/after the player's line so token cost stays bounded (prior rounds remain
 *  persisted and shown in the UI, but aren't re-sent to the model). */
function renderGroupTranscript(
  messages: ChatMessage[],
  sinceCreatedAt: string,
  playerName: string,
  characters: Character[],
): string {
  const round = messages.filter((m) => m.createdAt >= sinceCreatedAt && m.sender !== 'system')
  if (round.length === 0) return ''
  const lines = round.map((m) => {
    const who = m.sender === 'player' ? playerName : (characters.find((c) => c.id === m.sender)?.name ?? m.sender)
    return `「${who}」：${m.text}`
  })
  return ['【群聊记录】', ...lines].join('\n')
}
