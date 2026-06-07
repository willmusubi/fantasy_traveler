import { useEffect } from 'react'
import { useGame } from '../state/gameStore'

export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  const removeToast = useGame((s) => s.removeToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => setTimeout(() => removeToast(t.id), 4200))
    return () => timers.forEach(clearTimeout)
  }, [toasts, removeToast])

  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => removeToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
