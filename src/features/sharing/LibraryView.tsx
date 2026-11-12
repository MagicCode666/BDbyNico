import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import Avatar from '../avatar/Avatar'
import { CoverImage } from '../collection/AlbumCard'
import { shortKindLabel } from '../collection/kinds'
import SeriesGrid from '../collection/SeriesGrid'
import type { Entry, Status } from '../collection/types'
import { sharedCards, sharedSummary } from './sharedCollection'

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className="font-display text-3xl font-extrabold leading-none">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function SeriesDetail({
  entries,
  name,
  basePath,
}: {
  entries: Entry[]
  name: string
  basePath: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link to={basePath} className="text-sm text-accent-text underline">
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
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Bibliothèque d'un autre utilisateur, en lecture seule : chiffres clés, grille des séries (onglets
 * possédés / envies) ou détail d'une série. Commune au lien public et aux amis ; `basePath` est
 * l'adresse de la bibliothèque, les séries s'ouvrent en `${basePath}/${idDeSérie}`.
 */
export default function LibraryView({
  pseudo,
  entries,
  basePath,
  seriesId,
  intro,
  avatar,
}: {
  pseudo: string
  entries: Entry[]
  basePath: string
  seriesId?: string
  /** Texte au-dessus du pseudo (« Collection de »). */
  intro?: ReactNode
  /** Avatar de la personne (amis seulement : le lien public n'en montre pas). */
  avatar?: string | null
}) {
  const [status, setStatus] = useState<Status>('owned')
  const summary = useMemo(() => sharedSummary(entries), [entries])
  const cards = useMemo(() => sharedCards(entries, status, basePath), [entries, status, basePath])
  const seriesEntries = useMemo(
    () =>
      seriesId ? entries.filter((entry) => (entry.edition.series?.id ?? '_') === seriesId) : [],
    [entries, seriesId],
  )
  const wishes = summary.wantedCount > 0

  return (
    <>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {avatar !== undefined && <Avatar src={avatar} name={pseudo} size="lg" />}
          <div>
            <p className="text-sm text-muted">{intro ?? 'Collection de'}</p>
            <h1 className="title-metal text-4xl">{pseudo}</h1>
          </div>
        </div>
        <div className="flex divide-x divide-line-strong" role="group" aria-label="Chiffres clés">
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
            basePath={basePath}
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
  )
}
