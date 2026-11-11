import { shortKindLabel } from './kinds'
import { Link } from 'react-router-dom'

import type { Entry } from './types'

interface CoverImageProps {
  coverUrl: string | null
  title: string
  className?: string
}

/** Couverture d'un album, ou une vignette avec son titre quand on n'en a pas. */
export function CoverImage({ coverUrl, title, className }: CoverImageProps) {
  return coverUrl ? (
    <img
      src={coverUrl}
      alt={`Couverture de ${title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`bg-raised object-cover ${className ?? ''}`}
    />
  ) : (
    <div
      role="img"
      aria-label={`Pas de couverture pour ${title}`}
      className={`flex items-center justify-center bg-raised p-2 text-center text-xs text-muted ${className ?? ''}`}
    >
      {title}
    </div>
  )
}

export function Cover({ entry, className }: { entry: Entry; className?: string }) {
  return (
    <CoverImage
      coverUrl={entry.edition.coverUrl}
      title={entry.edition.title}
      className={className}
    />
  )
}

/** Petite vignette cliquable d'un album : couverture, repère de dédicace et numéro de tome. */
export function AlbumThumb({ entry }: { entry: Entry }) {
  const { edition } = entry
  const dedication = entry.dedication
    ? `dédicacé${entry.dedication === 'drawing' ? ' (dessin)' : ' (signature)'}`
    : null
  return (
    <Link
      to={`/collection/${edition.isbn}`}
      title={`${edition.title}${dedication ? `, ${dedication}` : ''}`}
      className="flex w-16 shrink-0 flex-col gap-1 hover:opacity-80"
    >
      <div className="cover-art relative">
        <Cover entry={entry} className="aspect-[2/3] w-16 rounded" />
        {dedication && (
          <span
            role="img"
            aria-label={dedication}
            className={`absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-on-accent shadow ${entry.dedication === 'drawing' ? 'bg-warn' : 'bg-steel'}`}
          >
            ✎
          </span>
        )}
      </div>
      <span className="text-center text-[10px] text-muted">
        {edition.kind === 'integral' || edition.kind === 'special'
          ? shortKindLabel(edition.kind, edition.volumeFrom, edition.volumeTo)
          : edition.volume !== null
            ? `T${edition.volume}`
            : '·'}
      </span>
    </Link>
  )
}
