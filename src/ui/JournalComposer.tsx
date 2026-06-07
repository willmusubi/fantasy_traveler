import { useState } from 'react'
import type { Mood } from '../domain/types'
import { useJournal } from '../state/journalStore'

const MOODS: { value: Mood; label: string }[] = [
  { value: 'great', label: '很好' },
  { value: 'good', label: '不错' },
  { value: 'neutral', label: '一般' },
  { value: 'down', label: '低落' },
  { value: 'bad', label: '糟糕' },
]

const MOOD_VAR: Record<Mood, string> = {
  great: 'var(--mood-great)',
  good: 'var(--mood-good)',
  neutral: 'var(--mood-neutral)',
  down: 'var(--mood-down)',
  bad: 'var(--mood-bad)',
}

/** Authoring for one day's journal: mood + optional title + body. On save it pays the
 *  reflection reward (via the store) and surfaces the lead companion's reaction inline —
 *  the felt reward, since the game-zone CompanionCard isn't mounted here. */
export function JournalComposer({ date }: { date: string }) {
  const add = useJournal((s) => s.add)
  const [mood, setMood] = useState<Mood>('neutral')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    await add({ date, mood, title, body })
    // The companion's response surfaces in the global ReactionPopup (random reactor + portrait).
    setTitle('')
    setBody('')
    setMood('neutral')
  }

  return (
    <form className="composer" onSubmit={save}>
      <div className="mood-row" role="radiogroup" aria-label="今天的心情">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            className={`mood-chip ${mood === m.value ? 'on' : ''}`}
            onClick={() => setMood(m.value)}
          >
            <span className="mood-dot" style={{ background: MOOD_VAR[m.value] }} />
            {m.label}
          </button>
        ))}
      </div>
      <input className="input" placeholder="标题（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="textarea j-textarea"
        placeholder="写下这一天…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="composer-actions">
        <button className="btn btn-primary" type="submit" disabled={!body.trim()}>
          保存日记
        </button>
      </div>
    </form>
  )
}
