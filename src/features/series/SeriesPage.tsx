import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import { Icon } from '../../components/icons'
import PageLayout from '../../components/PageLayout'
import { useScrollRestoration } from '../../lib/useScrollRestoration'
import { CoverImage } from '../collection/AlbumCard'
import { useAsync } from '../collection/useAsync'
import {
  addCatalogueEdition,
  getSeriesData,
  saveSeriesSettings,
  setItemStatus,
  type SeriesData,
} from './api'
import { buildSeriesView, type Slot } from './buildView'
import { heroEdition, seriesAuthors } from './hero'
import IntegralsSection from './IntegralsSection'
import {
  completionLabel,
  effectiveStatus,
  PUBLICATION_LABELS,
  type PublicationStatus,
} from './status'
import { useMissingCovers } from './useMissingCovers'

const buttonClass =
  'rounded border border-line-strong px-2.5 py-1 text-xs font-medium hover:border-accent disabled:opacity-50'
const toolButton =
  'inline-flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-50'

type Filter = 'all' | 'owned' | 'missing'
type Layout = 'grid' | 'list'
type BulkAction = 'owned' | 'wanted'

export default function SeriesPage() {
  const { seriesId = '' } = useParams()
  const load = useCallback(() => getSeriesData(seriesId), [seriesId])
  const { data, loading, error, reload } = useAsync(load)
  const name = data?.series.name ?? 'Série'

  return (
    <PageLayout
      title={name}
      hideTitle
      crumbs={[
        { label: 'Accueil', to: '/' },
        { label: 'Collection', to: '/collection' },
        { label: name },
      ]}
    >
      {!data && loading && <p className="text-muted">Chargement…</p>}
      {error && !data && <FormMessage kind="error">Impossible de charger cette série.</FormMessage>}
      {!data && !loading && !error && (
        <p className="text-muted">
          Série introuvable.{' '}
          <Link to="/collection" className="text-accent-text underline">
            Retour à la collection
          </Link>
        </p>
      )}
      {data && <SeriesDetails data={data} reload={reload} />}
    </PageLayout>
  )
}

function SeriesDetails({ data, reload }: { data: SeriesData; reload: () => void }) {
  const { user } = useAuth()
  const { series, editions, items, settings } = data
  useScrollRestoration(`series:${series.id}`, true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalInput, setTotalInput] = useState(settings.totalOverride?.toString() ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [layout, setLayout] = useState<Layout>('grid')
  const [confirming, setConfirming] = useState<BulkAction | null>(null)

  // Couvertures manquantes : recherchées à la première visite, puis enregistrées pour tous
  const { covers, remaining } = useMissingCovers(
    editions.map((e) => ({ isbn: e.isbn, coverUrl: e.coverUrl, locked: e.coverLocked })),
  )
  const editionsWithCovers = useMemo(
    () => editions.map((e) => ({ ...e, coverUrl: e.coverUrl ?? covers[e.isbn] ?? null })),
    [editions, covers],
  )

  const view = buildSeriesView({
    total: series.totalVolumes,
    override: settings.totalOverride,
    editions: editionsWithCovers,
    items,
    ignored: settings.ignored,
    startsAtZero: series.startsAtZero,
  })
  const publication = effectiveStatus(settings.statusOverride, series.publicationStatus)
  // Le tome 0 (prologue) compte dans la série : « 10 tomes » pour les tomes 0 à 9
  const tomeCount = view.slots.length
  const tomesLabel = view.hasVolumeZero ? ' tomes (dont le tome 0)' : ' tomes'
  const ignoredSlots = view.slots.filter((slot) => slot.kind === 'ignored')
  const visibleSlots = view.slots.filter((slot) => slot.kind !== 'ignored')
  const shownSlots = visibleSlots.filter(
    (slot) =>
      filter === 'all' || (filter === 'owned' ? slot.kind === 'owned' : slot.kind !== 'owned'),
  )
  const authors = seriesAuthors(editionsWithCovers.filter((e) => (e.kind ?? 'album') === 'album'))
  const hero = heroEdition(editionsWithCovers)
  const percent = view.targetCount > 0 ? Math.round((100 * view.ownedCount) / view.targetCount) : 0

  // Tomes que « tout ajouter » concerne : ceux du catalogue que l'on n'a pas encore
  const missingEditions = view.slots.flatMap((slot) =>
    slot.kind === 'missing' ? [slot.edition] : [],
  )
  const wantedItems = view.slots.flatMap((slot) => (slot.kind === 'wanted' ? [slot.item] : []))

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
    } catch {
      setError(failure)
    }
    setBusy(false)
  }

  const userId = user?.id
  const ignore = (volume: number) =>
    run(
      () =>
        saveSeriesSettings(userId!, series.id, {
          ...settings,
          ignored: [...settings.ignored, volume],
        }),
      "Impossible d'ignorer ce tome.",
    )
  const ignoreMany = (volumes: number[]) =>
    run(
      () =>
        saveSeriesSettings(userId!, series.id, {
          ...settings,
          ignored: [...settings.ignored, ...volumes],
        }),
      "Impossible d'exclure ces tomes.",
    )
  const restore = (volume: number) =>
    run(
      () =>
        saveSeriesSettings(userId!, series.id, {
          ...settings,
          ignored: settings.ignored.filter((v) => v !== volume),
        }),
      'Impossible de restaurer ce tome.',
    )
  const addEdition = (isbn: string, status: 'owned' | 'wanted') =>
    run(() => addCatalogueEdition(userId!, isbn, status), "Impossible d'ajouter cet album.")
  const markOwned = (itemId: string) =>
    run(() => setItemStatus(itemId, 'owned'), 'Impossible de modifier cet album.')

  /** « Tout ajouter » : les tomes du catalogue manquants (et les envies passent à « possédé »). */
  function bulk(action: BulkAction) {
    setConfirming(null)
    void run(async () => {
      for (const edition of missingEditions)
        await addCatalogueEdition(userId!, edition.isbn, action)
      if (action === 'owned') for (const item of wantedItems) await setItemStatus(item.id, 'owned')
    }, "Impossible d'ajouter tous les tomes.")
  }

  function saveTotal(event: FormEvent) {
    event.preventDefault()
    const value = Number(totalInput)
    if (!Number.isInteger(value) || value < 1 || value > 999) {
      return setError('Le total doit être un entier entre 1 et 999.')
    }
    setEditingTotal(false)
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, totalOverride: value }),
      "Impossible d'enregistrer le total.",
    )
  }

  function changeStatus(value: string) {
    const statusOverride = value === 'ongoing' || value === 'finished' ? value : null
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, statusOverride }),
      "Impossible d'enregistrer le statut.",
    )
  }

  function resetTotal() {
    setEditingTotal(false)
    setTotalInput('')
    void run(
      () => saveSeriesSettings(userId!, series.id, { ...settings, totalOverride: null }),
      'Impossible de revenir au total partagé.',
    )
  }

  const totalSentence =
    settings.totalOverride !== null
      ? `Total personnel : ${settings.totalOverride} tomes${series.totalVolumes ? ` (total partagé : ${series.totalVolumes})` : ''}`
      : view.totalIsEstimate
        ? `Total inconnu : au moins ${view.total} tomes (à confirmer)`
        : publication === 'finished'
          ? `Total : ${tomeCount}${tomesLabel}`
          : `Au moins ${tomeCount}${tomesLabel} connus (série non terminée : de nouveaux tomes ont pu sortir)`

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card-lift grid gap-5 p-5 sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)_16rem]"
        style={{
          backgroundImage:
            'radial-gradient(560px 260px at 14% -4%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%), var(--grad-surface)',
        }}
      >
        <div className="cover-art aspect-[2/3] w-28 sm:w-40">
          <CoverImage
            coverUrl={hero?.coverUrl ?? null}
            title={series.name}
            className="aspect-[2/3] rounded"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {publication && (
              <span className={`badge ${publication === 'finished' ? 'badge-accent' : ''}`}>
                {PUBLICATION_LABELS[publication]}
              </span>
            )}
            <span className="badge">
              {tomeCount} tome{tomeCount > 1 ? 's' : ''}
            </span>
          </div>
          <h1 className="title-metal text-4xl sm:text-5xl">{series.name}</h1>
          {authors.length > 0 && <p className="text-muted">{authors.join(' · ')}</p>}
          <p className="text-sm text-muted">{totalSentence}</p>
        </div>
        <aside
          className="card flex flex-col gap-3 p-4 sm:col-span-2 lg:col-span-1"
          aria-label="Ma progression"
        >
          <p className="font-display text-4xl font-extrabold leading-none">
            {view.ownedCount}
            <span className="text-xl text-muted"> / {view.targetCount} tomes</span>
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Progression de la collection"
            className="h-2 overflow-hidden rounded-sm border border-line bg-raised shadow-[inset_0_2px_4px_rgb(0_0_0/0.4)]"
          >
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-text shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_70%,transparent)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {view.complete
              ? `${completionLabel(true, publication)} pour vous.`
              : view.missing.length > 0
                ? `Manquent : ${view.missing.map((v) => `T${v}`).join(', ')}`
                : 'Rien à rattraper.'}
          </p>
        </aside>
      </section>

      {error && <FormMessage kind="error">{error}</FormMessage>}

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <div
          className="inline-flex overflow-hidden rounded border border-line-strong"
          role="group"
          aria-label="Filtrer les tomes"
        >
          {(
            [
              ['all', 'Tous'],
              ['owned', 'Possédés'],
              ['missing', 'Manquants'],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted hover:text-fg'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {confirming ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="alertdialog"
            aria-label="Confirmer l'ajout"
          >
            <span className="text-sm">
              {confirming === 'owned'
                ? `Ajouter ${missingEditions.length + wantedItems.length} tome(s) à ma collection ?`
                : `Mettre ${missingEditions.length} tome(s) en envie ?`}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulk(confirming)}
              className={`${toolButton} bg-accent text-on-accent`}
            >
              Confirmer
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={toolButton}>
              Annuler
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || missingEditions.length + wantedItems.length === 0}
              onClick={() => setConfirming('owned')}
              className={toolButton}
            >
              <Icon name="check" className="h-4 w-4" />
              Tout ajouter à ma collection
            </button>
            <button
              type="button"
              disabled={busy || missingEditions.length === 0}
              onClick={() => setConfirming('wanted')}
              className={toolButton}
            >
              <Icon name="heart" className="h-4 w-4" />
              Manquants en envie
            </button>
          </>
        )}

        <div
          className="ml-auto inline-flex overflow-hidden rounded border border-line-strong"
          role="group"
          aria-label="Affichage"
        >
          <button
            type="button"
            aria-label="Vue grille"
            aria-pressed={layout === 'grid'}
            onClick={() => setLayout('grid')}
            className={`px-2.5 py-1.5 ${layout === 'grid' ? 'bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted hover:text-fg'}`}
          >
            <Icon name="grid" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Vue liste"
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
            className={`px-2.5 py-1.5 ${layout === 'list' ? 'bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted hover:text-fg'}`}
          >
            <Icon name="list" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {remaining > 0 && (
        <p role="status" className="text-sm text-muted">
          Récupération des couvertures… ({remaining} restante{remaining > 1 ? 's' : ''})
        </p>
      )}

      {shownSlots.length === 0 ? (
        <p className="text-muted">Aucun tome ne correspond à ce filtre.</p>
      ) : (
        <section
          aria-label="Tomes de la série"
          className={
            layout === 'grid'
              ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5'
              : 'flex flex-col gap-2'
          }
        >
          {shownSlots.map((slot) => (
            <SlotCard
              key={slot.volume}
              slot={slot}
              seriesName={series.name}
              layout={layout}
              busy={busy}
              onAdd={addEdition}
              onMarkOwned={markOwned}
              onIgnore={ignore}
            />
          ))}
        </section>
      )}

      <IntegralsSection
        integrals={view.integrals}
        total={view.total}
        ignored={settings.ignored}
        ownedVolumes={view.slots.filter((slot) => slot.kind === 'owned').map((slot) => slot.volume)}
        busy={busy}
        onAdd={addEdition}
        onIgnoreMany={ignoreMany}
      />

      {view.unnumbered.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl">Albums sans numéro de tome</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {view.unnumbered.map(({ edition, item }) => (
              <li key={edition.isbn} className="flex items-center gap-2">
                {item ? (
                  <Link to={`/collection/${edition.isbn}`} className="text-accent-text underline">
                    {edition.title}
                  </Link>
                ) : (
                  <span>{edition.title}</span>
                )}
                <span className="text-muted">
                  {item ? (item.status === 'owned' ? 'possédé' : 'envie') : 'non possédé'}
                </span>
                {!item && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addEdition(edition.isbn, 'wanted')}
                    className={buttonClass}
                  >
                    + Envie
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ignoredSlots.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl">Ignorés ({ignoredSlots.length})</h2>
          <ul className="flex flex-wrap gap-2">
            {ignoredSlots.map((slot) => (
              <li key={slot.volume} className="card flex items-center gap-2 px-2 py-1 text-sm">
                T{slot.volume}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => restore(slot.volume)}
                  className={buttonClass}
                >
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer font-display text-lg font-bold uppercase tracking-wide">
          Réglages de la série
        </summary>
        <div className="mt-4 flex flex-col gap-4 text-sm">
          {editingTotal ? (
            <form onSubmit={saveTotal} className="flex flex-wrap items-center gap-2" noValidate>
              <label htmlFor="total">Mon total</label>
              <input
                id="total"
                type="number"
                min={1}
                max={999}
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
                className="w-24 rounded border border-line-strong px-2 py-1"
              />
              <button type="submit" disabled={busy} className={buttonClass}>
                Enregistrer
              </button>
              <button type="button" onClick={() => setEditingTotal(false)} className={buttonClass}>
                Annuler
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditingTotal(true)} className={buttonClass}>
                Corriger mon total
              </button>
              {settings.totalOverride !== null && (
                <button type="button" onClick={resetTotal} disabled={busy} className={buttonClass}>
                  Revenir au total partagé
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="publication-status">Statut de la série</label>
            <select
              id="publication-status"
              value={settings.statusOverride ?? ''}
              disabled={busy}
              onChange={(e) => changeStatus(e.target.value)}
              className="rounded border border-line-strong px-2 py-1"
            >
              <option value="">
                {series.publicationStatus
                  ? `Automatique (${PUBLICATION_LABELS[series.publicationStatus].toLowerCase()})`
                  : 'Automatique (inconnu)'}
              </option>
              {(Object.keys(PUBLICATION_LABELS) as PublicationStatus[]).map((value) => (
                <option key={value} value={value}>
                  {PUBLICATION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>
    </div>
  )
}

interface SlotCardProps {
  slot: Exclude<Slot, { kind: 'ignored' }>
  seriesName: string
  layout: Layout
  busy: boolean
  onAdd: (isbn: string, status: 'owned' | 'wanted') => void
  onMarkOwned: (itemId: string) => void
  onIgnore: (volume: number) => void
}

/** Un tome de la grille : couverture, état dans le coin, ajout en un clic quand il manque. */
function SlotCard({ slot, seriesName, layout, busy, onAdd, onMarkOwned, onIgnore }: SlotCardProps) {
  const list = layout === 'list'
  const label = `${seriesName} · Tome ${slot.volume}`
  const cardClass = `card group relative flex gap-2.5 p-2.5 transition hover:-translate-y-1 hover:border-accent hover:shadow-glow ${list ? 'items-center' : 'flex-col'}`
  const coverWrap = list ? 'w-12 flex-none' : 'w-full'
  const cornerBase = `${list ? 'static flex-none' : 'absolute right-1.5 top-1.5'} grid h-8 w-8 place-items-center rounded border z-10`

  if (slot.kind === 'owned' || slot.kind === 'wanted') {
    const { edition, item } = slot
    const owned = slot.kind === 'owned'
    return (
      <article className={cardClass}>
        <Link
          to={`/collection/${edition.isbn}`}
          className={`flex gap-2.5 ${list ? 'min-w-0 flex-1 items-center' : 'flex-col'}`}
        >
          <div className={`cover-art aspect-[2/3] ${coverWrap}`}>
            <CoverImage
              coverUrl={edition.coverUrl}
              title={edition.title}
              className="aspect-[2/3]"
            />
          </div>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">{label}</span>
            <span className="block truncate text-xs text-muted">
              {item.read ? 'Lu · ' : ''}
              {owned ? 'Dans ma collection' : 'Dans mes envies'}
            </span>
          </span>
        </Link>
        {owned ? (
          <span
            role="img"
            aria-label="Dans ma collection"
            className={`${cornerBase} border-ok bg-ok text-on-accent shadow-[0_0_14px_color-mix(in_srgb,var(--ok)_65%,transparent)]`}
          >
            <Icon name="check" className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkOwned(item.id)}
            title="Dans mes envies : je l'ai"
            aria-label={`Je l'ai : ${label}`}
            className={`${cornerBase} border-accent bg-surface text-accent-text hover:bg-raised`}
          >
            <Icon name="heart" className="h-[18px] w-[18px]" />
          </button>
        )}
      </article>
    )
  }

  if (slot.kind === 'missing') {
    const { edition } = slot
    return (
      <article className={cardClass}>
        <Link
          to={`/collection/${edition.isbn}`}
          className={`flex gap-2.5 ${list ? 'min-w-0 flex-1 items-center' : 'flex-col'}`}
        >
          <div
            className={`cover-art aspect-[2/3] opacity-60 grayscale-[0.6] transition group-hover:opacity-90 group-hover:grayscale-0 ${coverWrap}`}
          >
            <CoverImage
              coverUrl={edition.coverUrl}
              title={edition.title}
              className="aspect-[2/3]"
            />
          </div>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">{label}</span>
            <span className="block truncate text-xs text-muted">Manquant</span>
          </span>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdd(edition.isbn, 'owned')}
          title="Ajouter à ma collection"
          aria-label={`Ajouter à ma collection : ${label}`}
          className={`${cornerBase} border-line-strong bg-surface/90 text-fg backdrop-blur hover:border-accent ${list ? '' : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100'}`}
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
        </button>
        <div className={`flex gap-1.5 ${list ? 'flex-none' : ''}`}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd(edition.isbn, 'wanted')}
            className={buttonClass}
          >
            + Envie
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onIgnore(slot.volume)}
            className={buttonClass}
          >
            Ignorer
          </button>
        </div>
      </article>
    )
  }

  // Tome connu par son numéro mais pas encore référencé : rien à ouvrir, on peut l'ajouter à la main
  return (
    <article className={`${cardClass} border-dashed`}>
      <div
        className={`flex aspect-[2/3] items-center justify-center rounded bg-raised p-2 text-center text-xs text-muted ${coverWrap}`}
      >
        Tome {slot.volume}
        <br />
        pas encore référencé
      </div>
      <span className="min-w-0 text-sm font-semibold leading-tight">{label}</span>
      <div className={`flex gap-1.5 ${list ? 'flex-none' : ''}`}>
        <Link
          to={`/collection/ajouter?serie=${encodeURIComponent(seriesName)}&tome=${slot.volume}`}
          className={buttonClass}
        >
          Ajouter
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onIgnore(slot.volume)}
          className={buttonClass}
        >
          Ignorer
        </button>
      </div>
    </article>
  )
}
