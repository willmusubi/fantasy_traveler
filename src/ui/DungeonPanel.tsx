import { useEffect, useState } from 'react'
import { dungeonsRepo } from '../data/repositories'
import type { DungeonRecord, ScriptDef } from '../domain/types'
import { useGame } from '../state/gameStore'
import { scriptDefFor } from '../world/worlds'

/** Render a saved 副本's ending flags via the script's flag declarations (meaning over raw value). */
function flagSummary(rec: DungeonRecord): string[] {
  const flags = rec.completedFlags ?? {}
  const defByKey = new Map((rec.script.flags ?? []).map((f) => [f.key, f]))
  return Object.entries(flags).map(([k, v]) => {
    const def = defByKey.get(k)
    const meaning = def?.values && typeof v === 'string' ? def.values[v] : undefined
    return `${def?.description ?? k}：${meaning ?? String(v)}`
  })
}

/** §23 副本库: browse saved campaigns + replay one from its start, and收藏 the active/just-finished one. */
export function DungeonPanel() {
  const [dungeons, setDungeons] = useState<DungeonRecord[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const activeScriptId = useGame((s) => s.gameState?.activeScriptId)
  const completion = useGame((s) => s.scriptCompletion)
  const enterDungeon = useGame((s) => s.enterDungeon)
  const saveActiveAsDungeon = useGame((s) => s.saveActiveAsDungeon)

  const refresh = async () =>
    setDungeons((await dungeonsRepo.all()).sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
  useEffect(() => void refresh(), [])

  // The script we could save right now: the active campaign, or the one that just finished.
  const saveable: ScriptDef | undefined = scriptDefFor(activeScriptId ?? completion?.scriptId)

  const onSave = async () => {
    if (!saveable) return
    setBusy(true)
    await saveActiveAsDungeon(label)
    setLabel('')
    await refresh()
    setBusy(false)
  }
  const onEnter = async (id: string) => {
    setBusy(true)
    await enterDungeon(id)
    setBusy(false)
  }
  const onDelete = async (id: string) => {
    if (!confirm('删除这个收藏的副本？')) return
    await dungeonsRepo.delete(id)
    await refresh()
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span>副本库</span>
        <span>{dungeons.length} 个收藏</span>
      </div>

      {saveable && (
        <div className="quest-card">
          <div className="quest-title">收藏当前剧本</div>
          <div className="quest-lore">「{saveable.title}」体验不错？存成可重玩的副本。</div>
          <div className="dungeon-save-row">
            <input
              className="input"
              placeholder={saveable.title}
              value={label}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy} onClick={() => void onSave()}>
              收藏为副本
            </button>
          </div>
        </div>
      )}

      {dungeons.length === 0 ? (
        <div className="gear-empty">还没有收藏的副本。通关一个剧本后，就能把它存成可重玩的副本。</div>
      ) : (
        <ul className="dungeon-list">
          {dungeons.map((d) => (
            <li key={d.id} className="dungeon-card">
              <div className="dungeon-card-head">
                <span className="dungeon-label">{d.label}</span>
                <span className="dungeon-date">{d.savedAt.slice(0, 10)}</span>
              </div>
              <div className="dungeon-synopsis">{d.script.synopsis}</div>
              {flagSummary(d).length > 0 && (
                <div className="dungeon-flags">
                  {flagSummary(d).map((f, i) => (
                    <span key={i} className="dungeon-flag">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <div className="dungeon-actions">
                <button className="btn btn-primary" disabled={busy} onClick={() => void onEnter(d.id)}>
                  进入 / 重玩
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => void onDelete(d.id)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
