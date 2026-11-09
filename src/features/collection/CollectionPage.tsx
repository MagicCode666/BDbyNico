import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import AlbumCard from './AlbumCard'
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
  // Progression par série : tous les albums possédés, indépendamment des filtres
  const ownedBySeries = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      if (e.status !== 'owned') continue
      const key = e.edition.series?.id ?? '_'
      map.set(key, (map.get(key) ?? 0) + 1)
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

      {groups.map((group) => (
        <section key={group.key} className="mb-6">
          <h2 className="mb-2 flex items-baseline gap-2 text-lg font-semibold">
            {group.name ?? 'Albums hors série'}
            {group.name && status === 'owned' && (
              <span className="text-sm font-normal text-slate-600">
                {progressLabel(group, ownedBySeries.get(group.key) ?? 0)}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {group.entries.map((entry) => (
              <AlbumCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </PageLayout>
  )
}
