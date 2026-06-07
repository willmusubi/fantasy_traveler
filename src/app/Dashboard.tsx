import { useEffect, useState } from 'react'
import { selectPlayer, useGame } from '../state/gameStore'
import { BuffChoiceModal } from '../ui/BuffChoiceModal'
import { ChatPanel } from '../ui/ChatPanel'
import { CombatLog } from '../ui/CombatLog'
import { CompanionCard } from '../ui/CompanionCard'
import { EquipmentPanel } from '../ui/EquipmentPanel'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { HabitPanel } from '../ui/HabitPanel'
import { MonsterHUD } from '../ui/MonsterHUD'
import { PartyPanel } from '../ui/PartyPanel'
import { ProductivityView } from '../ui/ProductivityView'
import { QuestBoard } from '../ui/QuestBoard'
import { ReactionPopup } from '../ui/ReactionPopup'
import { RecruitModal } from '../ui/RecruitModal'
import { SettingsModal } from '../ui/SettingsModal'
import { ShopPanel } from '../ui/ShopPanel'
import { TodoPanel } from '../ui/TodoPanel'
import { Toasts } from '../ui/Toasts'
import { VictoryBanner } from '../ui/VictoryBanner'
import { t } from '../i18n'

type RightView = 'home' | 'quest' | 'party' | 'gear' | 'shop'
type Zone = 'adventure' | 'calendar'

export function Dashboard() {
  const player = useGame(selectPlayer)
  const gold = useGame((s) => s.gameState?.gold ?? 0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<RightView>('home')
  // Top-level separation: the game/combat zone vs. the personal-productivity zone (§21).
  const [zone, setZone] = useState<Zone>('adventure')

  // Interactive (FF-style) step-through is the adventure zone's default — the TurnPicker lives in the
  // battle HUD. Outside it (calendar) or in tests/headless, completion falls back to synchronous
  // whole-round resolution. Switching away from a round mid-step auto-resolves it with defaults.
  useEffect(() => {
    const g = useGame.getState()
    g.setSteppingEnabled(zone === 'adventure')
    if (zone !== 'adventure' && g.gameState?.activeRound) void g.autoResolveRound()
  }, [zone])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          幻想旅人 <small>Fantasy Traveler</small>
        </div>
        <nav className="zone-switch" role="tablist" aria-label="区域切换">
          <button role="tab" aria-selected={zone === 'adventure'} className={zone === 'adventure' ? 'on' : ''} onClick={() => setZone('adventure')}>
            ⚔ 冒险
          </button>
          <button role="tab" aria-selected={zone === 'calendar'} className={zone === 'calendar' ? 'on' : ''} onClick={() => setZone('calendar')}>
            📅 日历
          </button>
        </nav>
        <div className="topbar-actions">
          {zone === 'adventure' && player && (
            <span className="chip">
              🧭 {player.name} · {t(`class.${player.classId}`)} Lv.{player.stats.level}
            </span>
          )}
          {zone === 'adventure' && <span className="chip">🪙 {gold}</span>}
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ 设置
          </button>
        </div>
      </header>

      {zone === 'adventure' ? (
      <main className="dashboard">
        <ErrorBoundary label="战斗">
          <MonsterHUD />
        </ErrorBoundary>
        <ErrorBoundary label="战斗记录">
          <CombatLog />
        </ErrorBoundary>
        <div className="col">
          <ErrorBoundary label="今日待办">
            <TodoPanel />
          </ErrorBoundary>
          <ErrorBoundary label="习惯养成">
            <HabitPanel />
          </ErrorBoundary>
        </div>
        <div className="col">
          <div className="tabbar">
            <button className={view === 'home' ? 'on' : ''} onClick={() => setView('home')}>伙伴</button>
            <button className={view === 'quest' ? 'on' : ''} onClick={() => setView('quest')}>副本</button>
            <button className={view === 'party' ? 'on' : ''} onClick={() => setView('party')}>队伍</button>
            <button className={view === 'gear' ? 'on' : ''} onClick={() => setView('gear')}>装备</button>
            <button className={view === 'shop' ? 'on' : ''} onClick={() => setView('shop')}>商店</button>
          </div>
          {/* Keyed by view so a crash in one tab clears when you switch away and back. */}
          <ErrorBoundary key={view} label="面板">
            {view === 'home' && (
              <>
                <CompanionCard />
                <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
              </>
            )}
            {view === 'quest' && <QuestBoard />}
            {view === 'party' && <PartyPanel />}
            {view === 'gear' && <EquipmentPanel />}
            {view === 'shop' && <ShopPanel />}
          </ErrorBoundary>
        </div>
      </main>
      ) : (
        <ProductivityView />
      )}

      <Toasts />
      <ReactionPopup />
      <VictoryBanner />
      <RecruitModal />
      <BuffChoiceModal />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
