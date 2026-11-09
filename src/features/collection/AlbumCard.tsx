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
      className={`bg-slate-100 object-cover ${className ?? ''}`}
    />
  ) : (
    <div
      role="img"
      aria-label={`Pas de couverture pour ${title}`}
      className={`flex items-center justify-center bg-slate-200 p-2 text-center text-xs text-slate-500 ${className ?? ''}`}
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

/** Petite vignette cliquable d'un album : couverture et numéro de tome. */
export function AlbumThumb({ entry }: { entry: Entry }) {
  const { edition } = entry
  return (
    <Link
      to={`/collection/${edition.isbn}`}
      title={`${edition.title}${entry.read ? ' (lu)' : ''}`}
      className="flex w-16 shrink-0 flex-col gap-1 hover:opacity-80"
    >
      <Cover entry={entry} className="aspect-[2/3] w-16 rounded" />
      <span className="text-center text-[10px] text-slate-500">
        {edition.volume !== null ? `T${edition.volume}` : '·'}
        {entry.read && ' · lu'}
      </span>
    </Link>
  )
}
