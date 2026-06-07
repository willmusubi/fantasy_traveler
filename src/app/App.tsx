import { useEffect, useState } from 'react'
import { useChat } from '../state/chatStore'
import { useGame } from '../state/gameStore'
import { useHabits } from '../state/habitStore'
import { useJournal } from '../state/journalStore'
import { useSettings } from '../state/settingsStore'
import { useTodos } from '../state/todoStore'
import { Dashboard } from './Dashboard'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Onboarding } from '../ui/Onboarding'

export function App() {
  const [booted, setBooted] = useState(false)
  const [bootStuck, setBootStuck] = useState(false)
  const gameState = useGame((s) => s.gameState)

  useEffect(() => {
    let cancelled = false
    // Watchdog: a blocked IndexedDB upgrade (another tab open on an older DB version) or a
    // failed hydrate would otherwise hang boot forever on "加载中". Surface a recovery screen.
    // If the blocking tab is later closed the pending upgrade resolves and boot finishes on its
    // own, so we don't tear anything down here.
    const watchdog = setTimeout(() => {
      if (!cancelled) setBootStuck(true)
    }, 5000)
    void (async () => {
      try {
        await useSettings.getState().hydrate()
        await useGame.getState().hydrate()
        await useTodos.getState().hydrate()
        await useHabits.getState().hydrate()
        await useJournal.getState().hydrate()
        await useChat.getState().hydrate()
      } catch (e) {
        console.error('[boot] hydrate failed', e)
        return // leave the watchdog to show the recovery screen
      }
      if (cancelled) return
      clearTimeout(watchdog)
      setBootStuck(false)
      setBooted(true)
      // Overdue + habit-streak sweeps run on load (and on tab focus) — only once a game exists.
      if (useGame.getState().gameState) {
        await useTodos.getState().sweepOverdue()
        await useTodos.getState().sweepTimers() // fire any countdowns that expired while away
        await useHabits.getState().sweepHabits()
      }
    })()

    const onVisible = () => {
      if (document.visibilityState === 'visible' && useGame.getState().gameState) {
        void useTodos.getState().sweepOverdue()
        void useTodos.getState().sweepTimers()
        void useHabits.getState().sweepHabits()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!booted) {
    if (bootStuck) {
      return (
        <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', color: '#cdd3f0', lineHeight: 1.85 }}>
            <div style={{ fontSize: 18, color: '#f4c64e', marginBottom: 12 }}>启动卡住了</div>
            <p>本应用很可能在<strong>另一个浏览器标签页</strong>里还开着，占用着旧版本的本地数据库、挡住了升级。</p>
            <p style={{ color: '#9b91b8', fontSize: 13 }}>
              请关闭本站的其他标签页（或整个浏览器窗口）后重试。仍不行的话，可在开发者工具 Application → IndexedDB
              删除 <code>fantasy-traveler</code> 再刷新（会清空本地存档）。
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
              重试
            </button>
          </div>
        </main>
      )
    }
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#9b91b8' }}>
        加载中…
      </main>
    )
  }

  return (
    <ErrorBoundary label="幻想旅人">
      {!gameState ? <Onboarding /> : <Dashboard />}
    </ErrorBoundary>
  )
}
