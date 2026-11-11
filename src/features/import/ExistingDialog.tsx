import { useState } from 'react'

import type { ExistingMode } from './runImport'

interface ExistingDialogProps {
  count: number
  onConfirm: (mode: ExistingMode) => void
  onCancel: () => void
}

/** Demande quoi faire des albums du fichier qui sont déjà dans la collection. */
export default function ExistingDialog({ count, onConfirm, onCancel }: ExistingDialogProps) {
  const [mode, setMode] = useState<ExistingMode>('skip')
  const plural = count > 1

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="existing-title"
        className="w-full max-w-md rounded bg-surface p-5 shadow-lg"
      >
        <h2 id="existing-title" className="mb-2 text-lg font-semibold">
          {count} album{plural ? 's sont' : ' est'} déjà dans votre collection
        </h2>
        <p className="mb-4 text-sm text-muted">
          Que faire de {plural ? 'ces albums' : 'cet album'} ?
        </p>

        <div className="mb-5 flex flex-col gap-3">
          <label className="flex cursor-pointer gap-3 rounded border border-line p-3 has-[:checked]:border-accent">
            <input
              type="radio"
              name="existing-mode"
              checked={mode === 'skip'}
              onChange={() => setMode('skip')}
              autoFocus
            />
            <span>
              <span className="block font-medium">Les ignorer (recommandé)</span>
              <span className="text-sm text-muted">Ils restent exactement comme ils sont.</span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded border border-line p-3 has-[:checked]:border-accent">
            <input
              type="radio"
              name="existing-mode"
              checked={mode === 'update'}
              onChange={() => setMode('update')}
            />
            <span>
              <span className="block font-medium">Les compléter</span>
              <span className="text-sm text-muted">
                Ajoute ce que le fichier sait en plus (prix, dédicace, édition originale, envie
                devenue possédée), sans rien effacer. La date d'achat et vos notes ne sont pas
                touchées.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line-strong px-4 py-2 text-sm font-medium"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(mode)}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
          >
            Lancer l'import
          </button>
        </div>
      </div>
    </div>
  )
}
