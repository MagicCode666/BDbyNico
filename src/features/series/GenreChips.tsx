import { Link } from 'react-router-dom'

import { genreLabel } from './genres'

/** Genres d'une série, chacun menant à la page Explorer filtrée sur ce genre. */
export default function GenreChips({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Genres">
      {genres.map((genre) => (
        <li key={genre}>
          <Link to={`/explorer?genre=${genre}`} className="chip hover:border-accent">
            {genreLabel(genre)}
          </Link>
        </li>
      ))}
    </ul>
  )
}
