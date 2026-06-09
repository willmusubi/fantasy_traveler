import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Shared accessible modal shell. Renders the standard FF command-window overlay + dialog and adds
 *  the a11y the bare <div> modals were missing: role="dialog" + aria-modal, an accessible name
 *  (aria-label), Escape-to-close, a Tab focus trap, focus moved into the dialog on open, and focus
 *  restored to the trigger on close. Pass `dismissable={false}` for a forced choice (no Escape / no
 *  backdrop close, e.g. the post-boss branch) — it still traps focus and labels itself. */
export function Modal({
  children,
  onClose,
  label,
  className = '',
  dismissable = true,
}: {
  children: ReactNode
  /** Close handler — backdrop click + Escape route here when `dismissable`. */
  onClose?: () => void
  /** Accessible name announced for the dialog (e.g. "设置", "新伙伴加入"). */
  label: string
  /** Extra class on the .modal box (e.g. "recruit-modal", "plan-modal"). */
  className?: string
  dismissable?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Hold the latest onClose/dismissable in refs so the focus-management effect runs EXACTLY once per
  // open/close (deps []). If they were effect deps, the prop-drilled modals (Settings, SaveSlots,
  // DefaultActions) — whose parents pass a fresh inline onClose each render and re-render often on
  // gold/combat updates — would tear the effect down + re-run it, re-capturing an in-dialog element
  // as the focus-restore target and stealing focus out of inputs mid-typing.
  const onCloseRef = useRef(onClose)
  const dismissableRef = useRef(dismissable)
  onCloseRef.current = onClose
  dismissableRef.current = dismissable

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusablesIn = (): HTMLElement[] =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : []

    // Move focus into the dialog on open (first focusable, else the dialog itself).
    ;(focusablesIn()[0] ?? dialog)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Leave Escape to an inner field's own handler (e.g. SaveSlots' inline rename/create cancels
        // on Escape) — don't hijack it to close the whole modal, and DON'T stopPropagation, so the
        // field's React keydown (delegated at the root) still runs.
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
        if (dismissableRef.current) onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      // Trap Tab within the dialog so focus can't escape to the page behind it.
      const items = focusablesIn()
      if (items.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || active === dialog)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Restore focus to whatever opened the modal (a button in the HUD/topbar).
      previouslyFocused?.focus?.()
    }
    // Mount-once: latest onClose/dismissable are read via refs inside the handler.
  }, [])

  return (
    <div className="modal-overlay" onClick={dismissable ? onClose : undefined}>
      <div
        ref={dialogRef}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
