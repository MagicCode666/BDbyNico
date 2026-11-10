import { useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { setSeriesGenres } from '../governance/api'
import { GENRES, MAX_GENRES, type GenreId } from './genres'

interface Props {
  seriesId: string
  genres: GenreId[]
  onChanged: () => void
}

/** Choix des genres d'une série (modérateurs) : trois au plus, changement journalisé et annulable. */
export default function GenreEditor({ seriesId, genres, onChanged }: Props) {
  const [selected, setSelected] = useState<GenreId[]>(genres)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const changed = selected.join() !== genres.join()

  function toggle(id: GenreId) {
    setSaved(false)
    setSelected((current) =>
      current.includes(id)
        ? current.filter((genre) => genre !== id)
        : current.length < MAX_GENRES
          ? [...current, id]
          : current,
    )
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setSeriesGenres(seriesId, selected)
      setSaved(true)
      onChanged()
    } catch {
      setError("Impossible d'enregistrer les genres.")
    }
    setBusy(false)
  }

  return (
    <fieldset className="card flex flex-col gap-3 p-4">
      <legend className="px-1 text-sm font-semibold">
        Genres de la série (modérateur, {MAX_GENRES} au plus)
      </legend>
      <div className="flex flex-wrap gap-2">
        {GENRES.map(({ id, label }) => {
          const on = selected.includes(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={!on && selected.length >= MAX_GENRES}
              onClick={() => toggle(id)}
              className={`chip disabled:opacity-40 ${on ? 'border-accent bg-raised text-fg' : ''}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {saved && !changed && <FormMessage kind="success">Genres enregistrés.</FormMessage>}
      <button
        type="button"
        disabled={busy || !changed}
        onClick={save}
        className="self-start rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        Enregistrer les genres
      </button>
    </fieldset>
  )
}
