import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { CoverImage } from '../collection/AlbumCard'
import { useAsync } from '../collection/useAsync'
import {
  addCatalogueEdition,
  getSeriesData,
  saveSeriesSettings,
  setItemStatus,
  type SeriesData,
} from './api'
import { buildSeriesView, type Slot } from './buildView'
import { effectiveStatus, PUBLICATION_LABELS, type PublicationStatus } from './status'
import { useMissingCovers } from './useMissingCovers'

const buttonClass =
  'rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:border-indigo-600 disabled:opacity-50'

export default function SeriesPage() {
  const { seriesId = '' } = useParams()
  const load = useCallback(() => getSeriesData(seriesId), [seriesId])
  const { data, loading, error, reload } = useAsync(load)

  return (
    <PageLayout title={data?.series.name ?? 'Série'}>
      {!data && loading && <p className="text-slate-600">Chargement…</p>}
      {error && !data && <FormMessage kind="error">Impossible de charger cette série.</FormMessage>}
      {!data && !loading && !error && (
        <p className="text-slate-600">
          Série introuvable.{' '}
          <Link to="/collection" className="text-indigo-600 underline">
            Retour à la collection
          </Link>
        </p>
      )}
      {data && <SeriesDetails data={data} reload={reload} />}
    </PageLayout>
  )
}

function SeriesDetails({ data, reload }: { data: SeriesData; reload: () => void }) {
  const { user } = useAuth()
  const { series, editions, items, settings } = data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalInput, setTotalInput] = useState(settings.totalOverride?.toString() ?? '')

  // Couvertures manquantes : recherchées à la première visite, puis enregistrées pour tous
  const { covers, remaining } = useMissingCovers(editions)
  const editionsWithCovers = useMemo(
    () => editions.map((e) => ({ ...e, coverUrl: e.coverUrl ?? covers[e.isbn] ?? null })),
    [editions, covers],
  )

  const view = buildSeriesView({
    total: series.totalVolumes,
    override: settings.totalOverride,
    editions: editionsWithCovers,
    items,
    ignored: settings.ignored,
  })
  const publication = effectiveStatus(settings.statusOverride, series.publicationStatus)
  const ignoredSlots = view.slots.filter((slot) => slot.kind === 'ignored')
  const visibleSlots = view.slots.filter((slot) => slot.kind !== 'ignored')

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
    } catch {
      setError(failure)
    }
    setBusy(false)
  }

  const userId = user?.id
  const ignore = (volume: number) =>
    run(
      () =>
        saveSeriesSettings(userId!, series.id, {
          ...settings,
          ignored: [...settings.ignored, volume],
        }),
      "Impossible d'ignorer ce tome.",
    )
  const restore = (volume: number) =>
    run(
      () =>
        saveSeriesSettings(userId!, series.id, {
          ...settings,
          ignored: settings.ignored.filter((v) => v !== volume),
        }),
      'Impossible de restaurer ce tome.',
    )
  const addEdition = (isbn: string, status: 'owned' | 'wanted') =>
    run(() => addCatalogueEdition(userId!, isbn, status), "Impossible d'ajouter cet album.")
  const markOwned = (itemId: string) =>
    run(() => setItemStatus(itemId, 'owned'), 'Impossible de modifier cet album.')

  function saveTotal(event: FormEvent) {
    event.preventDefault()
    const value = Number(totalInput)
    if (!Number.isInteger(value) || value < 1 || value > 999) {
      return setError('Le total doit être un entier entre 1 et 999.')
    }
    setEditingTotal(false)
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, totalOverride: value }),
      "Impossible d'enregistrer le total.",
    )
  }

  function changeStatus(value: string) {
    const statusOverride = value === 'ongoing' || value === 'finished' ? value : null
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, statusOverride }),
      "Impossible d'enregistrer le statut.",
    )
  }

  function resetTotal() {
    setEditingTotal(false)
    setTotalInput('')
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, totalOverride: null }),
      'Impossible de revenir au total partagé.',
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-3">
          <span className="text-lg font-medium">
            {view.ownedCount} / {view.targetCount} tomes
          </span>
          {view.complete && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-sm font-medium text-green-800">
              {publication === 'ongoing' ? 'À jour' : 'Complète'}
            </span>
          )}
          {publication && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700">
              {PUBLICATION_LABELS[publication]}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-600">
          {settings.totalOverride !== null
            ? `Total personnel : ${settings.totalOverride} tomes${series.totalVolumes ? ` (total partagé : ${series.totalVolumes})` : ''}`
            : view.totalIsEstimate
              ? `Total inconnu : au moins ${view.total} tomes (à confirmer)`
              : `Total : ${view.total} tomes`}
        </p>
        {editingTotal ? (
          <form onSubmit={saveTotal} className="flex items-center gap-2" noValidate>
            <label htmlFor="total" className="text-sm">
              Mon total
            </label>
            <input
              id="total"
              type="number"
              min={1}
              max={999}
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              className="w-24 rounded border border-slate-300 px-2 py-1"
            />
            <button type="submit" disabled={busy} className={buttonClass}>
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditingTotal(false)} className={buttonClass}>
              Annuler
            </button>
          </form>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingTotal(true)} className={buttonClass}>
              Corriger mon total
            </button>
            {settings.totalOverride !== null && (
              <button type="button" onClick={resetTotal} disabled={busy} className={buttonClass}>
                Revenir au total partagé
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="publication-status">Statut de la série</label>
          <select
            id="publication-status"
            value={settings.statusOverride ?? ''}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            <option value="">
              {series.publicationStatus
                ? `Automatique (${PUBLICATION_LABELS[series.publicationStatus].toLowerCase()})`
                : 'Automatique (inconnu)'}
            </option>
            {(Object.keys(PUBLICATION_LABELS) as PublicationStatus[]).map((value) => (
              <option key={value} value={value}>
                {PUBLICATION_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {view.missing.length > 0 && (
          <p className="text-sm text-slate-600">
            Manquent : {view.missing.map((v) => `T${v}`).join(', ')}
          </p>
        )}
      </section>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {remaining > 0 && (
        <p role="status" className="text-sm text-slate-500">
          Récupération des couvertures… ({remaining} restante{remaining > 1 ? 's' : ''})
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visibleSlots.map((slot) => (
          <SlotCard
            key={slot.volume}
            slot={slot}
            seriesName={series.name}
            busy={busy}
            onAdd={addEdition}
            onMarkOwned={markOwned}
            onIgnore={ignore}
          />
        ))}
      </section>

      {view.unnumbered.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Albums sans numéro de tome</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {view.unnumbered.map(({ edition, item }) => (
              <li key={edition.isbn} className="flex items-center gap-2">
                {item ? (
                  <Link to={`/collection/${edition.isbn}`} className="text-indigo-600 underline">
                    {edition.title}
                  </Link>
                ) : (
                  <span>{edition.title}</span>
                )}
                <span className="text-slate-500">
                  {item ? (item.status === 'owned' ? 'possédé' : 'envie') : 'non possédé'}
                </span>
                {!item && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addEdition(edition.isbn, 'wanted')}
                    className={buttonClass}
                  >
                    + Envie
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ignoredSlots.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Ignorés ({ignoredSlots.length})</h2>
          <ul className="flex flex-wrap gap-2">
            {ignoredSlots.map((slot) => (
              <li
                key={slot.volume}
                className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-sm"
              >
                T{slot.volume}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => restore(slot.volume)}
                  className={buttonClass}
                >
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface SlotCardProps {
  slot: Exclude<Slot, { kind: 'ignored' }>
  seriesName: string
  busy: boolean
  onAdd: (isbn: string, status: 'owned' | 'wanted') => void
  onMarkOwned: (itemId: string) => void
  onIgnore: (volume: number) => void
}

function SlotCard({ slot, seriesName, busy, onAdd, onMarkOwned, onIgnore }: SlotCardProps) {
  const label = `T${slot.volume}`

  if (slot.kind === 'owned' || slot.kind === 'wanted') {
    const { edition, item } = slot
    return (
      <div className="flex flex-col gap-1 rounded border border-slate-200 p-2">
        <Link to={`/collection/${edition.isbn}`} className="flex flex-col gap-1">
          <CoverImage
            coverUrl={edition.coverUrl}
            title={edition.title}
            className="aspect-[2/3] w-full rounded"
          />
          <span className="line-clamp-2 text-sm font-medium">{edition.title}</span>
        </Link>
        <span className="text-xs text-slate-600">
          {label} · {slot.kind === 'owned' ? 'Possédé' : 'Envie'}
          {item.read && ' · lu'}
        </span>
        {slot.kind === 'wanted' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkOwned(item.id)}
            className={buttonClass}
          >
            Je l'ai
          </button>
        )}
      </div>
    )
  }

  if (slot.kind === 'missing') {
    const { edition } = slot
    return (
      <div className="flex flex-col gap-1 rounded border border-dashed border-slate-300 p-2">
        <CoverImage
          coverUrl={edition.coverUrl}
          title={edition.title}
          className="aspect-[2/3] w-full rounded opacity-60"
        />
        <span className="line-clamp-2 text-sm font-medium">{edition.title}</span>
        <span className="text-xs text-slate-600">{label} · manquant</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd(edition.isbn, 'owned')}
            className={buttonClass}
          >
            + Possédé
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd(edition.isbn, 'wanted')}
            className={buttonClass}
          >
            + Envie
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onIgnore(slot.volume)}
            className={buttonClass}
          >
            Ignorer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-dashed border-slate-300 p-2">
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded bg-slate-100 p-2 text-center text-xs text-slate-500">
        Tome {slot.volume}
        <br />
        pas encore référencé
      </div>
      <span className="text-xs text-slate-600">{label} · manquant</span>
      <div className="flex flex-wrap gap-1">
        <Link
          to={`/collection/ajouter?serie=${encodeURIComponent(seriesName)}&tome=${slot.volume}`}
          className={buttonClass}
        >
          Ajouter
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onIgnore(slot.volume)}
          className={buttonClass}
        >
          Ignorer
        </button>
      </div>
    </div>
  )
}
