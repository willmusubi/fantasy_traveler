import { useState } from 'react'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { scriptDefFor } from '../world/worlds'
import { Modal } from './Modal'

/** §23 campaign-complete prompt: a finished campaign ENDS here (no endless-loop) and offers to save
 *  it as a replayable 副本, replay it from the start, or return to the map. Shown AFTER the victory
 *  settlement window is dismissed, so the two don't stack. Escape / backdrop → 返回地图. */
export function ScriptCompleteModal() {
  const completion = useGame((s) => s.scriptCompletion)
  const victory = useGame((s) => s.victorySummary)
  const saveActiveAsDungeon = useGame((s) => s.saveActiveAsDungeon)
  const clearScriptCompletion = useGame((s) => s.clearScriptCompletion)
  const startScript = useQuest((s) => s.startScript)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  if (!completion || victory) return null
  const script = scriptDefFor(completion.scriptId)

  const defByKey = new Map((script?.flags ?? []).map((f) => [f.key, f]))
  const facts = Object.entries(completion.flags).map(([k, v]) => {
    const def = defByKey.get(k)
    const meaning = def?.values && typeof v === 'string' ? def.values[v] : undefined
    return `${def?.description ?? k}：${meaning ?? String(v)}`
  })

  const onSave = async () => {
    setBusy(true)
    await saveActiveAsDungeon(label)
    setBusy(false)
    clearScriptCompletion()
  }
  const onReplay = async () => {
    if (!script) return
    setBusy(true)
    clearScriptCompletion()
    await startScript(script.worldId, script.id)
    setBusy(false)
  }

  return (
    <Modal label="战役通关" onClose={clearScriptCompletion} className="script-choice-modal">
      <h2>✦ 战役通关</h2>
      <p className="script-choice-prompt">
        {script ? `「${script.title}」的旅程告一段落。` : '战役结束。'}你的抉择，编织出了属于自己的结局。
      </p>
      {facts.length > 0 && (
        <div className="dungeon-flags">
          {facts.map((f, i) => (
            <span key={i} className="dungeon-flag">
              {f}
            </span>
          ))}
        </div>
      )}
      <div className="dungeon-save-row" style={{ marginTop: 14 }}>
        <input
          className="input"
          placeholder={script?.title ?? '副本名'}
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy} onClick={() => void onSave()}>
          收藏为副本
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => void onReplay()}>
          重新开始
        </button>
        <button className="btn btn-ghost" onClick={clearScriptCompletion}>
          返回地图
        </button>
      </div>
    </Modal>
  )
}
