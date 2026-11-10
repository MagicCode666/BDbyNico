import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { useAccountSummary } from '../../components/shell/useAccountSummary'
import { CoverImage } from '../collection/AlbumCard'
import { listCollection } from '../collection/api'
import { useAsync } from '../collection/useAsync'
import { listSeriesSettings } from '../series/api'
import { GENRES } from '../series/genres'
import { dashboardStats } from './stats'

const NO_SETTINGS = undefined

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="font-display text-4xl font-extrabold leading-none">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}

/** Accueil d'un utilisateur connecté : chiffres clés, séries à compléter et derniers ajouts. */
export default function Dashboard() {
  const summary = useAccountSummary()
  const { data: entries, loading, error } = useAsync(listCollection)
  const { data: settings } = useAsync(listSeriesSettings)
  const stats = useMemo(
    () => (entries ? dashboardStats(entries, settings ?? NO_SETTINGS) : undefined),
    [entries, settings],
  )

  return (
    <PageLayout title="Accueil" hideTitle crumbs={[{ label: 'Accueil' }]}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Bon retour</p>
            <h1 className="title-metal text-4xl">{summary?.pseudo ?? 'Votre collection'}</h1>
          </div>
          <Link
            to="/collection/ajouter"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-strong"
          >
            Ajouter un album
          </Link>
        </header>

        {error && <FormMessage kind="error">Impossible de charger votre collection.</FormMessage>}
        {loading && !stats && <p className="text-muted">Chargement…</p>}

        {stats && stats.owned + stats.wanted === 0 && (
          <section className="card flex flex-col items-start gap-3 p-6">
            <h2 className="font-display text-2xl font-bold">Votre collection est vide</h2>
            <p className="text-muted">
              Ajoutez un album en scannant son code-barres ou en le cherchant, ou importez votre
              collection existante.
            </p>
            <div className="flex gap-3">
              <Link to="/collection/ajouter" className="text-accent-text underline">
                Ajouter un album
              </Link>
              <Link to="/collection/importer" className="text-accent-text underline">
                Importer
              </Link>
            </div>
          </section>
        )}

        {stats && stats.owned + stats.wanted > 0 && (
          <>
            <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile value={stats.owned} label="albums possédés" />
              <Tile value={stats.seriesCount} label="séries" />
              <Tile value={stats.completeCount} label="séries complètes" />
              <Tile value={stats.wanted} label="en envie" />
            </section>

            {stats.inProgress.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="a-completer">
                <h2
                  id="a-completer"
                  className="font-display text-xl font-bold uppercase tracking-wide"
                >
                  Séries à compléter
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.inProgress.slice(0, 6).map((serie) => (
                    <li key={serie.id}>
                      <Link
                        to={`/series/${serie.id}`}
                        className="card-lift flex gap-3 p-3 hover:border-accent"
                      >
                        <div className="cover-art aspect-[2/3] w-14 shrink-0">
                          <CoverImage
                            coverUrl={serie.coverUrl}
                            title={serie.name}
                            className="aspect-[2/3] w-14 rounded"
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                          <span className="truncate font-semibold">{serie.name}</span>
                          <span className="text-xs text-muted">
                            {serie.owned} / {serie.target} tomes · manque
                            {serie.missing.length > 1 ? 'nt' : ''}{' '}
                            {serie.missing
                              .slice(0, 4)
                              .map((volume) => `T${volume}`)
                              .join(', ')}
                            {serie.missing.length > 4 ? '…' : ''}
                          </span>
                          <div
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={serie.target}
                            aria-valuenow={serie.owned}
                            aria-label={`Progression de ${serie.name}`}
                            className="h-1.5 overflow-hidden rounded-sm bg-raised"
                          >
                            <div
                              className="h-full bg-gradient-to-r from-accent to-accent-text"
                              style={{ width: `${(serie.owned / serie.target) * 100}%` }}
                            />
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {stats.recent.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="derniers-ajouts">
                <h2
                  id="derniers-ajouts"
                  className="font-display text-xl font-bold uppercase tracking-wide"
                >
                  Derniers ajouts
                </h2>
                <ul className="flex gap-3 overflow-x-auto pb-2">
                  {stats.recent.map((entry) => (
                    <li key={entry.id} className="w-24 shrink-0">
                      <Link
                        to={`/collection/${entry.edition.isbn}`}
                        title={entry.edition.title}
                        className="flex flex-col gap-1"
                      >
                        <div className="cover-art aspect-[2/3] w-24">
                          <CoverImage
                            coverUrl={entry.edition.coverUrl}
                            title={entry.edition.title}
                            className="aspect-[2/3] w-24 rounded"
                          />
                        </div>
                        <span className="line-clamp-2 text-xs text-muted">
                          {entry.edition.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="explorer-genres">
          <h2
            id="explorer-genres"
            className="font-display text-xl font-bold uppercase tracking-wide"
          >
            Explorer par genre
          </h2>
          <ul className="flex flex-wrap gap-2">
            {GENRES.map(({ id, label }) => (
              <li key={id}>
                <Link to={`/explorer?genre=${id}`} className="chip hover:border-accent">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageLayout>
  )
}
