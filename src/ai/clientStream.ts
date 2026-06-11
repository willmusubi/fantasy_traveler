// §29 streaming chat. Same contract as client.ts#chat (forced respond-tool, cached
// persona block, timeout, error classification) but the reply renders token-by-token.
//
// The trick: with a FORCED TOOL the stream emits input_json_delta fragments of
// {"reply":"…","expression":"…"} — not clean text. `reply` is the FIRST schema property,
// so the model emits it first; extractReplyPrefix() peels the growing string value out of
// the partial JSON (safe-unescaped) and the UI gets a typing effect with zero prompt or
// contract changes. The final parse still comes from the SDK's accumulated message.

import { coerceExpression } from '../companion/expressions'
import { CHAT_MAX_TOKENS, CHAT_TIMEOUT_MS, DEFAULT_MODEL } from '../domain/config'
import { AIError, buildSystemBlocks, classify, type ChatReply, type ChatRequest } from './client'
import { RESPOND_TOOL } from './prompts'

/** Per-call token usage (for the cost meter). cacheWrite = cache_creation_input_tokens. */
export interface TokenUsageDelta {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface StreamedChatReply extends ChatReply {
  usage?: TokenUsageDelta
}

/** Matches the longest complete escaped-string PREFIX of the reply value inside a partial
 *  JSON buffer: pairs of (non-quote/backslash | escape sequence) — a trailing lone backslash
 *  is deliberately left unmatched so JSON.parse below can never throw. */
const REPLY_PREFIX_RE = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)/

export function extractReplyPrefix(partialJson: string): string {
  const m = REPLY_PREFIX_RE.exec(partialJson)
  if (!m) return ''
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return ''
  }
}

/** Streaming sibling of chat(). `onDelta` receives the reply-so-far (full prefix, not the
 *  increment) every time it grows. Resolves with the final parsed reply + token usage. */
export async function chatStream(
  req: ChatRequest,
  onDelta: (replySoFar: string) => void,
): Promise<StreamedChatReply> {
  if (!req.apiKey) throw new AIError('no-key', '尚未设置 API Key')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS * 2) // streams run longer than one-shots

  try {
    const stream = client.messages.stream(
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

    let buf = ''
    let lastEmitted = ''
    stream.on('streamEvent', (event) => {
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        buf += event.delta.partial_json
        const reply = extractReplyPrefix(buf)
        if (reply && reply !== lastEmitted) {
          lastEmitted = reply
          onDelta(reply)
        }
      }
    })

    const final = await stream.finalMessage()
    const usage: TokenUsageDelta = {
      input: final.usage.input_tokens,
      output: final.usage.output_tokens,
      cacheRead: final.usage.cache_read_input_tokens ?? 0,
      cacheWrite: final.usage.cache_creation_input_tokens ?? 0,
    }

    const toolUse = final.content.find((b) => b.type === 'tool_use')
    if (toolUse && toolUse.type === 'tool_use') {
      const input = toolUse.input as { reply?: unknown; expression?: unknown; internalMood?: unknown }
      const reply = typeof input.reply === 'string' ? input.reply.trim() : ''
      if (!reply) throw new AIError('parse', '回复为空')
      return {
        reply,
        expression: coerceExpression(input.expression),
        internalMood: typeof input.internalMood === 'string' ? input.internalMood : undefined,
        usage,
      }
    }
    const textBlock = final.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text' && textBlock.text.trim()) {
      return { reply: textBlock.text.trim(), expression: 'neutral', usage }
    }
    throw new AIError('parse', '未能解析模型回复')
  } catch (err) {
    throw classify(err)
  } finally {
    clearTimeout(timer)
  }
}
