import { Link } from 'react-router-dom'

import type { Entry } from './types'

export function Cover({ entry, className }: { entry: Entry; className?: string }) {
  const { coverUrl, title } = entry.edition
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

export default function AlbumCard({ entry }: { entry: Entry }) {
  const { edition } = entry
  return (
    <Link
      to={`/collection/${edition.isbn}`}
      className="flex flex-col gap-1 rounded border border-slate-200 p-2 hover:border-indigo-600"
    >
      <Cover entry={entry} className="aspect-[2/3] w-full rounded" />
      <span className="line-clamp-2 text-sm font-medium">{edition.title}</span>
      <span className="text-xs text-slate-600">
        {edition.volume !== null && `T${edition.volume}`}
        {entry.read && (edition.volume !== null ? ' · lu' : 'lu')}
      </span>
    </Link>
  )
}
