import { create } from 'zustand'
import { AIError, buildSystemPrompt, chat, type ChatTurn } from '../ai/client'
import { buildContext, renderContextZh } from '../ai/contextBuilder'
import { chatRepo } from '../data/repositories'
import type { ChatMessage, MoodFlag } from '../domain/types'
import { selectPlayer, selectPrimaryCompanion, useGame } from './gameStore'
import { useSettings } from './settingsStore'
import { useTodos } from './todoStore'

const THREAD_ID = 'solo-primary'

interface ChatStore {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  hydrate: () => Promise<void>
  send: (text: string) => Promise<void>
}

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'text'>): ChatMessage {
  return {
    id: crypto.randomUUID(),
    threadId: THREAD_ID,
    createdAt: new Date().toISOString(),
    ...over,
  }
}

export const useChat = create<ChatStore>((set, get) => ({
  messages: [],
  sending: false,
  error: null,

  async hydrate() {
    const messages = await chatRepo.messages(THREAD_ID)
    set({ messages })
  },

  async send(text) {
    const trimmed = text.trim()
    if (!trimmed || get().sending) return

    const game = useGame.getState()
    const player = selectPlayer(game)
    const companion = selectPrimaryCompanion(game)
    if (!player || !companion || !companion.persona) return

    // Optimistic echo of the user's message.
    const userMsg = msg({ sender: 'player', text: trimmed })
    set({ messages: [...get().messages, userMsg], sending: true, error: null })
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
    })

    const history: ChatTurn[] = get()
      .messages.filter((m) => m.sender !== 'system')
      .slice(-10, -1) // exclude the just-added user message (passed separately)
      .map((m) => ({ role: m.sender === 'player' ? 'user' : 'assistant', text: m.text }))

    try {
      const reply = await chat({
        apiKey,
        model: settings.model,
        systemPrompt: buildSystemPrompt(companion.persona, companion.name),
        contextBlock: renderContextZh(ctx),
        history,
        userMessage: trimmed,
      })
      const botMsg = msg({ sender: companion.id, text: reply.reply, expression: reply.expression })
      await chatRepo.putMessage(botMsg)
      set({ messages: [...get().messages, botMsg], sending: false })
    } catch (err) {
      const e = err instanceof AIError ? err : new AIError('unknown', String(err))
      if (e.kind === 'no-key') {
        set({ sending: false, error: '还没有设置 API Key。点右上角「设置」填入你的 Anthropic Key 就能和我聊天啦～' })
        return
      }
      const fallback = msg({
        sender: companion.id,
        text: '（信号好像不太稳…我们待会儿再聊好不好？）',
        expression: 'worried',
      })
      await chatRepo.putMessage(fallback)
      set({
        messages: [...get().messages, fallback],
        sending: false,
        error: e.kind === 'auth' ? 'API Key 无效，请在设置里检查。' : '网络或服务异常，已先用备用回复。',
      })
    }
  },
}))
