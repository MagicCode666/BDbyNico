import { supabase } from '../../lib/supabase'
import { lookupBnf } from '../collection/lookup/bnf'
import { chunk } from './chunk'
import type { ExistingItem, ItemUpdate } from './merge'
import { toEditionPayload } from './payload'
import type { ImportRow } from './types'

/** Le plafond quotidien de créations dans le catalogue partagé est atteint. */
export class ImportLimitError extends Error {
  constructor() {
    super('Limite quotidienne de nouveaux albums atteinte (500 par jour).')
  }
}

type Progress = (done: number, total: number) => void

/** Exécute `task` sur chaque élément, `concurrency` à la fois. */
async function forEachParallel<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  onProgress?: Progress,
) {
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      await task(item)
      onProgress?.(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

/** Albums de l'utilisateur déjà présents dans sa collection, parmi ces ISBN. */
export async function findExistingItems(isbns: string[]): Promise<Map<string, ExistingItem>> {
  const found = new Map<string, ExistingItem>()
  for (const batch of chunk(isbns, 100)) {
    const { data, error } = await supabase
      .from('collection_items')
      .select(
        'id, isbn, status, price, dedication, dedication_by, first_edition, acquired_on, condition, notes',
      )
      .in('isbn', batch)
    if (error) throw error
    for (const row of data) {
      found.set(row.isbn, {
        id: row.id,
        isbn: row.isbn,
        status: row.status === 'wanted' ? 'wanted' : 'owned',
        price: row.price,
        dedication:
          row.dedication === 'signature' || row.dedication === 'drawing' ? row.dedication : null,
        dedicationBy: row.dedication_by,
        firstEdition: row.first_edition,
        acquiredOn: row.acquired_on,
        condition: row.condition,
        notes: row.notes,
      })
    }
  }
  return found
}

/** Complète les titres absents du fichier grâce à la BnF (3 recherches à la fois). */
export async function completeTitles(
  rows: ImportRow[],
  onProgress?: Progress,
): Promise<{ rows: ImportRow[]; completed: number }> {
  const missing = rows.filter((row) => row.titleMissing)
  const titles = new Map<string, string>()
  await forEachParallel(
    missing,
    3,
    async (row) => {
      try {
        const info = await lookupBnf(row.isbn)
        if (info?.title) titles.set(row.isbn, info.title)
      } catch {
        // la BnF n'a pas répondu : le titre de repli est conservé
      }
    },
    onProgress,
  )
  return {
    completed: titles.size,
    rows: rows.map((row) =>
      titles.has(row.isbn) ? { ...row, title: titles.get(row.isbn)!, titleMissing: false } : row,
    ),
  }
}

export interface CatalogueResult {
  created: number
  existing: number
  invalid: number
}

/** Crée les éditions dans le catalogue partagé, par lots de 200. */
export async function createEditions(
  rows: ImportRow[],
  onProgress?: Progress,
): Promise<CatalogueResult> {
  const total: CatalogueResult = { created: 0, existing: 0, invalid: 0 }
  let done = 0
  for (const batch of chunk(rows, 200)) {
    const { data, error } = await supabase.rpc('import_editions', {
      p_rows: batch.map(toEditionPayload),
    })
    if (error) {
      if (error.code === '54000') throw new ImportLimitError()
      throw error
    }
    const result = data as unknown as CatalogueResult
    total.created += result.created
    total.existing += result.existing
    total.invalid += result.invalid
    done += batch.length
    onProgress?.(done, rows.length)
  }
  return total
}

/** Ajoute les albums à la collection (ceux déjà présents sont laissés tels quels). */
export async function addItems(
  userId: string,
  rows: ImportRow[],
  onProgress?: Progress,
): Promise<number> {
  let added = 0
  let done = 0
  for (const batch of chunk(rows, 100)) {
    const { data, error } = await supabase
      .from('collection_items')
      .upsert(
        batch.map((row) => ({
          user_id: userId,
          isbn: row.isbn,
          status: row.status,
          price: row.price,
          dedication: row.dedication,
          dedication_by: row.dedicationBy,
          first_edition: row.firstEdition,
          acquired_on: row.acquiredOn,
          condition: row.condition,
          notes: row.notes,
          // Date d'ajout d'origine conservée (sinon : maintenant)
          ...(row.addedAt ? { created_at: row.addedAt } : {}),
        })),
        { onConflict: 'user_id,isbn', ignoreDuplicates: true },
      )
      .select('isbn')
    if (error) throw error
    added += data.length
    done += batch.length
    onProgress?.(done, rows.length)
  }
  return added
}

/** Met à jour des albums déjà présents (5 requêtes à la fois). */
export async function updateItems(
  updates: { id: string; update: ItemUpdate }[],
  onProgress?: Progress,
): Promise<void> {
  await forEachParallel(
    updates,
    5,
    async ({ id, update }) => {
      const { error } = await supabase
        .from('collection_items')
        .update({
          status: update.status,
          price: update.price,
          dedication: update.dedication,
          dedication_by: update.dedicationBy,
          first_edition: update.firstEdition,
          acquired_on: update.acquiredOn,
          condition: update.condition,
          notes: update.notes,
        })
        .eq('id', id)
      if (error) throw error
    },
    onProgress,
  )
}
