import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { languageName } from '../../lib/bnfFields'
import { formatIsbn } from '../../lib/isbn'
import CoverReportDialog from '../governance/CoverReportDialog'
import { getSeriesData, addCatalogueEdition, type SeriesData } from '../series/api'
import { PUBLICATION_LABELS } from '../series/status'
import { CoverImage } from './AlbumCard'
import AlbumCollectionCard from './AlbumCollectionCard'
import AlbumSeriesStrip from './AlbumSeriesStrip'
import { fillEditionDetails, getCatalogueEdition, getEntry } from './api'
import KindEditor from './KindEditor'
import { KIND_LABELS, toAlbumKind } from './kinds'
import { lookupBnf } from './lookup/bnf'
import type { Edition, Entry } from './types'
import { useAsync } from './useAsync'

interface AlbumData {
  edition: Edition
  entry: Entry | null
  series: SeriesData | null
}

async function loadAlbum(isbn: string): Promise<AlbumData | null> {
  const [edition, entry] = await Promise.all([getCatalogueEdition(isbn), getEntry(isbn)])
  const known = entry?.edition ?? edition
  if (!known) return null
  // Les données de la série sont un plus : leur échec ne doit pas masquer l'album
  const series = known.series ? await getSeriesData(known.series.id).catch(() => null) : null
  return { edition: known, entry, series }
}

export default function AlbumPage() {
  const { isbn = '' } = useParams()
  const load = useCallback(() => loadAlbum(isbn), [isbn])
  const { data, loading, error, reload } = useAsync(load)

  const crumbs = [
    { label: 'Accueil', to: '/' },
    { label: 'Ma collection', to: '/collection' },
    ...(data?.edition.series
      ? [{ label: data.edition.series.name, to: `/series/${data.edition.series.id}` }]
      : []),
    { label: data?.edition.title ?? 'Album' },
  ]

  return (
    <PageLayout title="Fiche de l'album" crumbs={crumbs} hideTitle>
      {loading && !data && <p className="text-muted">Chargement…</p>}
      {error && <FormMessage kind="error">Impossible de charger cet album.</FormMessage>}
      {!loading && !error && !data && (
        <p className="text-muted">
          Cet album n'est pas dans le catalogue.{' '}
          <Link to="/collection" className="text-accent-text underline">
            Retour à la collection
          </Link>
        </p>
      )}
      {data && <AlbumDetails key={data.edition.isbn} data={data} onReload={reload} />}
    </PageLayout>
  )
}

const secondaryButton =
  'rounded border border-line-strong bg-surface px-3 py-2 text-sm font-medium hover:bg-raised disabled:opacity-50'

function AlbumDetails({ data, onReload }: { data: AlbumData; onReload: () => void }) {
  const { edition, entry, series } = data
  const { user } = useAuth()
  const [reportingCover, setReportingCover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useAutoFillDetails(edition, onReload)

  async function add(status: 'owned' | 'wanted') {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await addCatalogueEdition(user.id, edition.isbn, status)
      onReload()
    } catch {
      setError("Impossible de l'ajouter à votre collection.")
    }
    setBusy(false)
  }

  const kind = toAlbumKind(edition.kind)
  const publication = edition.series?.publicationStatus
  const published = edition.publishedOn ? formatDate(edition.publishedOn) : null
  const facts: [string, string | null][] = [
    ['Éditeur', edition.publisher],
    ['Parution', published],
    ['Pages', edition.pages ? String(edition.pages) : null],
    ['Format', edition.formatCm ? `${edition.formatCm} cm de haut` : null],
    [
      'Prix public',
      edition.publicPrice != null
        ? `${edition.publicPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
        : null,
    ],
    ['Langue', languageName(edition.language) ?? null],
    ['Type', KIND_LABELS[kind]],
    ['ISBN', formatIsbn(edition.isbn)],
  ]

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card-lift grid gap-5 p-5 sm:grid-cols-[10rem_minmax(0,1fr)]"
        style={{
          backgroundImage:
            'radial-gradient(560px 260px at 14% -4%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%), var(--grad-surface)',
        }}
      >
        <div className="flex flex-col items-start gap-2">
          <div className="cover-art aspect-[2/3] w-28 sm:w-40">
            <CoverImage
              coverUrl={edition.coverUrl}
              title={edition.title}
              className="aspect-[2/3] rounded"
            />
          </div>
          <button
            type="button"
            onClick={() => setReportingCover(true)}
            className="text-xs text-muted underline hover:text-accent-text"
          >
            Cette couverture n'est pas bonne
          </button>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {kind !== 'album' && <span className="badge badge-accent">{KIND_LABELS[kind]}</span>}
            {entry && (
              <span className="badge">
                {entry.status === 'owned' ? 'Dans ma collection' : 'Dans mes envies'}
                {entry.read ? ' · lu' : ''}
              </span>
            )}
            {publication && edition.series && (
              <span className="badge">{PUBLICATION_LABELS[publication]}</span>
            )}
          </div>
          <h1 className="title-metal text-3xl sm:text-5xl">{edition.title}</h1>
          {edition.series && (
            <p>
              <Link
                to={`/series/${edition.series.id}`}
                className="font-medium text-accent-text hover:underline"
              >
                {edition.series.name}
              </Link>
              {edition.volume !== null && (
                <span className="text-muted"> · Tome {edition.volume}</span>
              )}
            </p>
          )}
          {edition.authors.length > 0 && (
            <p className="text-muted">{edition.authors.join(' · ')}</p>
          )}
          <p className="text-sm text-muted">
            {[edition.publisher, published].filter(Boolean).join(' · ')}
          </p>
          {!entry && (
            <div
              className="flex flex-wrap gap-2 pt-1"
              role="group"
              aria-label="Ajouter à ma collection"
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => add('owned')}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                Je l'ai
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => add('wanted')}
                className={secondaryButton}
              >
                Je le veux
              </button>
            </div>
          )}
          {error && <FormMessage kind="error">{error}</FormMessage>}
        </div>
      </section>

      {edition.pending && (
        <p role="status" className="rounded bg-warn-soft p-2 text-sm text-warn">
          Cet album est en attente de validation : il n'est visible que de vous pour l'instant.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {edition.summary && (
            <section className="card flex flex-col gap-2 p-5" aria-labelledby="resume">
              <h2 id="resume" className="font-display text-xl font-bold uppercase tracking-wide">
                Résumé
              </h2>
              <p className="leading-relaxed text-muted">{edition.summary}</p>
              <p className="text-xs text-muted">Source : catalogue de la BnF.</p>
            </section>
          )}

          <section className="card flex flex-col gap-3 p-5" aria-labelledby="a-propos">
            <h2 id="a-propos" className="font-display text-xl font-bold uppercase tracking-wide">
              Caractéristiques
            </h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-line py-1">
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {entry && (
              <KindEditor
                key={`${edition.kind}-${edition.volumeFrom}-${edition.volumeTo}`}
                edition={edition}
                onChanged={onReload}
              />
            )}
          </section>

          {series && <AlbumSeriesStrip data={series} currentIsbn={edition.isbn} />}
        </div>

        {entry && <AlbumCollectionCard key={entry.id} entry={entry} />}
      </div>

      {reportingCover && (
        <CoverReportDialog
          isbn={edition.isbn}
          title={edition.title}
          currentCover={edition.coverUrl}
          onClose={() => setReportingCover(false)}
          onChanged={onReload}
        />
      )}
    </div>
  )
}

/** « 2021-03-12 » → « 12 mars 2021 » ; « 1989-01-01 » (année seule) → « 1989 ». */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year) return iso
  if (month === 1 && day === 1) return String(year)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Une fiche jamais complétée est demandée à la BnF à l'ouverture, puis enregistrée dans le
 * catalogue (sans écraser l'existant) : chaque album n'est interrogé qu'une fois.
 */
function useAutoFillDetails(edition: Edition, onReload: () => void) {
  const tried = useRef(false)
  const { isbn, detailsChecked, pending } = edition
  useEffect(() => {
    if (tried.current || detailsChecked || pending) return
    tried.current = true
    lookupBnf(isbn)
      .then(async (info) => {
        await fillEditionDetails(isbn, info ?? {})
        if (info?.summary || info?.pages || info?.formatCm || info?.publicPrice || info?.language) {
          onReload()
        }
      })
      .catch(() => undefined)
  }, [isbn, detailsChecked, pending, onReload])
}
