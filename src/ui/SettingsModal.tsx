import { useRef, useState } from 'react'
import { testKey, type AIErrorKind } from '../ai/client'
import { downloadBackup, importAll, readBackupFile, type BackupPayload } from '../data/backup'
import { estimateUsd, useSettings } from '../state/settingsStore'
import { Modal } from './Modal'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（推荐 · 性价比）' },
  { id: 'claude-fable-5', label: 'Claude Fable 5（最强 · 旗舰，费用约 Opus 两倍）' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8（强 · 复杂任务）' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（最快）' },
]

const KEY_ERR: Record<AIErrorKind, string> = {
  'no-key': '请先填写 Key',
  auth: 'Key 无效或无权限（401）',
  'rate-limit': '额度不足或请求过多（429）',
  network: '网络无法连接',
  timeout: '请求超时',
  parse: '响应异常',
  unknown: '未知错误',
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [key, setKey] = useState(settings.apiKey ?? '')
  const [model, setModel] = useState(settings.model)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'export' | 'import' | 'clear'>(null)

  const masked = key && key.length > 10 ? `${key.slice(0, 7)}…${key.slice(-4)}` : key

  const save = async () => {
    await update({ apiKey: key.trim() || undefined, model })
    onClose()
  }
  const clear = async () => {
    setKey('')
    await update({ apiKey: undefined })
    setStatus(null)
  }
  const test = async () => {
    setTesting(true)
    setStatus(null)
    const kind = await testKey(key.trim(), model)
    setTesting(false)
    setStatus(kind === null ? { ok: true, msg: '连接成功，可以聊天了！' } : { ok: false, msg: KEY_ERR[kind] })
  }

  const exportSave = async () => {
    setBusy('export')
    try {
      await downloadBackup()
    } catch (err) {
      alert('导出失败：' + (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    if (!confirm('导入会用该文件覆盖当前全部本地数据，确定继续？')) return
    setBusy('import')
    try {
      const { records } = await importAll(await readBackupFile(file))
      alert(`导入成功（${records} 条记录），即将重新载入…`)
      window.location.reload()
    } catch (err) {
      alert('导入失败：' + (err as Error).message)
      setBusy(null)
    }
  }

  const clearAll = async () => {
    if (!confirm('这会清空本机的角色、进度、待办、日记等全部数据。\n点「确定」后会先自动下载一份备份，再清空。')) return
    setBusy('clear')
    try {
      await downloadBackup() // safety net: always back up before wiping
      const empty: BackupPayload = {
        app: 'fantasy-traveler', dbVersion: 4, exportedAt: new Date().toISOString(),
        characters: [], todos: [], journalEntries: [], calendarEvents: [], affinity: [],
        chatThreads: [], chatMessages: [], quests: [], habits: [], dungeons: [], gameState: null, settings: null, meta: null,
      }
      await importAll(empty)
      window.location.reload()
    } catch (err) {
      alert('清空失败：' + (err as Error).message)
      setBusy(null)
    }
  }

  return (
    <Modal label="设置" onClose={onClose}>
        <h2>设置</h2>
        <p className="sub">填入你的 Anthropic API Key，即可和伙伴进行真实对话。</p>

        <div className="field">
          <label htmlFor="setting-apikey">Anthropic API Key</label>
          <input
            id="setting-apikey"
            className="input"
            type="password"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {key && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>当前：{masked}</div>}
          {status && <div className={`key-status ${status.ok ? 'ok' : 'err'}`}>{status.msg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={test} disabled={testing || !key.trim()}>
              {testing ? '测试中…' : '测试连接'}
            </button>
            {settings.apiKey && (
              <button className="btn btn-ghost" onClick={clear}>
                清除 Key
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="setting-model">模型</label>
          <select id="setting-model" className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="setting-depth">战斗深度</label>
          <select
            id="setting-depth"
            className="select"
            value={settings.combatDepth ?? 'simple'}
            onChange={(e) => void update({ combatDepth: e.target.value as 'simple' | 'deep' })}
          >
            <option value="simple">简单 · 专注任务，无需研究数值（推荐）</option>
            <option value="deep">深度 · 显示全属性、敌人弱点与蓄力情报</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            两种模式下战斗规则完全相同——深度模式只是把弱点克制、五行、命中暴击等情报亮出来，
            供喜欢钻研的玩家针对性搭配；不开也完全不影响通关。
          </div>
        </div>

        <div className="field">
          <label className="setting-toggle-label" htmlFor="setting-auto-tactics">
            <input
              id="setting-auto-tactics"
              type="checkbox"
              className="setting-toggle-cb"
              checked={settings.autoTactics ?? true}
              onChange={(e) => void update({ autoTactics: e.target.checked })}
            />
            <span>智能自动战术</span>
          </label>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            自动战斗时伙伴会自行治疗/净化/防御/抓住敌人睡眠的空档
          </div>
        </div>

        <div className="field">
          <label className="setting-toggle-label" htmlFor="setting-battle-fx">
            <input
              id="setting-battle-fx"
              type="checkbox"
              className="setting-toggle-cb"
              checked={settings.battleFx !== false}
              onChange={(e) => void update({ battleFx: e.target.checked })}
            />
            <span>战斗特效</span>
          </label>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            打击粒子、屏幕震动与闪光。低配设备或不想被打扰时可关闭；系统「减少动态效果」设置始终优先。
          </div>
        </div>

        <div className="field">
          <label htmlFor="setting-sfx-volume">音效音量（{settings.sfxVolume ?? 70}）</label>
          <input
            id="setting-sfx-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.sfxVolume ?? 70}
            onChange={(e) => void update({ sfxVolume: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            像素风合成音效（命中/会心/治疗/胜利……）。调到 0 即静音。
          </div>
        </div>

        {settings.tokenUsage && (
          <div className="field">
            <label>用量统计（自 {settings.tokenUsage.since.slice(0, 10)} 起）</label>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
              输入 {(settings.tokenUsage.input / 1000).toFixed(1)}k · 输出 {(settings.tokenUsage.output / 1000).toFixed(1)}k ·
              缓存命中 {(settings.tokenUsage.cacheRead / 1000).toFixed(1)}k tokens
              <br />
              估算花费 ≈ ${estimateUsd(settings.tokenUsage, settings.model).toFixed(3)}（按当前所选模型单价粗估）
              <button
                className="btn btn-ghost"
                style={{ padding: '1px 8px', marginLeft: 8 }}
                onClick={() => void update({ tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, since: new Date().toISOString() } })}
              >
                清零
              </button>
            </div>
          </div>
        )}

        <p className="disclosure">
          🔒 你的 Key 只保存在本机浏览器（IndexedDB），不会上传到任何服务器；对话直接从你的浏览器发往
          Anthropic。这适合个人测试使用。
        </p>

        <div className="field" style={{ borderTop: '2px solid var(--outline)', paddingTop: 16, marginTop: 8 }}>
          <label>存档备份</label>
          <div style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
            游戏数据只存在本机浏览器。建议定期导出备份——换设备、清缓存或升级前尤其要先导出。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" onClick={exportSave} disabled={busy !== null}>
              {busy === 'export' ? '导出中…' : '⬇ 导出存档'}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === 'import' ? '导入中…' : '⬆ 导入存档'}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onPickFile} />
          </div>
          {/* Destructive action lives in its own separated danger zone, not inline with the benign
              backup buttons — distinct red framing + warning so it can't be misclicked for 导出/导入. */}
          <div className="danger-zone">
            <button
              className="btn btn-danger"
              onClick={clearAll}
              disabled={busy !== null}
              aria-label="清空全部本机数据（会先自动下载备份，操作不可撤销）"
            >
              {busy === 'clear' ? '处理中…' : '⚠ 清空数据'}
            </button>
            <span className="danger-note">会先自动下载一份备份，再清空本机全部数据 —— 不可撤销。</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save}>
            保存
          </button>
        </div>
    </Modal>
  )
}
