import { useState } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import type { SeriesData } from '../series/api'
import { representativeEditions } from '../series/buildView'
import { CoverImage } from './AlbumCard'
import CollectionStateButton from './CollectionStateButton'
import { isOutsideGrid, shortKindLabel, toAlbumKind } from './kinds'

/**
 * Les albums de la série, en bandeau : celui qu'on regarde est mis en avant. Chaque couverture porte
 * le bouton d'état commun (coche, cœur ou plus).
 */
export default function AlbumSeriesStrip({
  data,
  currentIsbn,
  userId,
  onChanged,
}: {
  data: SeriesData
  currentIsbn: string
  userId?: string
  onChanged?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const itemByIsbn = new Map(data.items.map((item) => [item.isbn, item]))
  // Tomes dans l'ordre, puis intégrales et hors-séries
  // Un seul album par tome : l'édition principale (les autres sont sur la fiche, « Autres
  // éditions »), sauf celle qu'on regarde, qui garde la place de son tome
  const shown = new Map(representativeEditions(data.editions))
  const watched = data.editions.find((edition) => edition.isbn === currentIsbn)
  if (watched?.volume != null && shown.has(watched.volume) && !isOutsideGrid(watched.kind)) {
    shown.set(watched.volume, watched)
  }
  const tomes = new Set(shown.values())
  const editions = data.editions
    .filter(
      (edition) => isOutsideGrid(edition.kind) || edition.volume === null || tomes.has(edition),
    )
    .sort((a, b) => {
      const outA = isOutsideGrid(a.kind) ? 1 : 0
      const outB = isOutsideGrid(b.kind) ? 1 : 0
      return outA - outB || (a.volume ?? 9999) - (b.volume ?? 9999)
    })
  if (editions.length < 2) return null

  return (
    <section className="flex flex-col gap-3" aria-labelledby="dans-la-serie">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dans-la-serie" className="font-display text-xl font-bold uppercase tracking-wide">
          Dans la série
        </h2>
        <Link to={`/series/${data.series.id}`} className="text-sm text-accent-text underline">
          Voir toute la série « {data.series.name} »
        </Link>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {editions.map((edition) => {
          const item = itemByIsbn.get(edition.isbn) ?? null
          const current = edition.isbn === currentIsbn
          const label = isOutsideGrid(edition.kind)
            ? shortKindLabel(toAlbumKind(edition.kind), edition.volumeFrom, edition.volumeTo)
            : edition.volume !== null
              ? `Tome ${edition.volume}`
              : 'Album'
          return (
            <li key={edition.isbn} className="relative w-24 shrink-0">
              <Link
                to={`/collection/${edition.isbn}`}
                aria-current={current ? 'page' : undefined}
                title={`${edition.title} · ${label}`}
                className="flex flex-col gap-1"
              >
                <div
                  className={`cover-art relative aspect-[2/3] w-24 ${current ? 'ring-2 ring-accent' : item ? '' : 'opacity-60'}`}
                >
                  <CoverImage
                    coverUrl={edition.coverUrl}
                    title={edition.title}
                    className="aspect-[2/3] w-24 rounded"
                  />
                </div>
                <span
                  className={`text-center text-xs ${current ? 'font-semibold text-fg' : 'text-muted'}`}
                >
                  {label}
                </span>
              </Link>
              {userId && (
                <CollectionStateButton
                  userId={userId}
                  isbn={edition.isbn}
                  title={`${label} · ${edition.title}`}
                  item={item}
                  size="sm"
                  onChanged={() => onChanged?.()}
                  onError={setError}
                />
              )}
            </li>
          )
        })}
      </ul>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </section>
  )
}
