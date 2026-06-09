import { useState } from 'react'

export function FullbodyArt({
  portraitSet,
  name,
  className = '',
}: {
  portraitSet: string
  name: string
  className?: string
}) {
  const src = `/art/${portraitSet}_fullbody_v3.png`
  const [failed, setFailed] = useState(false)

  if (failed) return null

  return (
    <img
      className={`fullbody-art ${className}`.trim()}
      src={src}
      alt={name}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
