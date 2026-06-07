import { useEffect, useState } from 'react'
import type { VictorySummary } from '../state/gameStore'
import { useGame } from '../state/gameStore'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

/** Count a number up from 0 with ease-out; jumps straight to the value if motion is reduced. */
function useCountUp(target: number): number {
  const [val, setVal] = useState(() => (prefersReducedMotion() || target <= 0 ? target : 0))
  useEffect(() => {
    if (prefersReducedMotion() || target <= 0) {
      setVal(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const dur = 700
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 4))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return val
}

/** The Final-Fantasy-style "battle results" window shown when an enemy is defeated. */
export function VictoryBanner() {
  const summary = useGame((s) => s.victorySummary)
  const clearVictory = useGame((s) => s.clearVictory)

  useEffect(() => {
    if (!summary) return
    const id = setTimeout(clearVictory, 6000) // ceremonial, but never traps the player
    return () => clearTimeout(id)
  }, [summary, clearVictory])

  if (!summary) return null
  // Re-key per victory so the count-up animation restarts each time.
  return <VictoryWindow key={summary.key} summary={summary} onClose={clearVictory} />
}

function VictoryWindow({ summary, onClose }: { summary: VictorySummary; onClose: () => void }) {
  const xp = useCountUp(summary.xp)
  const gold = useCountUp(summary.gold)

  return (
    <div className="victory-overlay" onClick={onClose}>
      <div className="victory-window" role="dialog" aria-label="战斗结算" onClick={(e) => e.stopPropagation()}>
        <div className="victory-fanfare">战斗胜利</div>
        <div className="victory-enemy">击败了 {summary.enemy}</div>
        {summary.questComplete && <div className="victory-quest">★ 副本通关 ★</div>}

        <div className="victory-rolls">
          <div className="victory-roll">
            <span className="vr-label">经验</span>
            <span className="vr-value">+{xp}</span>
          </div>
          <div className="victory-roll roll-gold">
            <span className="vr-label">金币</span>
            <span className="vr-value gold">+{gold}</span>
          </div>
        </div>

        {summary.levelUps.length > 0 && (
          <div className="victory-levels">
            {summary.levelUps.map((l) => (
              <span key={l.name} className="victory-level">⭐ {l.name} 升至 Lv.{l.level}</span>
            ))}
          </div>
        )}
        {summary.loot.length > 0 && <div className="victory-drop loot">◆ 战利品：{summary.loot.join('、')}</div>}
        {summary.recruits.length > 0 && <div className="victory-drop recruit">★ 新伙伴：{summary.recruits.join('、')}</div>}
        {summary.narration && <div className="victory-narration">{summary.narration}</div>}
        {summary.nextEnemy && <div className="victory-next">下一个对手：{summary.nextEnemy}</div>}

        <button className="btn btn-primary victory-continue" onClick={onClose}>
          继续 ▸
        </button>
      </div>
    </div>
  )
}
