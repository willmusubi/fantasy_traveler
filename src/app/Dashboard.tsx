import { useEffect, useState } from 'react'
import { playBgm, setBgmVolume, stopBgm } from '../audio/bgm'
import { selectPlayer, useGame } from '../state/gameStore'
import { useSettings } from '../state/settingsStore'
import { useTodos } from '../state/todoStore'
import { BuffChoiceModal } from '../ui/BuffChoiceModal'
import { ChatPanel } from '../ui/ChatPanel'
import { ChatSwitcher } from '../ui/ChatSwitcher'
import { CombatLog } from '../ui/CombatLog'
import { DungeonPanel } from '../ui/DungeonPanel'
import { EquipmentPanel } from '../ui/EquipmentPanel'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { HabitPanel } from '../ui/HabitPanel'
import { MonsterHUD } from '../ui/MonsterHUD'
import { PartyPanel } from '../ui/PartyPanel'
import { ProductivityView } from '../ui/ProductivityView'
import { QuestBoard } from '../ui/QuestBoard'
import { RealityQuestPanel } from '../ui/RealityQuestPanel'
import { ReactionPopup } from '../ui/ReactionPopup'
import { RecruitModal } from '../ui/RecruitModal'
import { SaveSlotsModal } from '../ui/SaveSlotsModal'
import { ScriptChoiceModal } from '../ui/ScriptChoiceModal'
import { ScriptCompleteModal } from '../ui/ScriptCompleteModal'
import { SettingsModal } from '../ui/SettingsModal'
import { ShopPanel } from '../ui/ShopPanel'
import { TodoPanel } from '../ui/TodoPanel'
import { Toasts } from '../ui/Toasts'
import { VictoryBanner } from '../ui/VictoryBanner'

type RightView = 'home' | 'quest' | 'dungeon' | 'reality' | 'party' | 'gear' | 'shop'
type Zone = 'adventure' | 'calendar'

export function Dashboard() {
  const player = useGame(selectPlayer)
  const gold = useGame((s) => s.gameState?.gold ?? 0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savesOpen, setSavesOpen] = useState(false)
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

  // One shared heartbeat for ALL armed todo countdowns: fire any that just expired in real time
  // (no waiting for the boot/focus sweep). A single interval, not per-row; sweepTimers early-returns
  // when nothing is armed. The live MM:SS digits are re-rendered by each armed row itself.
  useEffect(() => {
    const h = window.setInterval(() => void useTodos.getState().sweepTimers(), 1000)
    return () => window.clearInterval(h)
  }, [])

  // §30 chiptune BGM: track follows the scene — calendar zone is SILENT by design (效率优先),
  // adventure idles softly, a script-driven quest with a phased boss goes tense. Defaults OFF
  // (bgmVolume 0); the settings slider opts in. AudioContext unlocks on the first interaction.
  const bgmVolume = useSettings((s) => s.settings.bgmVolume ?? 0)
  const inQuest = useGame((s) => Boolean(s.gameState?.activeQuestId))
  const bossOnField = useGame((s) => Boolean(s.gameState?.enemies.some((m) => m.hp > 0 && m.archetype === 'boss')))
  useEffect(() => {
    setBgmVolume(bgmVolume)
  }, [bgmVolume])
  useEffect(() => {
    if (zone !== 'adventure') stopBgm()
    else playBgm(inQuest ? (bossOnField ? 'boss' : 'battle') : 'idle')
  }, [zone, inQuest, bossOnField, bgmVolume])

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
              🧭 {player.name} · 旅人 Lv.{player.stats.level}
            </span>
          )}
          {zone === 'adventure' && <span className="chip">🪙 {gold}</span>}
          <span className="topbar-tools">
            <button className="btn btn-ghost" onClick={() => setSavesOpen(true)}>
              💾 存档
            </button>
            <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
              ⚙ 设置
            </button>
          </span>
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
            <button className={view === 'home' ? 'on' : ''} onClick={() => setView('home')}>聊天</button>
            <button className={view === 'quest' ? 'on' : ''} onClick={() => setView('quest')}>副本</button>
            <button className={view === 'dungeon' ? 'on' : ''} onClick={() => setView('dungeon')}>副本库</button>
            <button className={view === 'reality' ? 'on' : ''} onClick={() => setView('reality')}>现实任务</button>
            <button className={view === 'party' ? 'on' : ''} onClick={() => setView('party')}>队伍</button>
            <button className={view === 'gear' ? 'on' : ''} onClick={() => setView('gear')}>装备</button>
            <button className={view === 'shop' ? 'on' : ''} onClick={() => setView('shop')}>商店</button>
          </div>
          {/* Keyed by view so a crash in one tab clears when you switch away and back. */}
          <ErrorBoundary key={view} label="面板">
            {view === 'home' && (
              <>
                <ChatSwitcher />
                <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
              </>
            )}
            {view === 'quest' && <QuestBoard />}
            {view === 'dungeon' && <DungeonPanel />}
            {view === 'reality' && <RealityQuestPanel />}
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
      <ScriptChoiceModal />
      <ScriptCompleteModal />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {savesOpen && <SaveSlotsModal onClose={() => setSavesOpen(false)} />}
    </div>
  )
}
