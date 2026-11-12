import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import Logo from '../../components/Logo'
import type { Entry } from '../collection/types'
import { getSharedCollection } from './api'
import LibraryView from './LibraryView'
import { toSharedEntries } from './sharedCollection'

type State =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; pseudo: string; entries: Entry[] }

/** Collection d'un autre utilisateur, en lecture seule, sans compte (lien de partage). */
export default function SharedPage() {
  const { token = '', seriesId } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    getSharedCollection(token)
      .then((rows) => {
        if (cancelled) return
        setState(
          rows.length === 0
            ? { phase: 'error' }
            : { phase: 'ready', pseudo: rows[0].pseudo, entries: toSharedEntries(rows) },
        )
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo className="h-9" />
        <Link
          to="/inscription"
          className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent-text"
        >
          Créer ma collection
        </Link>
      </header>

      {state.phase === 'loading' && <p className="text-muted">Chargement…</p>}
      {state.phase === 'error' && (
        <FormMessage kind="error">
          Ce lien de partage n'est pas valide, ou le partage a été désactivé.
        </FormMessage>
      )}
      {state.phase === 'ready' && (
        <LibraryView
          pseudo={state.pseudo}
          entries={state.entries}
          basePath={`/partage/${token}`}
          seriesId={seriesId}
        />
      )}
    </main>
  )
}
