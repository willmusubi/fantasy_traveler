import { useRef, useState } from 'react'
import { importAll, readBackupFile } from '../data/backup'
import { CLASS_DEFS } from '../domain/config'
import type { ClassId } from '../domain/types'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'

const CLASS_ORDER: ClassId[] = ['vanguard', 'guardian', 'striker', 'arcanist', 'tactician', 'medic']

export function Onboarding() {
  const seedNewGame = useGame((s) => s.seedNewGame)
  const [name, setName] = useState('')
  const [classId, setClassId] = useState<ClassId>('vanguard')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const start = async () => {
    setBusy(true)
    await seedNewGame(name, classId)
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

        <div className="field">
          <label>选择职业（可随时更改）</label>
          <div className="class-grid">
            {CLASS_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`class-card ${classId === id ? 'selected' : ''}`}
                onClick={() => setClassId(id)}
              >
                <div className="cc-name">
                  {t(`class.${id}`)} <span style={{ color: 'var(--muted)' }}>· {CLASS_DEFS[id].role}</span>
                </div>
                <div className="cc-blurb">{t(`class.${id}.blurb`)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy} onClick={start}>
            {busy ? '进入中…' : '开始冒险'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-ghost"
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
