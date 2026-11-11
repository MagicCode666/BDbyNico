import { useEffect, useState } from 'react'

import { listSeriesAdmin, type AdminSeries } from './api'

interface Props {
  /** Série à ne pas proposer (celle que l'on corrige déjà). */
  excludeId?: string
  onPick: (series: AdminSeries) => void
  label?: string
}

/** Recherche d'une série existante par son nom (réservé aux modérateurs). */
export default function SeriesPicker({ excludeId, onPick, label = 'Chercher une série' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminSeries[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      listSeriesAdmin(query.trim())
        .then((rows) => {
          if (cancelled) return
          setFailed(false)
          setResults(rows.filter((row) => row.id !== excludeId))
        })
        .catch(() => !cancelled && setFailed(true))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, excludeId])

  const shown = query.trim().length < 2 ? [] : results

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{label}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom de la série…"
          className="max-w-md rounded border border-line-strong bg-surface px-3 py-2"
        />
      </label>
      {failed && <p className="text-sm text-danger-text">La recherche a échoué.</p>}
      {shown.length > 0 && (
        <ul className="flex max-w-md flex-col divide-y divide-line rounded border border-line-strong">
          {shown.map((series) => (
            <li key={series.id}>
              <button
                type="button"
                onClick={() => onPick(series)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-raised"
              >
                <span className="truncate">{series.name}</span>
                <span className="flex-none text-xs text-muted">
                  {series.editionCount} album{series.editionCount > 1 ? 's' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
