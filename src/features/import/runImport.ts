import { addItems, completeTitles, createEditions, updateItems } from './api'
import { mergeIntoExisting, type ExistingItem } from './merge'
import type { ImportPlan } from './types'

/** Que faire des albums déjà présents dans la collection. */
export type ExistingMode = 'skip' | 'update'

export type Phase = 'titles' | 'catalogue' | 'collection' | 'updates'

export const PHASE_LABELS: Record<Phase, string> = {
  titles: 'Recherche des titres manquants',
  catalogue: 'Ajout au catalogue',
  collection: 'Ajout à votre collection',
  updates: 'Mise à jour des albums déjà présents',
}

export interface ImportProgress {
  phase: Phase
  done: number
  total: number
}

export interface ImportReport {
  /** Albums ajoutés à la collection. */
  added: number
  /** Nouvelles éditions créées dans le catalogue partagé. */
  editionsCreated: number
  /** Titres retrouvés par la BnF. */
  titlesCompleted: number
  /** Albums déjà présents laissés tels quels. */
  skipped: number
  /** Albums déjà présents complétés. */
  updated: number
}

/**
 * Importe un fichier analysé : titres manquants, catalogue partagé, collection, puis mise à jour
 * éventuelle des albums déjà présents. L'opération peut être relancée sans risque : ce qui est
 * déjà dans la collection est ignoré.
 */
export async function runImport(
  userId: string,
  plan: ImportPlan,
  existing: Map<string, ExistingItem>,
  mode: ExistingMode,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportReport> {
  const present = plan.rows.filter((row) => existing.has(row.isbn))
  const fresh = plan.rows.filter((row) => !existing.has(row.isbn))
  const report: ImportReport = {
    added: 0,
    editionsCreated: 0,
    titlesCompleted: 0,
    skipped: 0,
    updated: 0,
  }

  const step = (phase: Phase) => (done: number, total: number) => onProgress({ phase, done, total })

  // 1. Titres absents du fichier (seulement pour les albums à ajouter)
  const completed = await completeTitles(fresh, step('titles'))
  report.titlesCompleted = completed.completed

  // 2. Catalogue partagé, 3. collection
  if (fresh.length > 0) {
    const catalogue = await createEditions(completed.rows, step('catalogue'))
    report.editionsCreated = catalogue.created
    report.added = await addItems(userId, completed.rows, step('collection'))
  }

  // 4. Albums déjà présents
  if (mode === 'update') {
    const updates = present
      .map((row) => {
        const item = existing.get(row.isbn)!
        const { update, changed } = mergeIntoExisting(item, row)
        return { id: item.id, update, changed }
      })
      .filter((entry) => entry.changed)
    if (updates.length > 0) await updateItems(updates, step('updates'))
    report.updated = updates.length
    report.skipped = present.length - updates.length
  } else {
    report.skipped = present.length
  }

  return report
}
