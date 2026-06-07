import { useEffect, useRef, useState } from 'react'
import { selectPrimaryCompanion, useGame } from '../state/gameStore'
import { useChat } from '../state/chatStore'

export function ChatPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const messages = useChat((s) => s.messages)
  const sending = useChat((s) => s.sending)
  const error = useChat((s) => s.error)
  const send = useChat((s) => s.send)
  const companion = useGame(selectPrimaryCompanion)
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    void send(text)
    setText('')
  }

  return (
    <div className="panel chat">
      <div className="panel-title">
        <span>与 {companion?.name ?? '伙伴'} 对话</span>
      </div>
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="msg system">和 {companion?.name ?? '伙伴'} 说点什么吧 —— TA 知道你今天的进度哦。</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender === 'player' ? 'player' : m.sender === 'system' ? 'system' : 'bot'}`}>
            {m.text}
          </div>
        ))}
        {sending && (
          <div className="thinking">
            {companion?.name ?? '伙伴'} 正在思考
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
