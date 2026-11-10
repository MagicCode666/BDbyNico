import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import SubmitButton from '../../components/SubmitButton'
import TextField from '../../components/TextField'
import { deleteEntry, updateEntry } from './api'
import { DEDICATION_LABELS, STATUS_LABELS, type Dedication, type Entry, type Status } from './types'

const selectClass = 'rounded border border-line-strong bg-surface px-3 py-2'

/** « Dans ma collection » : statut, lecture, dédicace, prix, état et notes d'un album que j'ai. */
export default function AlbumCollectionCard({ entry }: { entry: Entry }) {
  const navigate = useNavigate()
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
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="ma-collection">
      <h2 id="ma-collection" className="font-display text-xl font-bold uppercase tracking-wide">
        Dans ma collection
      </h2>

      {/* Le message « enregistré » disparaît dès qu'on modifie à nouveau un champ */}
      <form
        onSubmit={onSubmit}
        onChange={() => setSaved(false)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Statut
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className={selectClass}
          >
            {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="dedication" className="text-sm font-medium">
              Dédicace
            </label>
            <select
              id="dedication"
              value={dedication}
              onChange={(e) => setDedication(e.target.value as Dedication | '')}
              className={selectClass}
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
            label="Prix payé (€)"
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
            className="rounded border border-line-strong bg-surface px-3 py-2 focus:border-accent focus:outline-none"
          />
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        {saved && <FormMessage kind="success">Modifications enregistrées.</FormMessage>}
        <SubmitButton busy={busy}>Enregistrer</SubmitButton>
      </form>

      <div className="border-t border-line pt-4">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Retirer cet album de votre collection ?</span>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded bg-danger px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              Oui, retirer
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded border border-line-strong px-3 py-1 text-sm"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-danger-text underline"
          >
            Retirer de ma collection
          </button>
        )}
      </div>
    </section>
  )
}
