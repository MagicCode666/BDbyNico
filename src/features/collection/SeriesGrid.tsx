import { Link } from 'react-router-dom'

import { completionLabel, PUBLICATION_LABELS, type PublicationStatus } from '../series/status'
import { CoverImage } from './AlbumCard'

/** Une carte de la grille : une série (ou un album hors série) et sa progression. */
export interface GridCard {
  key: string
  to: string
  name: string
  coverUrl: string | null
  /** Tomes possédés et objectif ; l'objectif est absent quand le total est inconnu. */
  owned: number
  target: number | null
  albumCount: number
  publication: PublicationStatus | null
  complete: boolean
  showProgress: boolean
}

/** Affichage en grille : une grande couverture par série, détails au survol. */
export default function SeriesGrid({ cards }: { cards: GridCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {cards.map((card) => {
        const ratio = card.target ? Math.min(100, (card.owned / card.target) * 100) : 0
        return (
          <li key={card.key}>
            <Link
              to={card.to}
              aria-label={card.name}
              className="group relative block overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="cover-art aspect-[2/3]">
                <CoverImage
                  coverUrl={card.coverUrl}
                  title={card.name}
                  className="aspect-[2/3] w-full transition duration-200 group-hover:scale-[1.03]"
                />
              </div>

              {card.showProgress && card.target ? (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={card.target}
                  aria-valuenow={Math.min(card.owned, card.target)}
                  aria-label={`Progression de ${card.name}`}
                  className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40"
                >
                  <div
                    className="h-full bg-gradient-to-r from-accent to-accent-text"
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              ) : null}

              {card.complete && (
                <span className="absolute right-2 top-2 rounded bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok backdrop-blur">
                  ✓ {completionLabel(true, card.publication)}
                </span>
              )}

              <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:from-black/80 [@media(hover:none)]:via-transparent">
                {card.publication && (
                  <span className="self-start rounded bg-white/20 px-2 py-0.5 text-xs font-semibold backdrop-blur [@media(hover:none)]:hidden">
                    {PUBLICATION_LABELS[card.publication]}
                  </span>
                )}
                <span className="font-display text-base font-bold leading-tight">{card.name}</span>
                <div className="grid grid-cols-1 rounded bg-black/40 py-1.5 text-center text-xs [@media(hover:none)]:hidden">
                  <span>
                    <strong className="block text-sm">
                      {card.owned}
                      {card.target ? ` / ${card.target}` : ''}
                    </strong>
                    {card.albumCount > 1 || card.owned > 1 ? 'albums' : 'album'}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
