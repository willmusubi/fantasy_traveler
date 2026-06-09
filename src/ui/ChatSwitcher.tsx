import { useChat, type ChatTarget } from '../state/chatStore'
import type { Character } from '../domain/types'
import { useGame } from '../state/gameStore'
import { AffinityBar } from './AffinityBar'
import { Portrait } from './Portrait'

/** Slim chat-target selector that replaces the old companion card: one avatar per recruited
 *  companion (1-on-1) plus a 队伍 group-chat chip, with a thin affinity line for the active solo
 *  companion. Recruited (= unlockedCompanionIds) drives the solo avatars; the active PARTY drives
 *  group chat, so a benched companion is chattable 1-on-1 but isn't part of the group. */
export function ChatSwitcher() {
  const gs = useGame((s) => s.gameState)
  const characters = useGame((s) => s.characters)
  const target = useChat((s) => s.target)
  const sending = useChat((s) => s.sending)
  const setTarget = useChat((s) => s.setTarget)
  if (!gs) return null

  const recruited = gs.unlockedCompanionIds
    .map((id) => characters.find((c) => c.id === id && c.kind === 'companion'))
    .filter((c): c is Character => Boolean(c))
  const partyCompanions = gs.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c) && c!.kind === 'companion')

  const groupEnabled = partyCompanions.length >= 2
  const activeSoloId = target.kind === 'solo' ? target.companionId : null
  const activeSolo = activeSoloId ? characters.find((c) => c.id === activeSoloId) : undefined

  const pick = (t: ChatTarget) => {
    if (sending) return
    void setTarget(t)
  }

  return (
    <div className="panel chat-switcher-panel">
      <div className="chat-switcher">
        {recruited.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`switch-avatar ${activeSoloId === c.id ? 'on' : ''}`}
            disabled={sending}
            title={c.name}
            onClick={() => pick({ kind: 'solo', companionId: c.id })}
          >
            <Portrait portraitSet={c.portraitSet} expression={c.persona?.defaultExpression ?? 'smile'} name={c.name} head />
          </button>
        ))}
        <span className="cs-sep" aria-hidden />
        <button
          type="button"
          className={`switch-group ${target.kind === 'group' ? 'on' : ''}`}
          disabled={sending || !groupEnabled}
          title={groupEnabled ? '队伍群聊' : '队伍里至少要有 2 位伙伴才能群聊'}
          onClick={() => pick({ kind: 'group' })}
        >
          👥 群聊
        </button>
      </div>

      {target.kind === 'solo' && activeSoloId && (
        <div className="chat-switcher-meta">
          <span className="cs-name">
            {activeSolo?.name ?? activeSoloId}
            {activeSolo?.brand ? ` · ${activeSolo.brand}` : ''}
          </span>
          <AffinityBar companionId={activeSoloId} />
        </div>
      )}
      {target.kind === 'group' && (
        <div className="chat-switcher-meta">
          <span className="cs-name">队伍 · {partyCompanions.map((c) => c.name).join('、')}</span>
        </div>
      )}
    </div>
  )
}
