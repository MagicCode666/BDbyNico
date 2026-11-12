import { useEffect, useRef, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { exportCollection } from '../export/exportCollection'
import { deleteMyAccount, LAST_ADMIN_MESSAGE } from './api'

/** Mot à saisir pour confirmer : une validation volontaire, pas un simple clic. */
export const CONFIRM_WORD = 'SUPPRIMER'

/** Suppression définitive du compte, après un export facultatif et la saisie d'un mot. */
export default function DeleteAccountDialog({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const wordInput = useRef<HTMLInputElement>(null)

  // Le focus entre dans la fenêtre : le clavier et Échap agissent sur elle, pas sur la page derrière
  useEffect(() => wordInput.current?.focus(), [])
  const [busy, setBusy] = useState(false)
  const [exported, setExported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = typed.trim() === CONFIRM_WORD && !busy

  async function onExport() {
    setError(null)
    try {
      await exportCollection()
      setExported(true)
    } catch {
      setError("L'export a échoué : votre compte n'a pas été modifié.")
    }
  }

  async function onDelete() {
    if (!canDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount()
      onDone()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === LAST_ADMIN_MESSAGE
          ? LAST_ADMIN_MESSAGE
          : 'La suppression a échoué : votre compte est conservé. Réessayez plus tard.',
      )
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
        aria-labelledby="delete-account-title"
        className="w-full max-w-md rounded bg-surface p-5 shadow-lg"
      >
        <h2 id="delete-account-title" className="mb-2 text-lg font-semibold text-danger-text">
          Supprimer mon compte
        </h2>
        <p className="mb-2 text-sm">
          Votre compte et toutes vos données privées seront supprimés : profil, pseudo, avatar,
          collection, envies, réglages de séries et liste d'amis.
        </p>
        <p className="mb-4 text-sm text-muted">
          <strong>Cette action est irréversible.</strong> Les albums et séries que vous avez ajoutés
          au catalogue partagé restent disponibles pour tous, sans votre nom.
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

        <label htmlFor="delete-account-word" className="mb-1 mt-3 block text-sm font-medium">
          Tapez <strong>{CONFIRM_WORD}</strong> pour confirmer
        </label>
        <input
          id="delete-account-word"
          ref={wordInput}
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
            onClick={onDelete}
            disabled={!canDelete}
            className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Suppression…' : 'Supprimer mon compte'}
          </button>
        </div>
      </div>
    </div>
  )
}
