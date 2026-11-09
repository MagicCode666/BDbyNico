import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { listSeriesSettings } from '../series/api'
import { missingVolumes } from '../series/buildView'
import { AlbumThumb } from './AlbumCard'
import { listCollection } from './api'
import { STATUS_LABELS, type ReadFilter, type Status } from './types'
import { useAsync } from './useAsync'
import { filterEntries, groupBySeries, progressLabel } from './utils'

const STATUSES: Status[] = ['owned', 'wanted']

export default function CollectionPage() {
  const { data, loading, error } = useAsync(listCollection)
  const [status, setStatus] = useState<Status>('owned')
  const [query, setQuery] = useState('')
  const [read, setRead] = useState<ReadFilter>('all')

  const entries = useMemo(() => data ?? [], [data])
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
  const groups = useMemo(
    () => groupBySeries(filterEntries(entries, { status, query, read })),
    [entries, status, query, read],
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
        <Link
          to="/collection/ajouter"
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Ajouter un album
        </Link>
      </div>

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
          const total = settings?.totalOverride ?? group.totalVolumes
          const owned = ownedBySeries.get(group.key) ?? { count: 0, volumes: [] }
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
                    {progressLabel({ ...group, totalVolumes: total }, owned.count)}
                    {complete && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Complète
                      </span>
                    )}
                  </span>
                )}
              </div>
              {showProgress && total ? (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={Math.min(owned.count, total)}
                  className="mb-3 h-1.5 overflow-hidden rounded bg-slate-100"
                >
                  <div
                    className="h-full bg-indigo-600"
                    style={{ width: `${Math.min(100, (owned.count / total) * 100)}%` }}
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
