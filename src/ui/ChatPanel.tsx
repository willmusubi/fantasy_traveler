import { useEffect, useRef, useState } from 'react'
import { useChat } from '../state/chatStore'
import { useGame } from '../state/gameStore'
import { prefersReducedMotion } from './reducedMotion'

export function ChatPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const messages = useChat((s) => s.messages)
  const sending = useChat((s) => s.sending)
  const thinkingName = useChat((s) => s.thinkingName)
  const streamingText = useChat((s) => s.streamingText)
  const streamingSender = useChat((s) => s.streamingSender)
  const error = useChat((s) => s.error)
  const send = useChat((s) => s.send)
  const target = useChat((s) => s.target)
  const characters = useGame((s) => s.characters)
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const isGroup = target.kind === 'group'
  const soloCompanion = target.kind === 'solo' ? characters.find((c) => c.id === target.companionId) : undefined
  const title = isGroup ? '队伍群聊' : `与 ${soloCompanion?.name ?? '伙伴'} 对话`
  const emptyText = isGroup
    ? '和队伍里的伙伴们聊聊吧 —— 大家都会接话哦。'
    : `和 ${soloCompanion?.name ?? '伙伴'} 说点什么吧 —— 你今天的进度，${soloCompanion?.name ?? '伙伴'}都看在眼里哦。`
  const thinkingWho = thinkingName ?? soloCompanion?.name ?? '伙伴'
  const nameFor = (sender: string) => characters.find((c) => c.id === sender)?.name ?? '伙伴'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [messages, sending, streamingText])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    void send(text)
    setText('')
  }

  return (
    <div className="panel chat">
      <div className="panel-title">
        <span>{title}</span>
      </div>
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && <div className="msg system">{emptyText}</div>}
        {messages.map((m) => {
          const kind = m.sender === 'player' ? 'player' : m.sender === 'system' ? 'system' : 'bot'
          return (
            <div key={m.id} className={`msg ${kind}`}>
              {isGroup && kind === 'bot' && <div className="msg-speaker">{nameFor(m.sender)}</div>}
              {m.text}
            </div>
          )
        })}
        {/* §29 — the streaming bubble: the reply types itself out, then commits above. */}
        {streamingText !== null && streamingText.length > 0 && (
          <div className="msg bot streaming">
            {isGroup && streamingSender && <div className="msg-speaker">{nameFor(streamingSender)}</div>}
            {streamingText}
            <span className="stream-caret" aria-hidden />
          </div>
        )}
        {sending && !streamingText && (
          <div className="thinking">
            {thinkingWho} 正在思考
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
      </div>
      {error && (
        <div className="error-banner">
          {error}{' '}
          {error.includes('API Key') && (
            <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={onOpenSettings}>
              去设置
            </button>
          )}
        </div>
      )}
      <form className="chat-input" onSubmit={submit}>
        <input
          className="input"
          placeholder="说点什么…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sending}
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !text.trim()}>
          发送
        </button>
      </form>
    </div>
  )
}
