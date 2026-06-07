import { COMPANION_DEFS } from '../companion/roster'
import { useGame } from '../state/gameStore'
import { Portrait } from './Portrait'

const MAX_PARTY = 6

export function RecruitModal() {
  const recruitedId = useGame((s) => s.recruitedId)
  const clearRecruited = useGame((s) => s.clearRecruited)
  const setParty = useGame((s) => s.setParty)
  const gs = useGame((s) => s.gameState)
  if (!recruitedId) return null

  const def = COMPANION_DEFS[recruitedId]
  if (!def || !gs) return null

  const inParty = gs.partyIds.includes(recruitedId)
  const partyFull = gs.partyIds.length >= MAX_PARTY

  const join = async () => {
    if (!inParty && !partyFull) {
      const player = gs.partyIds[0]
      const companions = gs.partyIds.filter((id) => id !== player)
      await setParty([...companions, recruitedId])
    }
    clearRecruited()
  }

  return (
    <div className="modal-overlay" onClick={clearRecruited}>
      <div className="modal recruit-modal" onClick={(e) => e.stopPropagation()}>
        <h2>★ 新伙伴加入！</h2>
        <div className="recruit-body">
          <Portrait portraitSet={def.portraitSet} expression={def.persona.defaultExpression} name={def.name} />
          <div className="recruit-info">
            <div className="recruit-name">{def.name}</div>
            <div className="companion-brand">专属烙印 · {def.brand}</div>
            <p className="recruit-blurb">{def.bio}</p>
          </div>
        </div>
        <div className="recruit-meeting">
          {def.meeting.map((line, i) => (
            <p key={i} className="meeting-line">「{line}」</p>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={clearRecruited}>稍后安排</button>
          <button className="btn btn-primary" onClick={join} disabled={inParty || partyFull}>
            {inParty ? '已在队伍' : partyFull ? '队伍已满' : '加入队伍'}
          </button>
        </div>
      </div>
    </div>
  )
}
