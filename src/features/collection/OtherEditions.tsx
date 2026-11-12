import { Link } from 'react-router-dom'

import { formatIsbn } from '../../lib/isbn'
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
}: {
  data: SeriesData
  currentIsbn: string
}) {
  const current = data.editions.find((edition) => edition.isbn === currentIsbn)
  if (!current || current.volume === null || isOutsideGrid(current.kind)) return null
  const others = data.editions.filter(
    (edition) =>
      edition.isbn !== currentIsbn &&
      edition.volume === current.volume &&
      !isOutsideGrid(edition.kind),
  )
  if (others.length === 0) return null
  const status = new Map(data.items.map((item) => [item.isbn, item.status]))

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="autres-editions">
      <h2 id="autres-editions" className="font-display text-xl font-bold uppercase tracking-wide">
        {others.length === 1 ? 'Autre édition de ce tome' : 'Autres éditions de ce tome'}
      </h2>
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
