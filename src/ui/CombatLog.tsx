import { useState } from 'react'
import dayjs from 'dayjs'
import { useGame } from '../state/gameStore'

export function CombatLog() {
  const log = useGame((s) => s.gameState?.combatLog ?? [])
  const [open, setOpen] = useState(false)

  const rounds = [...log].reverse() // most recent first
  const latest = log[log.length - 1]?.lines.at(-1)

  return (
    <div className="panel combat-log">
      <button className="log-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="log-title">📜 战斗记录</span>
        {!open && latest && (
          <span className={`log-peek ${latest.tone ?? ''}`}>{latest.icon} {latest.text}</span>
        )}
        <span className="log-toggle">{log.length} · {open ? '收起 ▾' : '展开 ▸'}</span>
      </button>

      {open && (
        <div className="log-body">
          {rounds.length === 0 && (
            <div className="log-empty">还没有战斗记录。完成任务、释放技能后，这里会逐回合记录你与对手的交锋。</div>
          )}
          {rounds.map((round) => (
            <div key={round.id} className="log-round">
              <div className="log-round-head">
                <span className="log-enemy">{round.enemy}</span>
                <span className="log-time">{dayjs(round.at).format('HH:mm')}</span>
              </div>
              {round.lines.map((l, i) => (
                <div key={i} className={`log-line ${l.tone ?? ''}`}>
                  <span className="log-icon" aria-hidden>{l.icon}</span>
                  <span className="log-text">{l.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
