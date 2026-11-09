import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import SubmitButton from '../../components/SubmitButton'
import TextField from '../../components/TextField'
import { normalizeIsbn } from '../../lib/isbn'
import { addAlbum, AlreadyInCollectionError } from './api'
import { STATUS_LABELS, type Status } from './types'

const optional = (value: string) => value.trim() || undefined

export default function AddAlbumPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isbn, setIsbn] = useState('')
  const [title, setTitle] = useState('')
  const [seriesName, setSeriesName] = useState('')
  const [volume, setVolume] = useState('')
  const [authors, setAuthors] = useState('')
  const [publisher, setPublisher] = useState('')
  const [publishedOn, setPublishedOn] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [status, setStatus] = useState<Status>('owned')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const normalizedIsbn = normalizeIsbn(isbn)
    if (!normalizedIsbn)
      return setError('ISBN invalide (10 ou 13 chiffres, clé de contrôle comprise).')
    if (!title.trim()) return setError('Le titre est obligatoire.')
    const volumeNumber = volume.trim() === '' ? undefined : Number(volume)
    if (volumeNumber !== undefined && (!Number.isInteger(volumeNumber) || volumeNumber < 0)) {
      return setError('Le numéro de tome doit être un entier positif.')
    }
    if (coverUrl.trim() && !/^https?:\/\//.test(coverUrl.trim())) {
      return setError("L'adresse de la couverture doit commencer par http:// ou https://.")
    }

    setBusy(true)
    setError(null)
    try {
      await addAlbum(user.id, {
        isbn: normalizedIsbn,
        title: title.trim(),
        seriesName: optional(seriesName),
        volume: volumeNumber,
        authors: authors
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        publisher: optional(publisher),
        publishedOn: optional(publishedOn),
        coverUrl: optional(coverUrl),
        status,
      })
      navigate(`/collection/${normalizedIsbn}`, { replace: true })
    } catch (e) {
      setError(e instanceof AlreadyInCollectionError ? e.message : "Impossible d'ajouter l'album.")
      setBusy(false)
    }
  }

  return (
    <PageLayout title="Ajouter un album">
      <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
        <TextField
          label="ISBN *"
          name="isbn"
          inputMode="numeric"
          placeholder="978-2-…"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
        />
        <TextField
          label="Titre *"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <TextField
            label="Série"
            name="series"
            value={seriesName}
            onChange={(e) => setSeriesName(e.target.value)}
          />
          <TextField
            label="Tome"
            name="volume"
            type="number"
            min={0}
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
          />
        </div>
        <TextField
          label="Auteurs (séparés par des virgules)"
          name="authors"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Éditeur"
            name="publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
          />
          <TextField
            label="Date de parution"
            name="publishedOn"
            type="date"
            value={publishedOn}
            onChange={(e) => setPublishedOn(e.target.value)}
          />
        </div>
        <TextField
          label="Adresse de la couverture (URL)"
          name="coverUrl"
          type="url"
          placeholder="https://…"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
        />
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
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <SubmitButton busy={busy}>Ajouter</SubmitButton>
      </form>
    </PageLayout>
  )
}
