import { Link } from 'react-router-dom'

import { isOutsideGrid, shortKindLabel, toAlbumKind } from './kinds'
import { CoverImage } from './AlbumCard'
import type { SeriesData } from '../series/api'

/** Les albums de la série, en bandeau : celui qu'on regarde est mis en avant, les miens marqués. */
export default function AlbumSeriesStrip({
  data,
  currentIsbn,
}: {
  data: SeriesData
  currentIsbn: string
}) {
  const status = new Map(data.items.map((item) => [item.isbn, item.status]))
  // Tomes dans l'ordre, puis intégrales et hors-séries
  const editions = [...data.editions].sort((a, b) => {
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
          const mine = status.get(edition.isbn)
          const current = edition.isbn === currentIsbn
          const label = isOutsideGrid(edition.kind)
            ? shortKindLabel(toAlbumKind(edition.kind), edition.volumeFrom, edition.volumeTo)
            : edition.volume !== null
              ? `Tome ${edition.volume}`
              : 'Album'
          return (
            <li key={edition.isbn} className="w-24 shrink-0">
              <Link
                to={`/collection/${edition.isbn}`}
                aria-current={current ? 'page' : undefined}
                title={`${edition.title} · ${label}`}
                className="flex flex-col gap-1"
              >
                <div
                  className={`cover-art relative aspect-[2/3] w-24 ${current ? 'ring-2 ring-accent' : mine ? '' : 'opacity-60'}`}
                >
                  <CoverImage
                    coverUrl={edition.coverUrl}
                    title={edition.title}
                    className="aspect-[2/3] w-24 rounded"
                  />
                  {mine && (
                    <span
                      role="img"
                      aria-label={mine === 'owned' ? 'Dans ma collection' : 'Dans mes envies'}
                      className={`absolute right-1 top-1 h-3 w-3 rounded-full border border-bg ${mine === 'owned' ? 'bg-ok' : 'bg-warn'}`}
                    />
                  )}
                </div>
                <span
                  className={`text-center text-xs ${current ? 'font-semibold text-fg' : 'text-muted'}`}
                >
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
