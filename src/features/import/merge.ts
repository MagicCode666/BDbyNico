import type { Status } from '../collection/types'
import type { ImportRow } from './types'

/** Un album déjà présent dans la collection de l'utilisateur. */
export interface ExistingItem {
  id: string
  isbn: string
  status: Status
  read: boolean
  price: number | null
  dedication: 'signature' | 'drawing' | null
  firstEdition: boolean
}

export interface ItemUpdate {
  status: Status
  read: boolean
  price: number | null
  dedication: 'signature' | 'drawing' | null
  firstEdition: boolean
}

/**
 * Complète un album déjà présent avec les informations du fichier, sans rien effacer :
 * - « envie » devient « possédé » si le fichier dit possédé (jamais l'inverse) ;
 * - « lu » et « édition originale » se cumulent ;
 * - le prix du fichier remplace le prix connu quand il en donne un ;
 * - la dédicace déjà renseignée est conservée (le fichier ne distingue pas signature et dessin).
 * La date d'achat, les notes et la date d'ajout ne sont jamais touchées.
 */
export function mergeIntoExisting(
  existing: ExistingItem,
  row: ImportRow,
): { update: ItemUpdate; changed: boolean } {
  const update: ItemUpdate = {
    status: existing.status === 'owned' || row.status === 'owned' ? 'owned' : 'wanted',
    read: existing.read || row.read,
    price: row.price ?? existing.price,
    dedication: existing.dedication ?? row.dedication,
    firstEdition: existing.firstEdition || row.firstEdition,
  }
  const changed =
    update.status !== existing.status ||
    update.read !== existing.read ||
    update.price !== existing.price ||
    update.dedication !== existing.dedication ||
    update.firstEdition !== existing.firstEdition
  return { update, changed }
}
