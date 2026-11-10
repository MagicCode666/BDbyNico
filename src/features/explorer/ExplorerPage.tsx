import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { CoverImage } from '../collection/AlbumCard'
import { useAsync } from '../collection/useAsync'
import { genreLabel, GENRES, isGenreId } from '../series/genres'
import { PUBLICATION_LABELS } from '../series/status'
import { listSeriesByGenre } from './api'

export default function ExplorerPage() {
  const [params] = useSearchParams()
  const requested = params.get('genre') ?? ''
  const genre = isGenreId(requested) ? requested : null

  return (
    <PageLayout
      title="Explorer"
      crumbs={[
        { label: 'Accueil', to: '/' },
        { label: 'Explorer', to: genre ? '/explorer' : undefined },
        ...(genre ? [{ label: genreLabel(genre) }] : []),
      ]}
    >
      <nav aria-label="Genres" className="mb-6 flex flex-wrap gap-2">
        {GENRES.map(({ id, label }) => (
          <Link
            key={id}
            to={`/explorer?genre=${id}`}
            aria-current={genre === id ? 'page' : undefined}
            className={`chip hover:border-accent ${genre === id ? 'border-accent bg-raised text-fg' : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {genre ? (
        <GenreSeries genre={genre} />
      ) : (
        <p className="text-muted">
          Choisissez un genre pour parcourir les séries du catalogue qui le portent.
        </p>
      )}
    </PageLayout>
  )
}

function GenreSeries({ genre }: { genre: string }) {
  const load = useCallback(() => listSeriesByGenre(genre), [genre])
  const { data, loading, error } = useAsync(load)

  if (error) return <FormMessage kind="error">Impossible de charger ce genre.</FormMessage>
  if (!data && loading) return <p className="text-muted">Chargement…</p>
  if (!data || data.length === 0) {
    return (
      <p className="text-muted">
        Aucune série n'est encore classée « {genreLabel(genre)} ». Les genres sont attribués par les
        modérateurs, depuis la page de chaque série.
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((series) => (
        <li key={series.id}>
          <Link to={`/series/${series.id}`} className="card-lift flex h-full flex-col gap-2 p-3">
            <div className="cover-art aspect-[2/3] w-full">
              <CoverImage
                coverUrl={series.coverUrl}
                title={series.name}
                className="aspect-[2/3] w-full rounded"
              />
            </div>
            <span className="font-semibold leading-tight">{series.name}</span>
            <span className="text-xs text-muted">
              {series.owned > 0
                ? `${series.owned}${series.totalVolumes ? ` / ${series.totalVolumes}` : ''} tomes à moi`
                : series.totalVolumes
                  ? `${series.totalVolumes} tomes`
                  : 'Pas dans ma collection'}
              {series.publicationStatus ? ` · ${PUBLICATION_LABELS[series.publicationStatus]}` : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
