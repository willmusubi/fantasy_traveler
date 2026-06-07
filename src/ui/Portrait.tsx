import { useState } from 'react'
import { coerceExpression } from '../companion/expressions'
import type { ExpressionKey } from '../domain/types'

// Loads a real portrait from /public/portraits/{portraitSet}_{expression}.png and falls
// back to an emoji placeholder if the file isn't there yet — so art can be dropped in
// incrementally. Expression is coerced to the 8 CORE keys, so only 8 files per character
// are needed (extended expressions map to the nearest core one).

const EMOJI: Record<ExpressionKey, string> = {
  neutral: '😐', smile: '🙂', happy: '😄', blush: '😊', sad: '😢', worried: '😟',
  angry: '😠', determined: '😤', disdain: '😒', sly: '😏', surprised: '😲', thinking: '🤔', heartthrob: '😍', tired: '😪',
}

export function Portrait({
  portraitSet,
  expression,
  name,
}: {
  portraitSet: string
  expression: ExpressionKey
  name: string
}) {
  const expr = coerceExpression(expression) // → one of the 8 core keys
  const src = `/portraits/${portraitSet}_${expr}.png`
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const showImg = !failed.has(src)

  return (
    <div className="portrait" title={`${name} · ${expr}`}>
      {showImg ? (
        <img
          className="portrait-img"
          src={src}
          alt={name}
          draggable={false}
          onError={() => setFailed((prev) => new Set(prev).add(src))}
        />
      ) : (
        <span className="portrait-emoji">{EMOJI[expression] ?? '🙂'}</span>
      )}
      <span className="portrait-name">{name}</span>
    </div>
  )
}
