import { useEffect, useState } from 'react'
import type { SaveSlot } from '../domain/types'
import { createSave, defaultSaveName, deleteSave, renameSave, restoreSave, savesRepo } from '../data/saves'
import { Modal } from './Modal'

const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function SaveSlotsModal({ onClose }: { onClose: () => void }) {
  const [slots, setSlots] = useState<SaveSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // slot id / 'create' while an op runs
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const refresh = async () => setSlots(await savesRepo.list())
  useEffect(() => {
    void (async () => {
      await refresh()
      setLoading(false)
    })()
  }, [])

  const beginCreate = () => {
    setNewName(defaultSaveName(new Date().toISOString()))
    setCreating(true)
  }
  const confirmCreate = async () => {
    setBusy('create')
    try {
      await createSave(newName)
      setCreating(false)
      setNewName('')
      await refresh()
    } catch (err) {
      alert('存档失败：' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onRestore = async (slot: SaveSlot) => {
    if (!confirm(`读取「${slot.name}」会用这份存档覆盖当前的全部进度，确定？`)) return
    setBusy(slot.id)
    try {
      await restoreSave(slot.id)
      alert('读取成功，即将重新载入…')
      window.location.reload()
    } catch (err) {
      alert('读取失败：' + (err as Error).message)
      setBusy(null)
    }
  }

  const onDelete = async (slot: SaveSlot) => {
    if (!confirm(`删除存档「${slot.name}」？此操作不可撤销。`)) return
    setBusy(slot.id)
    try {
      await deleteSave(slot.id)
      await refresh()
    } catch (err) {
      alert('删除失败：' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const beginRename = (slot: SaveSlot) => {
    setEditingId(slot.id)
    setEditName(slot.name)
  }
  const confirmRename = async (id: string) => {
    setBusy(id)
    try {
      await renameSave(id, editName)
      setEditingId(null)
      await refresh()
    } catch (err) {
      alert('改名失败：' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const anyBusy = busy !== null

  return (
    <Modal label="存档" onClose={onClose}>
        <h2>存档槽</h2>
        <p className="sub">在剧情节点前存一格，录完一条分支后随时读回来重录。存档只存在本机浏览器。</p>

        {/* 新建存档 */}
        <div className="field" style={{ marginBottom: 14 }}>
          {creating ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                autoFocus
                value={newName}
                placeholder="存档名"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmCreate()
                  if (e.key === 'Escape') setCreating(false)
                }}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={confirmCreate} disabled={anyBusy}>
                {busy === 'create' ? '存档中…' : '保存'}
              </button>
              <button className="btn btn-ghost" onClick={() => setCreating(false)} disabled={anyBusy}>
                取消
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={beginCreate} disabled={anyBusy} style={{ width: '100%' }}>
              ＋ 新建存档
            </button>
          )}
        </div>

        {/* 存档列表 */}
        <div style={{ maxHeight: '46vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>加载中…</div>
          ) : slots.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0', lineHeight: 1.7 }}>
              还没有存档。点上面「新建存档」把当前进度存成第一格。
            </div>
          ) : (
            slots.map((slot) => (
              <div
                key={slot.id}
                style={{
                  border: '1px solid var(--outline)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: 'rgba(40, 53, 112, 0.25)',
                }}
              >
                {editingId === slot.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void confirmRename(slot.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={() => confirmRename(slot.id)} disabled={anyBusy}>
                      确定
                    </button>
                    <button className="btn btn-ghost" onClick={() => setEditingId(null)} disabled={anyBusy}>
                      取消
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📁 {slot.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {fmtTime(slot.savedAt)} · {fmtSize(slot.bytes)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-primary" onClick={() => onRestore(slot)} disabled={anyBusy}>
                        {busy === slot.id ? '…' : '读取'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => beginRename(slot)} disabled={anyBusy}>
                        改名
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => onDelete(slot)}
                        disabled={anyBusy}
                        style={{ color: 'var(--hp)' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
    </Modal>
  )
}
