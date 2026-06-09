import { useGame } from '../state/gameStore'
import { Modal } from './Modal'

/** Roguelike "choose 1 of N buffs" draft, shown after a daily habit is completed. Reads the
 *  head of the pending queue; picking applies the buff and pops the next (if any). */
export function BuffChoiceModal() {
  const choice = useGame((s) => s.pendingBuffChoices[0])
  const remaining = useGame((s) => s.pendingBuffChoices.length)
  const chooseBuff = useGame((s) => s.chooseBuff)
  const dismissBuffChoice = useGame((s) => s.dismissBuffChoice)
  if (!choice) return null

  return (
    <Modal label="坚持的回报" onClose={dismissBuffChoice} className="buff-modal">
      <h2>✦ 坚持的回报</h2>
      <p className="buff-modal-sub">
        完成了一个习惯，选择一项增益（持续到下一场战斗胜利）
        {remaining > 1 ? ` · 还有 ${remaining - 1} 次待选` : ''}
      </p>
      <div className="buff-choice-grid">
        {choice.options.map((o) => (
          <button key={o.id} className="buff-card" onClick={() => void chooseBuff(o.id)}>
            <span className="buff-card-icon" aria-hidden>
              {o.icon}
            </span>
            <span className="buff-card-name">{o.label}</span>
            <span className="buff-card-desc">{o.desc}</span>
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={dismissBuffChoice}>
          跳过
        </button>
      </div>
    </Modal>
  )
}
