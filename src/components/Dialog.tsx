import { useEffect, useId, type ReactNode } from 'react'

import { Icon, type IconName } from './icons'

export interface DialogAction {
  label: string
  icon: IconName
  onClick: () => void
  danger?: boolean
}

interface DialogProps {
  title: string
  children?: ReactNode
  actions: DialogAction[]
  onCancel: () => void
  busy?: boolean
}

/** Fenêtre modale de confirmation ou de choix : Échap ou clic à côté pour fermer. */
export default function Dialog({ title, children, actions, onCancel, busy = false }: DialogProps) {
  const titleId = useId()
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card flex w-full max-w-sm flex-col gap-4 p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-display text-lg font-bold">
          {title}
        </h2>
        {children && <div className="text-sm text-muted">{children}</div>}
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              onClick={action.onClick}
              className={`flex items-center gap-3 rounded border px-3 py-2 text-left text-sm font-medium transition disabled:opacity-50 ${
                action.danger
                  ? 'border-danger text-danger-text hover:bg-danger-soft'
                  : 'border-line-strong hover:border-accent hover:bg-raised'
              }`}
            >
              <Icon name={action.icon} className="h-4 w-4" />
              {action.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded px-3 py-2 text-sm text-muted hover:text-fg"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
