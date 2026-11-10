import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import { Icon } from '../../components/icons'
import PageLayout from '../../components/PageLayout'
import { CoverImage } from '../collection/AlbumCard'
import { useAsync } from '../collection/useAsync'
import { addCatalogueEdition } from '../series/api'
import { MIN_QUERY_LENGTH, searchCatalogue, type SearchHit } from './api'

const DEBOUNCE_MS = 250

const smallButton =
  'rounded border border-line-strong px-2.5 py-1 text-xs font-medium hover:border-accent disabled:opacity-50'

export default function SearchPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  // La recherche part un instant après la dernière frappe
  const [debounced, setDebounced] = useState(query)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(() => searchCatalogue(debounced), [debounced])
  const { data, loading, error } = useAsync(load)
  // Statuts modifiés depuis les résultats (ajout en un clic), sans relancer la recherche
  const [added, setAdded] = useState<Record<string, 'owned' | 'wanted'>>({})
  const [busyIsbn, setBusyIsbn] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const tooShort = query.trim().length < MIN_QUERY_LENGTH
  const total =
    (data?.series.length ?? 0) + (data?.albums.length ?? 0) + (data?.authors.length ?? 0)

  async function add(hit: SearchHit, status: 'owned' | 'wanted') {
    if (!user || !hit.isbn) return
    setBusyIsbn(hit.isbn)
    setFailure(null)
    try {
      await addCatalogueEdition(user.id, hit.isbn, status)
      setAdded((current) => ({ ...current, [hit.isbn!]: status }))
    } catch {
      setFailure("Impossible d'ajouter cet album.")
    }
    setBusyIsbn(null)
  }

  return (
    <PageLayout title="Recherche">
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="search-field flex items-center gap-3 rounded border border-line-strong px-4 py-3 focus-within:border-accent">
          <Icon name="search" />
          <label htmlFor="search-input" className="sr-only">
            Rechercher une série, un album, un auteur ou un ISBN
          </label>
          <input
            id="search-input"
            ref={input}
            type="search"
            value={query}
            onChange={(e) => {
              setFailure(null)
              setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
            }}
            placeholder="Série, album, auteur ou ISBN…"
            className="min-w-0 flex-1 border-0 bg-transparent text-lg outline-none"
            autoComplete="off"
          />
        </div>

        {failure && <FormMessage kind="error">{failure}</FormMessage>}
        {error && <FormMessage kind="error">La recherche a échoué. Réessayez.</FormMessage>}

        {tooShort && (
          <p className="text-muted">
            Tapez au moins {MIN_QUERY_LENGTH} caractères. Les accents et les majuscules n'ont pas
            d'importance : « crepuscule dieux » trouve « Le Crépuscule des Dieux ».
          </p>
        )}
        {!tooShort && loading && !data && <p className="text-muted">Recherche…</p>}
        {!tooShort && !loading && !error && data && total === 0 && (
          <div className="card flex flex-col items-start gap-3 p-5">
            <p>
              Aucun résultat pour <strong>« {debounced} »</strong>.
            </p>
            <Link
              to="/collection/ajouter"
              className="rounded bg-accent px-4 py-2 font-medium text-on-accent"
            >
              Ajouter un album par son ISBN
            </Link>
          </div>
        )}

        {!tooShort && data && data.series.length > 0 && (
          <section aria-labelledby="res-series" className="flex flex-col gap-3">
            <h2 id="res-series" className="text-xl">
              Séries
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.series.map((hit) => (
                <li key={hit.ref}>
                  <Link
                    to={`/series/${hit.ref}`}
                    className="card flex items-center gap-3 p-3 hover:border-accent"
                  >
                    <CoverImage
                      coverUrl={hit.coverUrl}
                      title={hit.label}
                      className="aspect-[2/3] w-12 flex-none rounded"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{hit.label}</span>
                      <span className="block text-sm text-muted">{hit.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!tooShort && data && data.albums.length > 0 && (
          <section aria-labelledby="res-albums" className="flex flex-col gap-3">
            <h2 id="res-albums" className="text-xl">
              Albums
            </h2>
            <ul className="flex flex-col gap-2">
              {data.albums.map((hit) => {
                const status = hit.isbn ? (added[hit.isbn] ?? hit.myStatus) : hit.myStatus
                const target = status
                  ? `/collection/${hit.isbn}`
                  : hit.seriesId
                    ? `/series/${hit.seriesId}`
                    : null
                const body = (
                  <>
                    <CoverImage
                      coverUrl={hit.coverUrl}
                      title={hit.label}
                      className="aspect-[2/3] w-10 flex-none rounded"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{hit.label}</span>
                      <span className="block truncate text-sm text-muted">{hit.detail}</span>
                    </span>
                  </>
                )
                return (
                  <li key={hit.ref} className="card flex items-center gap-3 p-3">
                    {target ? (
                      <Link to={target} className="flex min-w-0 flex-1 items-center gap-3">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                    )}
                    {status ? (
                      <span className="badge badge-accent flex-none">
                        {status === 'owned' ? 'Possédé' : 'Envie'}
                      </span>
                    ) : (
                      <div className="flex flex-none gap-2">
                        <button
                          type="button"
                          disabled={busyIsbn === hit.isbn}
                          onClick={() => add(hit, 'owned')}
                          className={smallButton}
                        >
                          + Possédé
                        </button>
                        <button
                          type="button"
                          disabled={busyIsbn === hit.isbn}
                          onClick={() => add(hit, 'wanted')}
                          className={smallButton}
                        >
                          + Envie
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {!tooShort && data && data.authors.length > 0 && (
          <section aria-labelledby="res-auteurs" className="flex flex-col gap-3">
            <h2 id="res-auteurs" className="text-xl">
              Auteurs
            </h2>
            <ul className="flex flex-wrap gap-2">
              {data.authors.map((hit) => (
                <li key={hit.ref}>
                  <button
                    type="button"
                    onClick={() => setParams({ q: hit.label }, { replace: true })}
                    className="chip hover:border-accent"
                    title="Voir les albums de cet auteur"
                  >
                    {hit.label} · {hit.detail}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  )
}
