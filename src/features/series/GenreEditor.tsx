import { useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { setSeriesGenres } from '../governance/api'
import { GENRES, MAX_GENRES, genreLabel, type GenreId } from './genres'

interface Props {
  seriesId: string
  genres: GenreId[]
  onChanged: () => void
}

/**
 * Genres d'une série (modérateurs) : on en ajoute depuis la liste, on en retire avec la croix.
 * Chaque changement est enregistré tout de suite, journalisé et annulable.
 */
export default function GenreEditor({ seriesId, genres, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = GENRES.filter(({ id }) => !genres.includes(id))
  const full = genres.length >= MAX_GENRES

  async function apply(next: GenreId[]) {
    setBusy(true)
    setError(null)
    try {
      await setSeriesGenres(seriesId, next)
      onChanged()
    } catch {
      setError('Impossible de modifier les genres.')
    }
    setBusy(false)
  }

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="genres-edition">
      <h2 id="genres-edition" className="text-sm font-semibold">
        Genres de la série ({genres.length} / {MAX_GENRES})
      </h2>
      {genres.length === 0 ? (
        <p className="text-sm text-muted">Aucun genre pour l'instant.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {genres.map((id) => (
            <li key={id} className="chip flex items-center gap-1.5 border-accent bg-raised text-fg">
              {genreLabel(id)}
              <button
                type="button"
                disabled={busy}
                aria-label={`Retirer le genre ${genreLabel(id)}`}
                onClick={() => apply(genres.filter((genre) => genre !== id))}
                className="rounded px-1 leading-none hover:text-danger-text disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">
          {full ? `Maximum de ${MAX_GENRES} genres atteint` : 'Ajouter un genre'}
        </span>
        <select
          value=""
          disabled={busy || full}
          onChange={(event) => {
            if (event.target.value) apply([...genres, event.target.value as GenreId])
          }}
          className="max-w-xs rounded border border-line-strong bg-surface px-3 py-2 disabled:opacity-50"
        >
          <option value="">Choisir dans la liste…</option>
          {available.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </section>
  )
}
