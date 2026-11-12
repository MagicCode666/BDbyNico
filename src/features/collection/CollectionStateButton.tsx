import { useState } from 'react'

import Dialog, { type DialogAction } from '../../components/Dialog'
import { Icon } from '../../components/icons'
import { addCatalogueEdition, setItemStatus } from '../series/api'
import { deleteEntry } from './api'
import type { Status } from './types'

interface CollectionStateButtonProps {
  userId: string
  isbn: string
  /** Nom de l'album, repris dans les libellés et les fenêtres (« Série · Tome 3 »). */
  title: string
  /** La ligne de collection de l'utilisateur pour cet album, ou null s'il n'y est pas. */
  item: { id: string; status: Status } | null
  /** « corner » : posé dans le coin de la couverture ; « inline » : à sa place dans la ligne. */
  placement?: 'corner' | 'inline'
  size?: 'sm' | 'md'
  /** N'apparaît qu'au survol (écrans à souris), toujours visible au clavier et sur mobile. */
  revealOnHover?: boolean
  onChanged: () => void
  onError?: (message: string) => void
}

const SIZES = { sm: 'h-6 w-6', md: 'h-8 w-8' } as const

/**
 * Bouton d'état d'un album, commun à toutes les vues : coche (dans ma collection), cœur (dans mes
 * envies) ou plus (ni l'un ni l'autre). La forme de l'icône dit l'état, pas la couleur. Chaque clic
 * ouvre une fenêtre de confirmation ; sans coche ni cœur, on revient au plus.
 */
export default function CollectionStateButton({
  userId,
  isbn,
  title,
  item,
  placement = 'corner',
  size = 'md',
  revealOnHover = false,
  onChanged,
  onError,
}: CollectionStateButtonProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      setOpen(false)
      onChanged()
    } catch {
      setOpen(false)
      onError?.('Impossible de modifier votre collection.')
    }
    setBusy(false)
  }

  const owned = item?.status === 'owned'
  const wanted = item?.status === 'wanted'
  const icon = owned ? 'check' : wanted ? 'heart' : 'plus'
  const label = owned
    ? `Dans ma collection : ${title}`
    : wanted
      ? `Dans mes envies : ${title}`
      : `Ajouter à ma collection ou aux envies : ${title}`
  const look = owned
    ? 'border-ok bg-ok text-on-accent shadow-[0_0_14px_color-mix(in_srgb,var(--ok)_65%,transparent)]'
    : wanted
      ? 'border-accent bg-surface text-accent-text hover:bg-raised'
      : 'border-line-strong bg-surface/90 text-fg backdrop-blur hover:border-accent'
  const position = placement === 'corner' ? 'absolute right-1.5 top-1.5' : 'static flex-none'
  const reveal = revealOnHover
    ? '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100'
    : ''

  let actions: DialogAction[]
  let heading: string
  if (item && owned) {
    heading = 'Retirer de ma collection ?'
    actions = [
      {
        label: 'Retirer de ma collection',
        icon: 'trash',
        danger: true,
        onClick: () => run(() => deleteEntry(item.id)),
      },
    ]
  } else if (item) {
    heading = 'Retirer des envies ?'
    actions = [
      {
        label: 'Je l’ai : le passer en possédé',
        icon: 'check',
        onClick: () => run(() => setItemStatus(item.id, 'owned')),
      },
      {
        label: 'Retirer des envies',
        icon: 'trash',
        danger: true,
        onClick: () => run(() => deleteEntry(item.id)),
      },
    ]
  } else {
    heading = 'Ajouter cet album'
    actions = [
      {
        label: 'Ajouter à ma collection',
        icon: 'check',
        onClick: () => run(() => addCatalogueEdition(userId, isbn, 'owned')),
      },
      {
        label: 'Mettre en envie',
        icon: 'heart',
        onClick: () => run(() => addCatalogueEdition(userId, isbn, 'wanted')),
      },
    ]
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className={`${position} ${reveal} z-10 grid ${SIZES[size]} place-items-center rounded border ${look}`}
      >
        <Icon name={icon} className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
      </button>
      {open && (
        <Dialog title={heading} actions={actions} busy={busy} onCancel={() => setOpen(false)}>
          {title}
        </Dialog>
      )}
    </>
  )
}
