import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import SubmitButton from '../../components/SubmitButton'
import TextField from '../../components/TextField'
import { formatIsbn } from '../../lib/isbn'
import CoverReportDialog from '../governance/CoverReportDialog'
import { Cover } from './AlbumCard'
import { deleteEntry, getEntry, updateEntry } from './api'
import { DEDICATION_LABELS, STATUS_LABELS, type Dedication, type Entry, type Status } from './types'
import { useAsync } from './useAsync'

export default function AlbumPage() {
  const { isbn = '' } = useParams()
  const load = useCallback(() => getEntry(isbn), [isbn])
  const { data: entry, loading, error, reload } = useAsync(load)

  return (
    <PageLayout title="Fiche de l'album">
      {loading && <p className="text-slate-600">Chargement…</p>}
      {error && <FormMessage kind="error">Impossible de charger cet album.</FormMessage>}
      {!loading && !error && !entry && (
        <p className="text-slate-600">
          Cet album n'est pas dans votre collection.{' '}
          <Link to="/collection" className="text-indigo-600 underline">
            Retour à la collection
          </Link>
        </p>
      )}
      {entry && <AlbumDetails key={entry.id} entry={entry} onReload={reload} />}
    </PageLayout>
  )
}

function AlbumDetails({ entry, onReload }: { entry: Entry; onReload: () => void }) {
  const navigate = useNavigate()
  const { edition } = entry
  const [status, setStatus] = useState<Status>(entry.status)
  const [read, setRead] = useState(entry.read)
  const [price, setPrice] = useState(entry.price?.toString() ?? '')
  const [condition, setCondition] = useState(entry.condition ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [acquiredOn, setAcquiredOn] = useState(entry.acquiredOn ?? '')
  const [dedication, setDedication] = useState<Dedication | ''>(entry.dedication ?? '')
  const [dedicationBy, setDedicationBy] = useState(entry.dedicationBy ?? '')
  const [firstEdition, setFirstEdition] = useState(entry.firstEdition)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reportingCover, setReportingCover] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const priceNumber = price.trim() === '' ? null : Number(price.replace(',', '.'))
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) {
      return setError('Le prix doit être un nombre positif.')
    }
    setBusy(true)
    setError(null)
    try {
      await updateEntry(entry.id, {
        status,
        read,
        price: priceNumber,
        condition: condition.trim() || null,
        notes: notes.trim() || null,
        acquiredOn: acquiredOn || null,
        dedication: dedication || null,
        dedicationBy: dedicationBy.trim() || null,
        firstEdition,
      })
      setSaved(true)
    } catch {
      setError("Impossible d'enregistrer les modifications.")
    }
    setBusy(false)
  }

  async function onDelete() {
    setBusy(true)
    try {
      await deleteEntry(entry.id)
      navigate('/collection', { replace: true })
    } catch {
      setError("Impossible de supprimer l'album.")
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
      <div className="flex flex-col items-start gap-2">
        <Cover entry={entry} className="aspect-[2/3] w-48 rounded" />
        <button
          type="button"
          onClick={() => setReportingCover(true)}
          className="text-xs text-slate-600 underline hover:text-indigo-600"
        >
          Cette couverture n'est pas bonne
        </button>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">{edition.title}</h2>
          <p className="text-sm text-slate-600">
            {[
              edition.series &&
                `${edition.series.name}${edition.volume !== null ? ` · tome ${edition.volume}` : ''}`,
              edition.authors.join(', '),
              edition.publisher,
              edition.publishedOn,
              `ISBN ${formatIsbn(edition.isbn)}`,
            ]
              .filter(Boolean)
              .join(' — ')}
          </p>
        </div>

        {edition.pending && (
          <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-800">
            Cet album est en attente de validation : il n'est visible que de vous pour l'instant.
          </p>
        )}

        {/* Le message « enregistré » disparaît dès qu'on modifie à nouveau un champ */}
        <form
          onSubmit={onSubmit}
          onChange={() => setSaved(false)}
          noValidate
          className="flex max-w-lg flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-sm font-medium">
              Statut
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
            Lu
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={firstEdition}
              onChange={(e) => setFirstEdition(e.target.checked)}
            />
            Édition originale
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="dedication" className="text-sm font-medium">
                Dédicace
              </label>
              <select
                id="dedication"
                value={dedication}
                onChange={(e) => setDedication(e.target.value as Dedication | '')}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Aucune</option>
                {(Object.keys(DEDICATION_LABELS) as Dedication[]).map((value) => (
                  <option key={value} value={value}>
                    {DEDICATION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            {dedication && (
              <TextField
                label="Dédicacé par"
                name="dedicationBy"
                placeholder="Auteur ou artiste"
                maxLength={100}
                value={dedicationBy}
                onChange={(e) => setDedicationBy(e.target.value)}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Prix (€)"
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <TextField
              label="Date d'achat"
              name="acquiredOn"
              type="date"
              value={acquiredOn}
              onChange={(e) => setAcquiredOn(e.target.value)}
            />
          </div>
          <TextField
            label="État"
            name="condition"
            placeholder="Neuf, bon, abîmé…"
            maxLength={50}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 focus:border-indigo-600 focus:outline-none"
            />
          </div>
          {error && <FormMessage kind="error">{error}</FormMessage>}
          {saved && <FormMessage kind="success">Modifications enregistrées.</FormMessage>}
          <SubmitButton busy={busy}>Enregistrer</SubmitButton>
        </form>

        <div className="max-w-lg border-t border-slate-200 pt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm">Retirer cet album de votre collection ?</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
              >
                Oui, retirer
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded border border-slate-300 px-3 py-1 text-sm"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-600 underline"
            >
              Retirer de ma collection
            </button>
          )}
        </div>
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
