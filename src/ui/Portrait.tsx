import { useState } from 'react'
import { coerceExpression } from '../companion/expressions'
import type { ExpressionKey } from '../domain/types'

// Loads a real portrait from /public/portraits/{portraitSet}_{expression}.png and falls
// back to an emoji placeholder if the file isn't there yet — so art can be dropped in
// incrementally. Expression is coerced to the 8 CORE keys, so only 8 files per character
// are needed (extended expressions map to the nearest core one).
//
// `head`: face-shot mode for small avatars (chat switcher). Prefers a pre-cropped head square
// at /portraits/heads/{set}.png, then the full expression portrait, then emoji — so a missing
// head crop degrades to the existing behaviour rather than a blank.

const EMOJI: Record<ExpressionKey, string> = {
  neutral: '😐', smile: '🙂', happy: '😄', blush: '😊', sad: '😢', worried: '😟',
  angry: '😠', determined: '😤', disdain: '😒', sly: '😏', surprised: '😲', thinking: '🤔', heartthrob: '😍', tired: '😪',
}

export function Portrait({
  portraitSet,
  expression,
  name,
  head = false,
}: {
  portraitSet: string
  expression: ExpressionKey
  name: string
  head?: boolean
}) {
  const expr = coerceExpression(expression) // → one of the 8 core keys
  // Ordered source candidates; first one not-yet-failed wins, else emoji.
  const candidates = head
    ? [`/portraits/heads/${portraitSet}.png`, `/portraits/${portraitSet}_${expr}.png`]
    : [`/portraits/${portraitSet}_${expr}.png`]
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const src = candidates.find((c) => !failed.has(c))

  return (
    <div className="portrait" title={`${name} · ${expr}`}>
      {src ? (
        <img
          className="portrait-img"
          src={src}
          alt={name}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((prev) => new Set(prev).add(src))}
        />
      ) : (
        <span className="portrait-emoji">{EMOJI[expression] ?? '🙂'}</span>
      )}
      <span className="portrait-name">{name}</span>
    </div>
  )
}
