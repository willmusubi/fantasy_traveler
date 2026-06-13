import { FormEvent, useEffect, useState } from 'react'
import { t } from '../i18n'
import { FANTASY_TRAVELER_MILESTONES, useReality } from '../state/realityStore'
import { EQUIPMENT_DEFS } from '../world/equipment'

function formatObservedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function RealityQuestPanel() {
  const allQuests = useReality((state) => state.quests)
  const quests = FANTASY_TRAVELER_MILESTONES
    .map((milestone) => allQuests.find((item) => item.id === milestone.id))
    .filter((quest): quest is NonNullable<typeof quest> => Boolean(quest))
  const quest = quests[0]
  const checking = useReality((state) => Boolean(state.checkingId))
  const error = useReality((state) => state.error)
  const saveFantasyTravelerSeries = useReality((state) => state.saveFantasyTravelerSeries)
  const verify = useReality((state) => state.verify)
  const [input, setInput] = useState('')

  useEffect(() => {
    if (quest) setInput(quest.sourceRef)
  }, [quest?.sourceRef])

  const latest = quest?.evidence[quest.evidence.length - 1]
  const value = latest?.value ?? 0
  const finalThreshold = FANTASY_TRAVELER_MILESTONES[FANTASY_TRAVELER_MILESTONES.length - 1].threshold
  const progress = quest ? Math.min(100, Math.round((value / finalThreshold) * 100)) : 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void saveFantasyTravelerSeries(input)
  }

  return (
    <div className="panel reality-panel">
      <div className="panel-title">
        <span>现实任务</span>
        {quest && <span className={`reality-status ${quests.every((item) => item.status === 'settled') ? 'settled' : 'active'}`}>
          {quests.every((item) => item.status === 'settled') ? '全部解锁' : '联动进行中'}
        </span>}
      </div>

      <div className="reality-intro">
        Fantasy Traveler 参赛系列获得的每一枚币，都会在游戏里留下痕迹。
      </div>

      <form className="reality-source-form" onSubmit={submit}>
        <label htmlFor="reality-bvid">合集中的任意视频</label>
        <div className="reality-source-row">
          <input
            id="reality-bvid"
            className="input"
            placeholder="粘贴视频链接或 BV号"
            value={input}
            disabled={quests.some((item) => item.status === 'settled')}
            onChange={(event) => setInput(event.target.value)}
          />
          <button className="btn" type="submit" disabled={!input.trim() || quests.some((item) => item.status === 'settled')}>
            保存参赛系列
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {quest ? (
        <div className="reality-card">
          <div className="reality-card-head">
            <div>
              <div className="reality-quest-title">{latest?.title ?? 'Fantasy Traveler 参赛系列'}</div>
              <a href={latest?.sourceUrl ?? `https://www.bilibili.com/video/${quest.sourceRef}`} target="_blank" rel="noreferrer">{quest.sourceRef}</a>
            </div>
            <div className="reality-reward">{latest?.videoCount ? `共 ${latest.videoCount} 条视频` : '等待发现合集'}</div>
          </div>

          <div className="reality-progress-label">
            <strong>合集累计投币：{value}</strong>
            <span>{latest ? `最近验证 ${formatObservedAt(latest.observedAt)}` : '尚未验证'}</span>
          </div>
          <div className="reality-progress" aria-label={`投币进度 ${progress}%`}>
            <div style={{ width: `${progress}%` }} />
          </div>

          {latest?.title && (
            <div className="reality-evidence">
              <span>证据快照</span>
              <strong>{latest.title}</strong>
              {latest.ownerName && <small>UP主：{latest.ownerName}</small>}
            </div>
          )}

          <div className="reality-milestones">
            {FANTASY_TRAVELER_MILESTONES.map((milestone) => {
              const state = quests.find((item) => item.id === milestone.id)
              const def = EQUIPMENT_DEFS[milestone.rewardEquipmentDefId]
              const settled = state?.status === 'settled'
              return (
                <div key={milestone.id} className={`reality-milestone ${settled ? 'settled' : ''}`}>
                  <div className="reality-milestone-mark">{settled ? '✓' : milestone.threshold}</div>
                  <div>
                    <strong>{t(def.nameKey)}{settled ? '已获得' : def.id === 'lucky_coin' ? '等待显灵' : '等待众筹'}</strong>
                    <span>{milestone.threshold} 币奖励 · {def.description}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            className="btn btn-primary reality-verify"
            disabled={checking}
            onClick={() => void verify(quest.id)}
          >
            {checking ? '正在读取 B 站证据…' : '验证现实结果'}
          </button>
        </div>
      ) : (
        <div className="reality-empty">粘贴合集中的任意视频，系统会自动发现同合集视频并累计投币，不需要 B 站登录或 Cookie。</div>
      )}
    </div>
  )
}
