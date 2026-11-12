import { useState } from 'react'
import { Link } from 'react-router-dom'

import Dialog from '../../components/Dialog'
import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import type { SeriesData } from '../series/api'
import { addCatalogueEdition } from '../series/api'
import type { CatalogueEdition, UserItem } from '../series/buildView'
import { deleteEntry } from './api'
import { CoverImage } from './AlbumCard'
import { isOutsideGrid, shortKindLabel, toAlbumKind } from './kinds'

type Choice = { edition: CatalogueEdition; item: UserItem | null }

/**
 * Les albums de la série, en bandeau : celui qu'on regarde est mis en avant. Chaque couverture porte
 * un bouton d'état : coche (dans ma collection), cœur (dans mes envies) ou plus (ni l'un ni l'autre).
 * La forme de l'icône dit l'état, pas la couleur ; chaque action passe par une confirmation.
 */
export default function AlbumSeriesStrip({
  data,
  currentIsbn,
  userId,
  onChanged,
}: {
  data: SeriesData
  currentIsbn: string
  userId?: string
  onChanged?: () => void
}) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const itemByIsbn = new Map(data.items.map((item) => [item.isbn, item]))
  // Tomes dans l'ordre, puis intégrales et hors-séries
  const editions = [...data.editions].sort((a, b) => {
    const outA = isOutsideGrid(a.kind) ? 1 : 0
    const outB = isOutsideGrid(b.kind) ? 1 : 0
    return outA - outB || (a.volume ?? 9999) - (b.volume ?? 9999)
  })
  if (editions.length < 2) return null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setChoice(null)
      onChanged?.()
    } catch {
      setError('Impossible de modifier votre collection.')
      setChoice(null)
    }
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="dans-la-serie">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dans-la-serie" className="font-display text-xl font-bold uppercase tracking-wide">
          Dans la série
        </h2>
        <Link to={`/series/${data.series.id}`} className="text-sm text-accent-text underline">
          Voir toute la série « {data.series.name} »
        </Link>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {editions.map((edition) => {
          const item = itemByIsbn.get(edition.isbn) ?? null
          const current = edition.isbn === currentIsbn
          const label = isOutsideGrid(edition.kind)
            ? shortKindLabel(toAlbumKind(edition.kind), edition.volumeFrom, edition.volumeTo)
            : edition.volume !== null
              ? `Tome ${edition.volume}`
              : 'Album'
          return (
            <li key={edition.isbn} className="relative w-24 shrink-0">
              <Link
                to={`/collection/${edition.isbn}`}
                aria-current={current ? 'page' : undefined}
                title={`${edition.title} · ${label}`}
                className="flex flex-col gap-1"
              >
                <div
                  className={`cover-art relative aspect-[2/3] w-24 ${current ? 'ring-2 ring-accent' : item ? '' : 'opacity-60'}`}
                >
                  <CoverImage
                    coverUrl={edition.coverUrl}
                    title={edition.title}
                    className="aspect-[2/3] w-24 rounded"
                  />
                </div>
                <span
                  className={`text-center text-xs ${current ? 'font-semibold text-fg' : 'text-muted'}`}
                >
                  {label}
                </span>
              </Link>
              {userId && (
                <IconButton
                  icon={!item ? 'plus' : item.status === 'owned' ? 'check' : 'heart'}
                  variant={item ? 'primary' : 'outline'}
                  size="sm"
                  label={
                    !item
                      ? `${label} : ajouter à ma collection ou à mes envies`
                      : item.status === 'owned'
                        ? `${label} : dans ma collection, retirer`
                        : `${label} : dans mes envies, retirer`
                  }
                  className={`absolute right-1 top-1 shadow ${item ? '' : 'bg-surface'}`}
                  onClick={() => setChoice({ edition, item })}
                />
              )}
            </li>
          )
        })}
      </ul>
      {error && <FormMessage kind="error">{error}</FormMessage>}

      {choice && userId && (
        <ChoiceDialog
          choice={choice}
          busy={busy}
          onCancel={() => setChoice(null)}
          onRemove={() => run(() => deleteEntry(choice.item!.id))}
          onAdd={(status) => run(() => addCatalogueEdition(userId, choice.edition.isbn, status))}
        />
      )}
    </section>
  )
}

function ChoiceDialog({
  choice,
  busy,
  onCancel,
  onRemove,
  onAdd,
}: {
  choice: Choice
  busy: boolean
  onCancel: () => void
  onRemove: () => void
  onAdd: (status: 'owned' | 'wanted') => void
}) {
  const { edition, item } = choice
  const name = edition.volume !== null ? `Tome ${edition.volume}` : edition.title
  if (item) {
    const owned = item.status === 'owned'
    return (
      <Dialog
        title={owned ? 'Retirer de ma collection ?' : 'Retirer des envies ?'}
        busy={busy}
        onCancel={onCancel}
        actions={[
          {
            label: owned ? 'Retirer de ma collection' : 'Retirer des envies',
            icon: 'trash',
            danger: true,
            onClick: onRemove,
          },
        ]}
      >
        {name} · {edition.title}
      </Dialog>
    )
  }
  return (
    <Dialog
      title="Ajouter cet album"
      busy={busy}
      onCancel={onCancel}
      actions={[
        { label: 'Ajouter à ma collection', icon: 'check', onClick: () => onAdd('owned') },
        { label: 'Mettre en envie', icon: 'heart', onClick: () => onAdd('wanted') },
      ]}
    >
      {name} · {edition.title}
    </Dialog>
  )
}
