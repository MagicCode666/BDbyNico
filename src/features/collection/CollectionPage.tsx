import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import { useScrollRestoration } from '../../lib/useScrollRestoration'
import PageLayout from '../../components/PageLayout'
import { listSeriesSettings } from '../series/api'
import { seriesProgress } from '../series/progress'
import { useMissingCovers } from '../series/useMissingCovers'
import { AlbumThumb } from './AlbumCard'
import SeriesGrid, { type GridCard } from './SeriesGrid'
import { isOutsideGrid } from './kinds'
import { listCollection } from './api'
import { STATUS_LABELS, type ReadFilter, type Status } from './types'
import { useAsync } from './useAsync'
import { completionLabel, effectiveStatus, PUBLICATION_LABELS } from '../series/status'
import {
  effectiveTotal,
  filterEntries,
  groupBySeries,
  progressLabel,
  seriesCoverUrl,
  type SeriesGroup,
} from './utils'

const STATUSES: Status[] = ['owned', 'wanted']

interface OwnedInSeries {
  count: number
  volumes: number[]
  ownsIntegral: boolean
}

const FILTERS_KEY = 'bdbynico:collection-filters'
const VIEW_KEY = 'bdbynico:collection-view'

type View = 'grille' | 'liste'

function readSavedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'liste' ? 'liste' : 'grille'
  } catch {
    return 'grille'
  }
}

interface SavedFilters {
  query: string
  read: ReadFilter
  dedicatedOnly: boolean
}

function readSavedFilters(): Partial<SavedFilters> {
  try {
    return JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? '{}') as Partial<SavedFilters>
  } catch {
    return {}
  }
}

export default function CollectionPage() {
  const { data, loading, error } = useAsync(listCollection)
  // Au retour en arrière, on retrouve les filtres et la position de la liste
  const navigationType = useNavigationType()
  const [saved] = useState(() => (navigationType === 'POP' ? readSavedFilters() : {}))
  // Possédés ou envies : l'adresse (?statut=envies) commande l'onglet, la navigation latérale y mène
  const [searchParams, setSearchParams] = useSearchParams()
  const status: Status = searchParams.get('statut') === 'envies' ? 'wanted' : 'owned'
  const setStatus = (next: Status) =>
    setSearchParams(next === 'wanted' ? { statut: 'envies' } : {}, { replace: true })
  const [view, setViewState] = useState<View>(readSavedView)
  const setView = (next: View) => {
    setViewState(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // stockage indisponible : le choix ne sera pas retenu
    }
  }
  const [query, setQuery] = useState(saved.query ?? '')
  const [read, setRead] = useState<ReadFilter>(saved.read ?? 'all')
  const [dedicatedOnly, setDedicatedOnly] = useState(saved.dedicatedOnly ?? false)
  useScrollRestoration('collection', !loading)
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ query, read, dedicatedOnly }))
    } catch {
      // stockage indisponible : les filtres ne seront simplement pas restaurés
    }
  }, [query, read, dedicatedOnly])

  const entries = useMemo(() => data ?? [], [data])
  // Couvertures manquantes (après un import, par exemple) : cherchées au fil de l'eau, puis
  // enregistrées pour tous les utilisateurs
  const { covers, remaining } = useMissingCovers(
    entries.map((e) => ({
      isbn: e.edition.isbn,
      coverUrl: e.edition.coverUrl,
      locked: e.edition.coverLocked,
    })),
  )
  const entriesWithCovers = useMemo(
    () =>
      entries.map((e) =>
        !e.edition.coverUrl && covers[e.edition.isbn]
          ? { ...e, edition: { ...e.edition, coverUrl: covers[e.edition.isbn] } }
          : e,
      ),
    [entries, covers],
  )
  const counts = useMemo(
    () => ({
      owned: entries.filter((e) => e.status === 'owned').length,
      wanted: entries.filter((e) => e.status === 'wanted').length,
    }),
    [entries],
  )
  // Réglages personnels par série (tomes ignorés, total personnel) ; sans eux, on s'en passe
  const { data: seriesSettings } = useAsync(listSeriesSettings)
  // Progression par série : tous les albums possédés, indépendamment des filtres
  const ownedBySeries = useMemo(() => {
    const map = new Map<string, OwnedInSeries>()
    for (const e of entries) {
      if (e.status !== 'owned') continue
      const key = e.edition.series?.id ?? '_'
      const current = map.get(key) ?? { count: 0, volumes: [], ownsIntegral: false }
      // Une intégrale ou un hors-série est un objet distinct des tomes : il ne compte pas comme tome
      if (isOutsideGrid(e.edition.kind)) {
        current.ownsIntegral = true
      } else {
        current.count++
        if (e.edition.volume !== null) current.volumes.push(e.edition.volume)
      }
      map.set(key, current)
    }
    return map
  }, [entries])
  const pendingCount = useMemo(() => entries.filter((e) => e.edition.pending).length, [entries])
  const groups = useMemo(
    () => groupBySeries(filterEntries(entriesWithCovers, { status, query, read, dedicatedOnly })),
    [entriesWithCovers, status, query, read, dedicatedOnly],
  )

  function summarize(group: SeriesGroup) {
    const settings = seriesSettings?.get(group.key)
    const owned = ownedBySeries.get(group.key) ?? {
      count: 0,
      volumes: [],
      ownsIntegral: false,
    }
    // Jamais plus de tomes possédés que de tomes existants
    const total = effectiveTotal(settings?.totalOverride ?? group.totalVolumes, owned.volumes)
    // Même calcul que la page de la série : tomes exclus retirés de l'objectif
    const progress = seriesProgress({
      total,
      ownedVolumes: owned.volumes,
      ignored: settings?.ignored ?? [],
      ownsIntegral: owned.ownsIntegral,
      hasVolumeZero: group.startsAtZero,
    })
    const shownTotal = total ? progress.target : null
    const shownOwned = total ? progress.owned : owned.count
    const publication = effectiveStatus(settings?.statusOverride, group.publicationStatus)
    const showProgress = group.name !== null && status === 'owned'
    const complete = showProgress && !!total && progress.complete
    return { total, progress, shownTotal, shownOwned, publication, showProgress, complete }
  }

  const cards: GridCard[] =
    view === 'grille'
      ? groups.flatMap((group): GridCard[] => {
          if (group.name === null) {
            // Albums hors série : une carte par album
            return group.entries.map((entry) => ({
              key: entry.id,
              to: `/collection/${entry.edition.isbn}`,
              name: entry.edition.title,
              coverUrl: entry.edition.coverUrl,
              owned: entry.status === 'owned' ? 1 : 0,
              target: null,
              readCount: entry.read ? 1 : 0,
              albumCount: 1,
              publication: null,
              complete: false,
              showProgress: false,
            }))
          }
          const { total, progress, shownOwned, shownTotal, publication, showProgress, complete } =
            summarize(group)
          return [
            {
              key: group.key,
              to: `/series/${group.key}`,
              name: group.name,
              coverUrl: seriesCoverUrl(group.entries),
              owned: status === 'owned' ? shownOwned : group.entries.length,
              target: status === 'owned' && total ? shownTotal : null,
              readCount: group.entries.filter((entry) => entry.read).length,
              albumCount: group.entries.length,
              publication,
              complete,
              showProgress: showProgress && progress.target > 0,
            },
          ]
        })
      : []

  return (
    <PageLayout title="Ma collection">
      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <div role="tablist" className="flex gap-1">
          {STATUSES.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={`rounded px-3 py-1 text-sm font-medium ${status === value ? 'bg-accent text-on-accent' : 'border border-line-strong hover:bg-raised'}`}
            >
              {STATUS_LABELS[value]}s ({counts[value]})
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Rechercher"
          placeholder="Titre, série, auteur, ISBN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-1"
        />
        <select
          aria-label="Lecture"
          value={read}
          onChange={(e) => setRead(e.target.value as ReadFilter)}
          className="rounded border border-line-strong bg-surface px-2 py-1"
        >
          <option value="all">Tous</option>
          <option value="read">Lus</option>
          <option value="unread">Non lus</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={dedicatedOnly}
            onChange={(e) => setDedicatedOnly(e.target.checked)}
          />
          Dédicacés
        </label>
        <div role="group" aria-label="Affichage" className="flex gap-1">
          {(['grille', 'liste'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`rounded px-3 py-1 text-sm font-medium ${view === value ? 'bg-accent text-on-accent' : 'border border-line-strong hover:bg-raised'}`}
            >
              {value === 'grille' ? 'Grille' : 'Liste'}
            </button>
          ))}
        </div>
        <Link
          to="/collection/ajouter"
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          Ajouter un album
        </Link>
        <Link
          to="/collection/importer"
          className="rounded border border-accent px-3 py-1 text-sm font-medium text-accent-text"
        >
          Importer
        </Link>
      </div>
      {remaining > 0 && (
        <p role="status" className="mb-3 text-sm text-muted">
          Récupération des couvertures… ({remaining} restante{remaining > 1 ? 's' : ''})
        </p>
      )}

      {pendingCount > 0 && (
        <p role="status" className="mb-3 rounded bg-warn-soft p-2 text-sm text-warn">
          {pendingCount} album{pendingCount > 1 ? 's' : ''} en attente de validation : visible
          {pendingCount > 1 ? 's' : ''} de vous seulement pour l'instant.
        </p>
      )}

      {loading && <p className="text-muted">Chargement…</p>}
      {error && <FormMessage kind="error">Impossible de charger la collection.</FormMessage>}
      {!loading && !error && groups.length === 0 && (
        <p className="text-muted">
          {entries.length === 0
            ? 'Votre collection est vide. Ajoutez votre premier album !'
            : 'Aucun album ne correspond à ces critères.'}
        </p>
      )}

      {view === 'grille' && cards.length > 0 && <SeriesGrid cards={cards} />}

      <div className={view === 'liste' ? 'flex flex-col gap-3' : 'hidden'}>
        {(view === 'liste' ? groups : []).map((group) => {
          const { total, progress, shownTotal, shownOwned, publication, showProgress, complete } =
            summarize(group)
          return (
            <section key={group.key} className="card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 className="font-display text-xl font-bold tracking-wide">
                  {group.name ? (
                    <Link
                      to={`/series/${group.key}`}
                      className="hover:text-accent-text hover:underline"
                    >
                      {group.name}
                    </Link>
                  ) : (
                    'Albums hors série'
                  )}
                </h2>
                {showProgress && (
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {total && progress.target === 0
                      ? 'Tomes unitaires exclus'
                      : progressLabel({ ...group, totalVolumes: shownTotal }, shownOwned)}
                    {publication && (
                      <span className="rounded bg-raised px-2 py-0.5 text-xs text-fg">
                        {PUBLICATION_LABELS[publication]}
                      </span>
                    )}
                    {complete && (
                      <span className="rounded bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                        {completionLabel(true, publication)}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {showProgress && shownTotal ? (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={shownTotal}
                  aria-valuenow={Math.min(shownOwned, shownTotal)}
                  className="mb-3 h-1.5 overflow-hidden rounded-sm border border-line bg-raised"
                >
                  <div
                    className="h-full bg-gradient-to-r from-accent to-accent-text"
                    style={{ width: `${Math.min(100, (shownOwned / shownTotal) * 100)}%` }}
                  />
                </div>
              ) : null}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {group.entries.map((entry) => (
                  <AlbumThumb key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </PageLayout>
  )
}
