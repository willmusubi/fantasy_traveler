import { useRef, useState } from 'react'
import { importAll, readBackupFile } from '../data/backup'
import { useGame } from '../state/gameStore'

export function Onboarding() {
  const seedNewGame = useGame((s) => s.seedNewGame)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const start = async () => {
    setBusy(true)
    await seedNewGame(name)
  }

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const { records } = await importAll(await readBackupFile(file))
      alert(`已从备份恢复 ${records} 条记录，即将载入…`)
      window.location.reload()
    } catch (err) {
      alert('导入失败：' + (err as Error).message)
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>开始你的幻想旅程</h2>
        <p className="sub">
          创建你的角色。你在现实里完成的每一件事，都会让「你」成长，并和伙伴一同击退拖延心魔。
        </p>

        <div className="field">
          <label>你的名字</label>
          <input
            className="input"
            placeholder="旅人"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="onboard-actions">
          <button className="btn btn-primary onboard-start" disabled={busy} onClick={start}>
            {busy ? '进入中…' : '开始冒险'}
          </button>
          <button
            type="button"
            className="onboard-import"
            disabled={busy || importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? '恢复中…' : '已有备份？导入存档恢复'}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onImport} />
        </div>
      </div>
    </div>
  )
}
