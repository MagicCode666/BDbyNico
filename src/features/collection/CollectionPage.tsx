import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigationType } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import { useScrollRestoration } from '../../lib/useScrollRestoration'
import PageLayout from '../../components/PageLayout'
import { listSeriesSettings } from '../series/api'
import { missingVolumes } from '../series/buildView'
import { useMissingCovers } from '../series/useMissingCovers'
import { AlbumThumb } from './AlbumCard'
import { listCollection } from './api'
import { STATUS_LABELS, type ReadFilter, type Status } from './types'
import { useAsync } from './useAsync'
import { completionLabel, effectiveStatus, PUBLICATION_LABELS } from '../series/status'
import { effectiveTotal, filterEntries, groupBySeries, progressLabel } from './utils'

const STATUSES: Status[] = ['owned', 'wanted']

const FILTERS_KEY = 'bdbynico:collection-filters'

interface SavedFilters {
  status: Status
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
  const [status, setStatus] = useState<Status>(saved.status ?? 'owned')
  const [query, setQuery] = useState(saved.query ?? '')
  const [read, setRead] = useState<ReadFilter>(saved.read ?? 'all')
  const [dedicatedOnly, setDedicatedOnly] = useState(saved.dedicatedOnly ?? false)
  useScrollRestoration('collection', !loading)
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ status, query, read, dedicatedOnly }))
    } catch {
      // stockage indisponible : les filtres ne seront simplement pas restaurés
    }
  }, [status, query, read, dedicatedOnly])

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
    const map = new Map<string, { count: number; volumes: number[] }>()
    for (const e of entries) {
      if (e.status !== 'owned') continue
      const key = e.edition.series?.id ?? '_'
      const current = map.get(key) ?? { count: 0, volumes: [] }
      current.count++
      if (e.edition.volume !== null) current.volumes.push(e.edition.volume)
      map.set(key, current)
    }
    return map
  }, [entries])
  const pendingCount = useMemo(() => entries.filter((e) => e.edition.pending).length, [entries])
  const groups = useMemo(
    () => groupBySeries(filterEntries(entriesWithCovers, { status, query, read, dedicatedOnly })),
    [entriesWithCovers, status, query, read, dedicatedOnly],
  )

  return (
    <PageLayout title="Ma collection">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1">
          {STATUSES.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={`rounded px-3 py-1 text-sm font-medium ${status === value ? 'bg-indigo-600 text-white' : 'border border-slate-300'}`}
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
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1"
        />
        <select
          aria-label="Lecture"
          value={read}
          onChange={(e) => setRead(e.target.value as ReadFilter)}
          className="rounded border border-slate-300 px-2 py-1"
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
        <Link
          to="/collection/ajouter"
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Ajouter un album
        </Link>
        <Link
          to="/collection/importer"
          className="rounded border border-indigo-600 px-3 py-1 text-sm font-medium text-indigo-600"
        >
          Importer
        </Link>
      </div>
      {remaining > 0 && (
        <p role="status" className="mb-3 text-sm text-slate-500">
          Récupération des couvertures… ({remaining} restante{remaining > 1 ? 's' : ''})
        </p>
      )}

      {pendingCount > 0 && (
        <p role="status" className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">
          {pendingCount} album{pendingCount > 1 ? 's' : ''} en attente de validation : visible
          {pendingCount > 1 ? 's' : ''} de vous seulement pour l'instant.
        </p>
      )}

      {loading && <p className="text-slate-600">Chargement…</p>}
      {error && <FormMessage kind="error">Impossible de charger la collection.</FormMessage>}
      {!loading && !error && groups.length === 0 && (
        <p className="text-slate-600">
          {entries.length === 0
            ? 'Votre collection est vide. Ajoutez votre premier album !'
            : 'Aucun album ne correspond à ces critères.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const settings = seriesSettings?.get(group.key)
          const owned = ownedBySeries.get(group.key) ?? { count: 0, volumes: [] }
          // Jamais plus de tomes possédés que de tomes existants
          const total = effectiveTotal(settings?.totalOverride ?? group.totalVolumes, owned.volumes)
          const ownedNumbered = new Set(owned.volumes).size
          // Un tome 0 (prologue) s'ajoute au total : 7 / 7 pour les tomes 0 à 6
          const shownTotal = total ? total + (owned.volumes.includes(0) ? 1 : 0) : null
          const shownOwned = total ? ownedNumbered : owned.count
          const publication = effectiveStatus(settings?.statusOverride, group.publicationStatus)
          const showProgress = group.name !== null && status === 'owned'
          const complete =
            showProgress &&
            !!total &&
            missingVolumes(total, owned.volumes, settings?.ignored ?? []).length === 0
          return (
            <section key={group.key} className="rounded border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 className="text-lg font-semibold">
                  {group.name ? (
                    <Link
                      to={`/series/${group.key}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {group.name}
                    </Link>
                  ) : (
                    'Albums hors série'
                  )}
                </h2>
                {showProgress && (
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    {progressLabel({ ...group, totalVolumes: shownTotal }, shownOwned)}
                    {publication && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {PUBLICATION_LABELS[publication]}
                      </span>
                    )}
                    {complete && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
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
                  className="mb-3 h-1.5 overflow-hidden rounded bg-slate-100"
                >
                  <div
                    className="h-full bg-indigo-600"
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
