import { COMPANION_DEFS } from '../companion/roster'
import { t } from '../i18n'
import { useGame } from '../state/gameStore'
import { useQuest } from '../state/questStore'
import { useSettings } from '../state/settingsStore'
import { EQUIPMENT_DEFS } from '../world/equipment'
import { scriptDefFor, WORLD_DEFS } from '../world/worlds'

export function QuestBoard() {
  const worldId = useGame((s) => s.gameState?.activeWorldId)
  const setWorld = useGame((s) => s.setWorld)
  const status = useQuest((s) => s.status)
  const usedFallback = useQuest((s) => s.usedFallback)
  const quest = useGame((s) => s.activeQuest)
  const startQuest = useQuest((s) => s.startQuest)
  const startScript = useQuest((s) => s.startScript)
  const completedScriptIds = useGame((s) => s.gameState?.completedScriptIds)
  const hasKey = useSettings((s) => Boolean(s.settings.apiKey))

  const worlds = Object.values(WORLD_DEFS)
  const world = worldId ? WORLD_DEFS[worldId] : undefined
  if (!world) {
    return (
      <div className="panel">
        <div className="panel-title"><span>剧情副本</span></div>
        <div className="gear-empty">尚未进入任何世界。</div>
      </div>
    )
  }

  const generating = status === 'generating'
  // §24: a world's default campaign that has already been cleared shows 已通过 instead of silently
  // relaunching; replay is an explicit choice that calls startScript directly (bypassing startQuest).
  const defaultScriptId = world.defaultScriptId
  const scriptDone = !!defaultScriptId && (completedScriptIds ?? []).includes(defaultScriptId)
  const scriptTitle = defaultScriptId ? (scriptDefFor(defaultScriptId)?.title ?? world.name) : world.name

  return (
    <div className="panel">
      <div className="panel-title">
        <span>剧情副本</span>
        <span>{world.name}{scriptDone && ' · ✓ 已通过'}</span>
      </div>

      <div className="world-picker">
        {worlds.map((w) => (
          <button
            key={w.id}
            className={`pill ${w.id === worldId ? 'on' : ''}`}
            disabled={Boolean(quest)}
            title={quest ? '完成或退出当前副本后才能切换世界' : w.tagline}
            onClick={() => void setWorld(w.id)}
          >
            {w.name}
          </button>
        ))}
        <span className="world-more">更多世界 · 敬请期待</span>
      </div>

      <div className="quest-world-tag">{world.tagline}</div>

      {!hasKey && (
        <div className="quest-note">未设置 API Key —— 将使用内置的离线剧情。设置 Key 后可让 AI 为你量身生成。</div>
      )}

      {quest ? (
        <div className="quest-card">
          <div className="quest-title">{quest.title}</div>
          <div className="quest-lore">{quest.lore}</div>
          {usedFallback && <div className="quest-note">（离线剧情）</div>}

          <div className="gear-section-label">遭遇（{quest.encounters.length}）</div>
          <ol className="quest-encounters">
            {quest.encounters.map((e) => (
              <li key={e.index}>
                <span className="quest-enemy">{e.enemyName}</span>
                <span className="quest-enemy-theme">{e.enemyTheme}</span>
              </li>
            ))}
          </ol>

          <div className="gear-section-label">通关奖励</div>
          <div className="quest-reward">
            {quest.reward.unlockCompanionIds.map((id) => (
              <span key={id} className="reward-chip recruit">★ {COMPANION_DEFS[id]?.name ?? id}</span>
            ))}
            {quest.reward.equipmentDefIds.map((id, i) => (
              <span key={`${id}-${i}`} className="reward-chip loot">◆ {t(EQUIPMENT_DEFS[id]?.nameKey ?? id)}</span>
            ))}
            {quest.reward.playerXp ? <span className="reward-chip">EXP +{quest.reward.playerXp}</span> : null}
          </div>

          <div className="quest-hint">完成现实任务，向副本中的心魔发起攻击。</div>
          <button className="btn btn-ghost" disabled={generating} onClick={() => startQuest(world.id)}>
            {generating ? '生成中…' : '重新生成'}
          </button>
        </div>
      ) : scriptDone ? (
        <div className="quest-empty">
          <p>✦ 「{scriptTitle}」已通过。这段战役你已走到结局——若想重温，可重新开始；更多剧本，敬请期待。</p>
          <button
            className="btn btn-primary"
            disabled={generating}
            onClick={() => void startScript(world.id, defaultScriptId!)}
          >
            {generating ? '正在生成剧情…' : '重新开始这段剧本'}
          </button>
        </div>
      ) : (
        <div className="quest-empty">
          <p>潜入「{world.name}」的心魔迷宫，夺回被偷走的专注。</p>
          <button className="btn btn-primary" disabled={generating} onClick={() => startQuest(world.id)}>
            {generating ? '正在生成剧情…' : '开始副本'}
          </button>
        </div>
      )}
    </div>
  )
}
