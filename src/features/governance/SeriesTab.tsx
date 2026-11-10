import { useCallback, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { useAsync } from '../collection/useAsync'
import {
  governanceErrorMessage,
  listSeriesAdmin,
  renameSeries,
  setSeriesStatus,
  setSeriesTotal,
  type AdminSeries,
} from './api'

const buttonClass =
  'rounded border border-line-strong px-2 py-1 text-xs font-medium hover:border-accent disabled:opacity-50'

const STATUS_OPTIONS = [
  { value: '', label: 'Automatique (BnF)' },
  { value: 'ongoing', label: 'En cours' },
  { value: 'finished', label: 'Terminée' },
] as const

/** Corrections de séries partagées par tous : nom, total, statut de publication. */
export default function SeriesTab() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const load = useCallback(() => listSeriesAdmin(query), [query])
  const { data, loading, error, reload } = useAsync(load)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Corrigez une série pour tout le monde : nom, total, statut. Chaque changement est inscrit au
        journal et peut être annulé. Un total ou un statut fixé ici n'est plus modifié par la mise à
        jour automatique.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(input.trim())
        }}
        className="flex gap-2"
      >
        <label htmlFor="series-search" className="sr-only">
          Rechercher une série
        </label>
        <input
          id="series-search"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nom de la série (casse et accents ignorés)"
          className="flex-1 rounded border border-line-strong px-3 py-2 text-sm"
        />
        <button type="submit" className={buttonClass}>
          Rechercher
        </button>
      </form>
      {error && <FormMessage kind="error">Impossible de charger les séries.</FormMessage>}
      {loading && !data && <p className="text-muted">Chargement…</p>}
      {data?.length === 0 && <p className="text-muted">Aucune série trouvée.</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((series) => (
          <SeriesRow key={series.id} series={series} onChanged={reload} />
        ))}
      </ul>
      {data?.length === 30 && (
        <p className="text-xs text-muted">
          Les 30 premières séries : précisez la recherche pour en voir d'autres.
        </p>
      )}
    </div>
  )
}

function statusWord(series: AdminSeries): string {
  if (series.publicationStatus === 'finished') return 'terminée'
  if (series.publicationStatus === 'ongoing') return 'en cours'
  return 'inconnu'
}

function SeriesRow({ series, onChanged }: { series: AdminSeries; onChanged: () => void }) {
  const [name, setName] = useState(series.name)
  const [total, setTotal] = useState(series.totalVolumes?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setMessage(governanceErrorMessage(e, failure))
    }
    setBusy(false)
  }

  function saveTotal() {
    const value = Number(total)
    if (!Number.isInteger(value) || value < 1 || value > 999) {
      return setMessage('Le total doit être un entier entre 1 et 999.')
    }
    void run(() => setSeriesTotal(series.id, value), "Impossible d'enregistrer le total.")
  }

  return (
    <li className="flex flex-col gap-2 rounded border border-line p-3 text-sm">
      <p className="text-xs text-muted">
        {series.editionCount} album(s) · total {series.totalVolumes ?? 'inconnu'}
        {series.totalSource === 'manual' && ' (fixé à la main)'} · statut {statusWord(series)}
        {series.statusSource === 'manual' && ' (fixé à la main)'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="w-12">Nom</span>
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            className="w-72 max-w-full rounded border border-line-strong px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={busy || name.trim() === series.name}
          onClick={() => run(() => renameSeries(series.id, name), 'Renommage impossible.')}
          className={buttonClass}
        >
          Renommer
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="w-12">Total</span>
          <input
            type="number"
            min={1}
            max={999}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="w-24 rounded border border-line-strong px-2 py-1"
          />
        </label>
        <button type="button" disabled={busy} onClick={saveTotal} className={buttonClass}>
          Fixer le total
        </button>
        {series.totalSource === 'manual' && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => setSeriesTotal(series.id, null), "Retour à l'automatique impossible.")
            }
            className={buttonClass}
          >
            Rendre au job
          </button>
        )}
      </div>
      <label className="flex items-center gap-2">
        <span className="w-12">Statut</span>
        <select
          value={series.statusSource === 'manual' ? (series.publicationStatus ?? '') : ''}
          disabled={busy}
          onChange={(e) =>
            run(
              () =>
                setSeriesStatus(
                  series.id,
                  e.target.value === 'ongoing' || e.target.value === 'finished'
                    ? e.target.value
                    : null,
                ),
              "Impossible d'enregistrer le statut.",
            )
          }
          className="rounded border border-line-strong px-2 py-1"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {message && <FormMessage kind="error">{message}</FormMessage>}
    </li>
  )
}
