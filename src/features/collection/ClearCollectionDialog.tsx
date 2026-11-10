import { useEffect, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { exportCollection } from '../export/exportCollection'
import { clearCollection, countEntries } from './api'

/** Mot à saisir pour confirmer : une validation volontaire, pas un simple clic. */
export const CONFIRM_WORD = 'VIDER'

interface ClearCollectionDialogProps {
  userId: string
  onDone: () => void
  onCancel: () => void
}

export default function ClearCollectionDialog({
  userId,
  onDone,
  onCancel,
}: ClearCollectionDialogProps) {
  const [count, setCount] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [resetSettings, setResetSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exported, setExported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    countEntries()
      .then((value) => !cancelled && setCount(value))
      .catch(() => !cancelled && setError('Impossible de compter les albums.'))
    return () => {
      cancelled = true
    }
  }, [])

  const confirmed = typed.trim() === CONFIRM_WORD
  const canClear = confirmed && count !== null && count > 0 && !busy

  async function onExport() {
    setError(null)
    try {
      await exportCollection()
      setExported(true)
    } catch {
      setError("L'export a échoué : votre collection n'a pas été modifiée.")
    }
  }

  async function onClear() {
    if (!canClear) return
    setBusy(true)
    setError(null)
    try {
      await clearCollection(userId, resetSettings)
      onDone()
    } catch {
      setError('La suppression a échoué : certains albums peuvent rester dans votre collection.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(event) => event.key === 'Escape' && !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-title"
        className="w-full max-w-md rounded bg-surface p-5 shadow-lg"
      >
        <h2 id="clear-title" className="mb-2 text-lg font-semibold text-danger-text">
          Vider ma collection
        </h2>
        <p className="mb-3 text-sm">
          {count === null
            ? 'Comptage des albums…'
            : count === 0
              ? 'Votre collection est déjà vide.'
              : `${count} album${count > 1 ? 's' : ''} (possédés et envies) ${count > 1 ? 'seront retirés' : 'sera retiré'} de votre collection.`}
        </p>
        <p className="mb-4 text-sm text-muted">
          <strong>Cette action est irréversible.</strong> Votre compte et le catalogue partagé ne
          sont pas touchés. Vous pourrez réimporter le fichier exporté pour tout restaurer.
        </p>

        <button
          type="button"
          onClick={onExport}
          disabled={busy}
          className="mb-1 rounded border border-line-strong px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-50"
        >
          Exporter ma collection d'abord (CSV)
        </button>
        {exported && (
          <p role="status" className="mb-3 text-xs text-ok">
            Fichier téléchargé.
          </p>
        )}

        <label className="mb-4 mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={resetSettings}
            onChange={(e) => setResetSettings(e.target.checked)}
          />
          Réinitialiser aussi mes réglages de séries (tomes ignorés, totaux personnels)
        </label>

        <label htmlFor="confirm-word" className="mb-1 block text-sm font-medium">
          Tapez <strong>{CONFIRM_WORD}</strong> pour confirmer
        </label>
        <input
          id="confirm-word"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mb-4 w-full rounded border border-line-strong px-3 py-2 focus:border-danger focus:outline-none"
        />

        {error && (
          <div className="mb-3">
            <FormMessage kind="error">{error}</FormMessage>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-line-strong px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Suppression…' : 'Vider ma collection'}
          </button>
        </div>
      </div>
    </div>
  )
}
