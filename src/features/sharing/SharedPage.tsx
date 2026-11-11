import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import Logo from '../../components/Logo'
import { CoverImage } from '../collection/AlbumCard'
import { shortKindLabel } from '../collection/kinds'
import SeriesGrid from '../collection/SeriesGrid'
import type { Entry, Status } from '../collection/types'
import { getSharedCollection } from './api'
import { sharedCards, sharedSummary, toSharedEntries } from './sharedCollection'

type State =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; pseudo: string; entries: Entry[] }

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className="font-display text-3xl font-extrabold leading-none">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function SeriesDetail({ entries, name, token }: { entries: Entry[]; name: string; token: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link to={`/partage/${token}`} className="text-sm text-accent-text underline">
          ← Toute la collection
        </Link>
        <h2 className="font-display text-2xl font-bold">{name}</h2>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {entries.map((entry) => {
          const { edition } = entry
          const wanted = entry.status === 'wanted'
          const label =
            edition.kind === 'integral' || edition.kind === 'special'
              ? shortKindLabel(edition.kind, edition.volumeFrom, edition.volumeTo)
              : edition.volume !== null
                ? `T${edition.volume}`
                : '·'
          return (
            <li key={entry.id} className="flex flex-col gap-1">
              <div className={`cover-art relative ${wanted ? 'opacity-60 grayscale-[0.6]' : ''}`}>
                <CoverImage
                  coverUrl={edition.coverUrl}
                  title={edition.title}
                  className="aspect-[2/3] w-full rounded"
                />
                {entry.dedication && (
                  <span
                    role="img"
                    aria-label="dédicacé"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-steel text-xs text-on-accent shadow"
                  >
                    ✎
                  </span>
                )}
              </div>
              <span className="text-center text-xs text-muted">
                {label}
                {wanted && ' · en envie'}
                {entry.read && ' · lu'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Collection d'un autre utilisateur, en lecture seule, sans compte (lien de partage). */
export default function SharedPage() {
  const { token = '', seriesId } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [status, setStatus] = useState<Status>('owned')

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

  const entries = useMemo(() => (state.phase === 'ready' ? state.entries : []), [state])
  const summary = useMemo(() => sharedSummary(entries), [entries])
  const cards = useMemo(() => sharedCards(entries, status, token), [entries, status, token])
  const seriesEntries = useMemo(
    () =>
      seriesId ? entries.filter((entry) => (entry.edition.series?.id ?? '_') === seriesId) : [],
    [entries, seriesId],
  )
  const wishes = summary.wantedCount > 0

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
        <>
          <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted">Collection de</p>
              <h1 className="title-metal text-4xl">{state.pseudo}</h1>
            </div>
            <div
              className="flex divide-x divide-line-strong"
              role="group"
              aria-label="Chiffres clés"
            >
              <Figure value={summary.seriesCount} label="séries" />
              <Figure value={summary.ownedCount} label="albums" />
              {wishes && <Figure value={summary.wantedCount} label="en envie" />}
            </div>
          </section>

          {seriesId ? (
            seriesEntries.length > 0 ? (
              <SeriesDetail
                entries={seriesEntries}
                name={seriesEntries[0].edition.series?.name ?? 'Albums hors série'}
                token={token}
              />
            ) : (
              <FormMessage kind="error">Cette série n'est pas dans la collection.</FormMessage>
            )
          ) : (
            <>
              {wishes && (
                <div role="tablist" className="flex gap-1">
                  {(['owned', 'wanted'] as const).map((value) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={status === value}
                      onClick={() => setStatus(value)}
                      className={`rounded px-3 py-1 text-sm font-medium ${status === value ? 'bg-accent text-on-accent' : 'border border-line-strong hover:bg-raised'}`}
                    >
                      {value === 'owned' ? 'Possédés' : 'Envies'}
                    </button>
                  ))}
                </div>
              )}
              <SeriesGrid cards={cards} />
            </>
          )}
        </>
      )}
    </main>
  )
}
