// The ONE Anthropic wrapper (§12, §21). All LLM calls route through here: model
// selection, cache_control prefix, timeout, structured tool-use parsing, error
// classification. The chat store maps errors to a canned in-character fallback.

// Type-only import → elided at build, so the ~SDK never lands in the eager main chunk. The actual
// constructor is pulled in via dynamic import() inside makeClient, only when a call is made (chat /
// testKey). This keeps the Anthropic SDK out of every first-paint download (it's only needed once
// the user actually chats or validates a key).
import type AnthropicClient from '@anthropic-ai/sdk'
import { coerceExpression } from '../companion/expressions'
import { CHAT_MAX_TOKENS, CHAT_TIMEOUT_MS, DEFAULT_MODEL } from '../domain/config'
import type { ExpressionKey } from '../domain/types'
import { buildSystemPrompt, RESPOND_TOOL } from './prompts'

export type AIErrorKind = 'no-key' | 'auth' | 'rate-limit' | 'network' | 'timeout' | 'parse' | 'unknown'

export class AIError extends Error {
  constructor(public kind: AIErrorKind, message: string) {
    super(message)
    this.name = 'AIError'
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatReply {
  reply: string
  expression: ExpressionKey
  internalMood?: string
}

export interface ChatRequest {
  apiKey: string
  model?: string
  systemPrompt: string // static persona+rules block (cacheable)
  contextBlock: string // dynamic rolling life-context (not cached)
  history: ChatTurn[]
  userMessage: string
}

async function makeClient(apiKey: string): Promise<AnthropicClient> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export function classify(err: unknown): AIError {
  if (err instanceof AIError) return err
  const status = (err as { status?: number })?.status
  if (status === 401 || status === 403) return new AIError('auth', 'API key 无效或无权限')
  if (status === 429) return new AIError('rate-limit', '请求过于频繁或额度不足')
  const name = (err as { name?: string })?.name
  if (name === 'AbortError') return new AIError('timeout', '响应超时')
  return new AIError('network', (err as Error)?.message ?? '网络错误')
}

/** Build the system content blocks: static cached prefix + dynamic context. */
export function buildSystemBlocks(systemPrompt: string, contextBlock: string) {
  return [
    { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: `【当前状态】\n${contextBlock}` },
  ]
}

export async function chat(req: ChatRequest): Promise<ChatReply> {
  if (!req.apiKey) throw new AIError('no-key', '尚未设置 API Key')

  const client = await makeClient(req.apiKey)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  try {
    const res = await client.messages.create(
      {
        model: req.model || DEFAULT_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        system: buildSystemBlocks(req.systemPrompt, req.contextBlock),
        tools: [RESPOND_TOOL],
        tool_choice: { type: 'tool', name: 'respond' },
        messages: [
          ...req.history.map((t) => ({ role: t.role, content: t.text })),
          { role: 'user' as const, content: req.userMessage },
        ],
      },
      { signal: controller.signal },
    )

    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (toolUse && toolUse.type === 'tool_use') {
      const input = toolUse.input as { reply?: unknown; expression?: unknown; internalMood?: unknown }
      const reply = typeof input.reply === 'string' ? input.reply.trim() : ''
      if (!reply) throw new AIError('parse', '回复为空')
      return {
        reply,
        expression: coerceExpression(input.expression),
        internalMood: typeof input.internalMood === 'string' ? input.internalMood : undefined,
      }
    }

    // Fallback: a stray text block.
    const textBlock = res.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text' && textBlock.text.trim()) {
      return { reply: textBlock.text.trim(), expression: 'neutral' }
    }
    throw new AIError('parse', '未能解析模型回复')
  } catch (err) {
    throw classify(err)
  } finally {
    clearTimeout(timer)
  }
}

/** Validate a key with a tiny call. Returns the failure kind, or null on success. */
export async function testKey(apiKey: string, model = DEFAULT_MODEL): Promise<AIErrorKind | null> {
  if (!apiKey) return 'no-key'
  try {
    const client = await makeClient(apiKey)
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: '1' }],
    })
    return null
  } catch (err) {
    return classify(err).kind
  }
}

/** Build the static system prompt for a companion (re-exported for the store). */
export { buildSystemPrompt }
