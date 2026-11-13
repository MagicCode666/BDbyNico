import { useState } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import { formatIsbn } from '../../lib/isbn'
import { governanceErrorMessage, setPrimaryEdition } from '../governance/api'
import type { SeriesData } from '../series/api'
import { CoverImage } from './AlbumCard'
import { isOutsideGrid } from './kinds'

/**
 * Les autres éditions du même tome (autre éditeur, nouvelle couverture, autre ISBN) : même série et
 * même numéro. Chacune a sa fiche ; celles qui sont dans ma collection sont signalées.
 */
export default function OtherEditions({
  data,
  currentIsbn,
  moderator = false,
  onChanged,
}: {
  data: SeriesData
  currentIsbn: string
  /** Un modérateur peut désigner l'édition principale du tome. */
  moderator?: boolean
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = data.editions.find((edition) => edition.isbn === currentIsbn)
  if (!current || current.volume === null || isOutsideGrid(current.kind)) return null
  const others = data.editions.filter(
    (edition) =>
      edition.isbn !== currentIsbn &&
      edition.volume === current.volume &&
      !isOutsideGrid(edition.kind),
  )
  if (others.length === 0) return null
  const hasChoice = current.isPrimary || others.some((edition) => edition.isPrimary)
  const status = new Map(data.items.map((item) => [item.isbn, item.status]))

  async function choose(isbn: string, primary: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setPrimaryEdition(isbn, primary)
      onChanged?.()
    } catch (caught) {
      setError(governanceErrorMessage(caught, 'Impossible de changer l’édition principale.'))
    }
    setBusy(false)
  }

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="autres-editions">
      <h2 id="autres-editions" className="font-display text-xl font-bold uppercase tracking-wide">
        {others.length === 1 ? 'Autre édition de ce tome' : 'Autres éditions de ce tome'}
      </h2>
      <p className="text-sm text-muted">
        {current.isPrimary
          ? 'Cette édition est l’édition principale de ce tome : c’est elle qui le représente dans la série.'
          : others.some((edition) => edition.isPrimary)
            ? 'L’édition principale de ce tome est indiquée ci-dessous.'
            : 'Aucune édition principale n’a été désignée : la série affiche la première trouvée.'}
      </p>
      {moderator && (
        <div className="flex flex-wrap gap-2">
          {!current.isPrimary && (
            <button
              type="button"
              className="rounded border border-line-strong px-3 py-1 text-sm font-medium hover:border-accent disabled:opacity-50"
              disabled={busy}
              onClick={() => void choose(currentIsbn, true)}
            >
              Définir cette édition comme principale
            </button>
          )}
          {hasChoice && (
            <button
              type="button"
              className="rounded border border-line-strong px-3 py-1 text-sm font-medium hover:border-accent disabled:opacity-50"
              disabled={busy}
              onClick={() => void choose(currentIsbn, false)}
            >
              Retirer le choix de l’édition principale
            </button>
          )}
        </div>
      )}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-3">
        {others.map((edition) => {
          const mine = status.get(edition.isbn)
          return (
            <li key={edition.isbn}>
              <Link
                to={`/collection/${edition.isbn}`}
                className="flex items-center gap-3 rounded hover:bg-raised"
              >
                <CoverImage
                  coverUrl={edition.coverUrl}
                  title={edition.title}
                  className="aspect-[2/3] w-14 shrink-0 rounded"
                />
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-medium">{edition.publisher ?? edition.title}</span>
                  {edition.isPrimary && (
                    <span className="text-xs font-semibold text-accent-text">
                      Édition principale
                    </span>
                  )}
                  <span className="text-xs text-muted">ISBN {formatIsbn(edition.isbn)}</span>
                  {mine && (
                    <span className="text-xs text-accent-text">
                      {mine === 'owned' ? 'Dans ma collection' : 'Dans mes envies'}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
