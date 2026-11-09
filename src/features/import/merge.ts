import type { Dedication, Status } from '../collection/types'
import type { ImportRow } from './types'

/** Un album déjà présent dans la collection de l'utilisateur. */
export interface ExistingItem {
  id: string
  isbn: string
  status: Status
  read: boolean
  price: number | null
  dedication: Dedication | null
  dedicationBy: string | null
  firstEdition: boolean
  acquiredOn: string | null
  condition: string | null
  notes: string | null
}

export interface ItemUpdate {
  status: Status
  read: boolean
  price: number | null
  dedication: Dedication | null
  dedicationBy: string | null
  firstEdition: boolean
  acquiredOn: string | null
  condition: string | null
  notes: string | null
}

/**
 * Complète un album déjà présent avec les informations du fichier, sans rien effacer :
 * - « envie » devient « possédé » si le fichier dit possédé (jamais l'inverse) ;
 * - « lu » et « édition originale » se cumulent ;
 * - le prix du fichier remplace le prix connu quand il en donne un ;
 * - la dédicace déjà renseignée est conservée (un fichier Bubble ne distingue pas signature et
 *   dessin), ainsi que son auteur ;
 * - date d'achat, état et notes ne sont renseignés que s'ils étaient vides : jamais écrasés.
 * La date d'ajout n'est jamais touchée.
 */
export function mergeIntoExisting(
  existing: ExistingItem,
  row: ImportRow,
): { update: ItemUpdate; changed: boolean } {
  const dedication = existing.dedication ?? row.dedication
  const update: ItemUpdate = {
    status: existing.status === 'owned' || row.status === 'owned' ? 'owned' : 'wanted',
    read: existing.read || row.read,
    price: row.price ?? existing.price,
    dedication,
    dedicationBy: dedication ? (existing.dedicationBy ?? row.dedicationBy) : null,
    firstEdition: existing.firstEdition || row.firstEdition,
    acquiredOn: existing.acquiredOn ?? row.acquiredOn,
    condition: existing.condition ?? row.condition,
    notes: existing.notes ?? row.notes,
  }
  const changed = (Object.keys(update) as (keyof ItemUpdate)[]).some(
    (key) => update[key] !== existing[key],
  )
  return { update, changed }
}
