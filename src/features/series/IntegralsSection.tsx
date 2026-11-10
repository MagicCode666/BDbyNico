import { Link } from 'react-router-dom'

import { CoverImage } from '../collection/AlbumCard'
import { coveredVolumes, rangeLabel, volumeListLabel } from '../collection/kinds'
import type { SeriesView } from './buildView'

interface Props {
  integrals: SeriesView['integrals']
  /** Nombre de tomes de la série (pour une intégrale qui reprend toute la série). */
  total: number
  /** Tomes que l'utilisateur a déjà exclus de sa liste. */
  ignored: number[]
  /** Tomes que l'utilisateur possède (jamais proposés à l'exclusion). */
  ownedVolumes: number[]
  busy: boolean
  onAdd: (isbn: string, status: 'owned' | 'wanted') => void
  onIgnoreMany: (volumes: number[]) => void
}

const buttonClass =
  'rounded border border-line-strong px-2 py-1 text-xs font-medium hover:border-accent disabled:opacity-50'

/**
 * Intégrales, coffrets et hors-séries de la série. Ce sont des objets distincts des tomes qu'ils
 * reprennent : posséder l'intégrale ne compte pas pour ses tomes. On peut en revanche exclure de
 * sa liste les tomes unitaires qu'elle reprend, ce qui compte pour une série complète.
 */
export default function IntegralsSection({
  integrals,
  total,
  ignored,
  ownedVolumes,
  busy,
  onAdd,
  onIgnoreMany,
}: Props) {
  if (integrals.length === 0) return null
  const ignoredSet = new Set(ignored)
  const ownedSet = new Set(ownedVolumes)

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Intégrales, coffrets et hors-séries</h2>
      <ul className="flex flex-col gap-3">
        {integrals.map(({ edition, item }) => {
          const isIntegral = edition.kind === 'integral'
          const covered = isIntegral
            ? coveredVolumes(edition.volumeFrom, edition.volumeTo, total)
            : []
          // Tomes que cette intégrale reprend et que l'on peut encore exclure de sa liste
          const excludable = covered.filter(
            (volume) => !ignoredSet.has(volume) && !ownedSet.has(volume),
          )
          const allExcluded = covered.length > 0 && excludable.length === 0
          return (
            <li key={edition.isbn} className="flex gap-3 rounded border border-line p-2 text-sm">
              <CoverImage
                coverUrl={edition.coverUrl}
                title={edition.title}
                className="aspect-[2/3] w-14 shrink-0 rounded"
              />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {item ? (
                    <Link to={`/collection/${edition.isbn}`} className="text-accent-text underline">
                      {edition.title}
                    </Link>
                  ) : (
                    edition.title
                  )}
                </p>
                <p className="text-xs text-muted">
                  {isIntegral
                    ? `Intégrale · ${rangeLabel(edition.volumeFrom, edition.volumeTo)}`
                    : 'Hors-série'}
                  {edition.volume !== null && ` · n° ${edition.volume}`}
                  {' · '}
                  {item ? (item.status === 'owned' ? 'possédée' : 'envie') : 'non possédée'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {!item && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdd(edition.isbn, 'owned')}
                        className={buttonClass}
                      >
                        + Possédée
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdd(edition.isbn, 'wanted')}
                        className={buttonClass}
                      >
                        + Envie
                      </button>
                    </>
                  )}
                  {item?.status === 'owned' && excludable.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onIgnoreMany(excludable)}
                      className={buttonClass}
                    >
                      Exclure de ma liste les tomes {volumeListLabel(excludable)}
                    </button>
                  )}
                  {item?.status === 'owned' && allExcluded && (
                    <span className="text-xs text-muted">
                      Tomes unitaires exclus de votre liste
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
