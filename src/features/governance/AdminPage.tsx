import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { CoverImage } from '../collection/AlbumCard'
import { useAsync } from '../collection/useAsync'
import {
  governanceErrorMessage,
  listChanges,
  listUsers,
  reviewChange,
  revertChange,
  setContribution,
  type AdminUser,
  type Change,
  type ChangeOrigin,
  type ChangeStatus,
  type Contribution,
} from './api'
import { describeChange } from './describe'
import SeriesTab from './SeriesTab'
import { useAccess } from './useAccess'

type Tab = 'pending' | 'journal' | 'series' | 'users'

const STATUS_LABELS: Record<ChangeStatus, string> = {
  applied: 'Appliqué',
  pending: 'En attente',
  rejected: 'Refusé',
  reverted: 'Annulé',
}
const ORIGIN_LABELS: Record<ChangeOrigin, string> = {
  user: 'Utilisateur',
  import: 'Import',
  job: 'Job automatique',
  admin: 'Modérateur',
}
const KIND_LABELS = {
  create: 'Création',
  cover: 'Couverture',
  edition_kind: "Type d'album",
  series_name: 'Série renommée',
  series_total: 'Total de série',
  series_status: 'Statut de série',
  series_genres: 'Genres de série',
  series_merge: 'Fusion de séries',
  edition_title: "Titre d'album",
  edition_volume: 'Numéro de tome',
  edition_authors: 'Auteurs',
  edition_publisher: 'Éditeur',
  edition_date: 'Date de parution',
  edition_series: "Série d'un album",
  edition_isbn: 'ISBN corrigé',
  edition_merge: "Fusion d'éditions",
} as const
const CONTRIBUTION_LABELS: Record<Contribution, string> = {
  full: 'Contributeur',
  collection_only: 'Collection seule',
}

const buttonClass =
  'rounded border border-line-strong px-2 py-1 text-xs font-medium hover:border-accent disabled:opacity-50'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export default function AdminPage() {
  const { access, loading } = useAccess()
  const [tab, setTab] = useState<Tab>('pending')

  if (loading) {
    return (
      <PageLayout title="Administration">
        <p className="text-muted">Chargement…</p>
      </PageLayout>
    )
  }
  if (!access.isModerator) {
    return (
      <PageLayout title="Administration">
        <p className="text-muted">
          Cette page est réservée aux modérateurs.{' '}
          <Link to="/collection" className="text-accent-text underline">
            Retour à la collection
          </Link>
        </p>
      </PageLayout>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pending', label: 'À valider' },
    { id: 'journal', label: 'Journal' },
    { id: 'series', label: 'Séries' },
    ...(access.isAdmin ? [{ id: 'users' as const, label: 'Utilisateurs' }] : []),
  ]

  return (
    <PageLayout title="Administration du catalogue">
      <div role="tablist" className="mb-4 flex gap-2">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1 text-sm font-medium ${tab === id ? 'bg-accent text-on-accent' : 'border border-line-strong'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'pending' && <ChangeList mode="pending" />}
      {tab === 'journal' && <ChangeList mode="journal" />}
      {tab === 'series' && <SeriesTab />}
      {tab === 'users' && access.isAdmin && <UsersTab />}
    </PageLayout>
  )
}

/** Changements qui se refont à la main plutôt que de s'annuler. */
const IRREVERSIBLE = new Set<string>(['series_merge', 'edition_isbn', 'edition_merge'])

const isSeriesChange = (change: Change) => change.kind.startsWith('series_')

/** On n'annule un changement que si l'album ou la série existe encore. */
const canRevert = (change: Change) =>
  !IRREVERSIBLE.has(change.kind) &&
  (isSeriesChange(change) ? change.seriesName !== null : change.title !== null)

function CoverPair({ change }: { change: Change }) {
  const label = change.title ?? change.isbn
  return (
    <div className="flex items-center gap-2">
      <figure className="flex flex-col items-center gap-1">
        <CoverImage
          coverUrl={change.oldValue}
          title={`${label} (avant)`}
          className="aspect-[2/3] w-14 rounded"
        />
        <figcaption className="text-[10px] text-muted">avant</figcaption>
      </figure>
      <span aria-hidden="true">→</span>
      <figure className="flex flex-col items-center gap-1">
        <CoverImage
          coverUrl={change.newValue}
          title={`${label} (après)`}
          className="aspect-[2/3] w-14 rounded"
        />
        <figcaption className="text-[10px] text-muted">après</figcaption>
      </figure>
    </div>
  )
}

function ChangeList({ mode }: { mode: 'pending' | 'journal' }) {
  const [hideJob, setHideJob] = useState(true)
  const [status, setStatus] = useState<ChangeStatus | ''>('')
  const [userId, setUserId] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [extra, setExtra] = useState<Change[]>([])
  const [exhausted, setExhausted] = useState(false)

  const load = useCallback(
    () =>
      listChanges({
        status: mode === 'pending' ? 'pending' : status || undefined,
        userId: userId || undefined,
        hideJob: mode === 'journal' && hideJob,
      }),
    [mode, status, userId, hideJob],
  )
  const { data, loading, error: loadError, reload } = useAsync(load)

  // Le filtre « utilisateur » se choisit parmi les auteurs déjà vus dans la liste
  const authors = new Map<string, string>()
  for (const change of [...(data ?? []), ...extra]) {
    if (change.userId && change.pseudo) authors.set(change.userId, change.pseudo)
  }

  async function act(change: Change, action: () => Promise<void>, failure: string) {
    setBusyId(change.id)
    setError(null)
    try {
      await action()
      setExtra([])
      setExhausted(false)
      reload()
    } catch (e) {
      setError(governanceErrorMessage(e, failure))
    }
    setBusyId(null)
  }

  async function loadMore() {
    const rows = [...(data ?? []), ...extra]
    const last = rows[rows.length - 1]
    if (!last) return
    try {
      const more = await listChanges({
        status: mode === 'pending' ? 'pending' : status || undefined,
        userId: userId || undefined,
        hideJob: mode === 'journal' && hideJob,
        before: last.id,
      })
      setExtra((current) => [...current, ...more])
      if (more.length < 50) setExhausted(true)
    } catch {
      setError('Impossible de charger la suite du journal.')
    }
  }

  const rows = [...(data ?? []), ...extra]

  return (
    <div className="flex flex-col gap-3">
      {mode === 'journal' && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            Statut
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ChangeStatus | '')
                setExtra([])
                setExhausted(false)
              }}
              className="rounded border border-line-strong px-2 py-1"
            >
              <option value="">Tous</option>
              {(Object.keys(STATUS_LABELS) as ChangeStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Utilisateur
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value)
                setExtra([])
                setExhausted(false)
              }}
              className="rounded border border-line-strong px-2 py-1"
            >
              <option value="">Tous</option>
              {[...authors].map(([id, pseudo]) => (
                <option key={id} value={id}>
                  {pseudo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={hideJob}
              onChange={(e) => {
                setHideJob(e.target.checked)
                setExtra([])
                setExhausted(false)
              }}
            />
            Masquer le job automatique
          </label>
        </div>
      )}

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {loadError && <FormMessage kind="error">Impossible de charger la liste.</FormMessage>}
      {loading && rows.length === 0 && <p className="text-muted">Chargement…</p>}
      {!loading && !loadError && rows.length === 0 && (
        <p className="text-muted">
          {mode === 'pending' ? 'Aucune proposition en attente.' : 'Aucun changement.'}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((change) => {
          const busy = busyId === change.id
          return (
            <li key={change.id} className="flex flex-col gap-2 rounded border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {KIND_LABELS[change.kind]} ·{' '}
                  {isSeriesChange(change) ? (
                    (change.seriesName ?? <span className="text-muted">série supprimée</span>)
                  ) : (
                    <>
                      {change.title ?? <span className="text-muted">album supprimé</span>}
                      {change.seriesName &&
                        ` (${change.seriesName}${change.volume !== null ? ` T${change.volume}` : ''})`}
                    </>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {dateFormat.format(new Date(change.createdAt))}
                </span>
              </div>
              <p className="text-xs text-muted">
                {change.pseudo ?? ORIGIN_LABELS[change.origin]}
                {change.pseudo &&
                  change.origin !== 'user' &&
                  ` (${ORIGIN_LABELS[change.origin]})`}{' '}
                · {STATUS_LABELS[change.status]}
                {change.reviewedPseudo && ` par ${change.reviewedPseudo}`}
                {change.revertsId && ` · annule le changement n°${change.revertsId}`}
                {change.isbn && ` · ISBN ${change.isbn}`}
              </p>
              {describeChange(change) && <p className="text-sm">{describeChange(change)}</p>}
              {change.kind === 'cover' && <CoverPair change={change} />}
              {change.kind === 'create' && change.status === 'pending' && (
                <p className="text-xs text-muted">
                  Nouvel album ajouté par un utilisateur « collection seule » : refuser le retire du
                  catalogue et de sa collection.
                </p>
              )}
              <div className="flex gap-2">
                {change.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(change, () => reviewChange(change.id, true), 'Validation impossible.')
                      }
                      className={buttonClass}
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(change, () => reviewChange(change.id, false), 'Refus impossible.')
                      }
                      className={buttonClass}
                    >
                      Refuser
                    </button>
                  </>
                )}
                {change.status === 'applied' && canRevert(change) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(change, () => revertChange(change.id), 'Annulation impossible.')
                    }
                    className={buttonClass}
                  >
                    Annuler ce changement
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {rows.length >= 50 && !exhausted && (
        <button type="button" onClick={loadMore} className={`${buttonClass} self-center`}>
          Voir plus
        </button>
      )}
    </div>
  )
}

function UsersTab() {
  const { data, loading, error, reload } = useAsync(listUsers)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function change(user: AdminUser, level: Contribution) {
    setBusyId(user.id)
    setMessage(null)
    try {
      await setContribution(user.id, level)
      reload()
    } catch (e) {
      setMessage(governanceErrorMessage(e, 'Modification impossible.'))
    }
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Un utilisateur « collection seule » peut ajouter et retirer des albums de sa collection,
        mais ses ajouts d'albums inconnus et ses corrections de couverture attendent votre
        validation.
      </p>
      {message && <FormMessage kind="error">{message}</FormMessage>}
      {error && <FormMessage kind="error">Impossible de charger les utilisateurs.</FormMessage>}
      {loading && !data && <p className="text-muted">Chargement…</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3"
          >
            <div className="text-sm">
              <span className="font-medium">{user.pseudo}</span>
              {user.role !== 'user' && (
                <span className="ml-2 rounded bg-raised px-2 py-0.5 text-xs">
                  {user.role === 'admin' ? 'Administrateur' : 'Modérateur'}
                </span>
              )}
              <p className="text-xs text-muted">
                Inscrit le {dateFormat.format(new Date(user.createdAt))} · {user.collectionCount}{' '}
                album(s) · {user.changeCount} changement(s) au catalogue
                {user.pendingCount > 0 && ` · ${user.pendingCount} en attente`}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Niveau de {user.pseudo}</span>
              <select
                value={user.contribution}
                disabled={busyId === user.id}
                onChange={(e) => change(user, e.target.value as Contribution)}
                className="rounded border border-line-strong px-2 py-1"
              >
                {(Object.keys(CONTRIBUTION_LABELS) as Contribution[]).map((value) => (
                  <option key={value} value={value}>
                    {CONTRIBUTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
