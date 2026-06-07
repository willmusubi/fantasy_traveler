import { useEffect } from 'react'
import { useGame } from '../state/gameStore'
import { Portrait } from './Portrait'

/** The felt-reward popup: whoever just reacted (a random on-field companion) pipes up here
 *  with a small portrait so it's clear who's speaking. App-level, so it shows in both the
 *  adventure and calendar zones. Auto-dismisses; click to dismiss early. */
export function ReactionPopup() {
  const reaction = useGame((s) => s.reaction)
  const characters = useGame((s) => s.characters)
  const clearReaction = useGame((s) => s.clearReaction)

  useEffect(() => {
    if (!reaction) return
    const id = setTimeout(clearReaction, 5200)
    return () => clearTimeout(id)
  }, [reaction, clearReaction])

  if (!reaction) return null
  const who = characters.find((c) => c.id === reaction.companionId)
  if (!who) return null

  return (
    <div className="reaction-popup" role="status" key={reaction.key} onClick={clearReaction}>
      <Portrait portraitSet={who.portraitSet} expression={reaction.expression} name={who.name} />
      <div className="rp-body">
        <div className="rp-name">{who.name}</div>
        <div className="rp-text">{reaction.text}</div>
        {reaction.affinityDelta > 0 && <span className="affinity-float">+{reaction.affinityDelta} 好感</span>}
      </div>
    </div>
  )
}
