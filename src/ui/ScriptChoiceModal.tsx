import { useGame } from '../state/gameStore'
import { Modal } from './Modal'

/** Post-boss branch modal (§23): the player picks the next path; the choice sets persistent story
 *  flags and may recruit characters / grant loot, then advances the campaign. Mandatory — the
 *  campaign is paused on it, so there is no skip (dismissable={false}: no Escape / backdrop close). */
export function ScriptChoiceModal() {
  const choice = useGame((s) => s.pendingScriptChoice)
  const chooseScriptOption = useGame((s) => s.chooseScriptOption)
  if (!choice) return null

  return (
    <Modal label="命运的抉择" className="script-choice-modal" dismissable={false}>
      <h2>✦ 命运的抉择</h2>
      <p className="script-choice-prompt">{choice.prompt}</p>
      <div className="script-choice-grid">
        {choice.options.map((o) => (
          <button key={o.id} className="script-choice-card" onClick={() => void chooseScriptOption(o.id)}>
            <span className="script-choice-label">{o.label}</span>
            <span className="script-choice-desc">{o.description}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
