import { supabase } from '../../lib/supabase'
import type { Status } from '../collection/types'
import type { CatalogueEdition, UserItem } from './buildView'

export interface SeriesSettings {
  ignored: number[]
  totalOverride: number | null
}

export interface SeriesData {
  series: { id: string; name: string; totalVolumes: number | null }
  editions: CatalogueEdition[]
  items: UserItem[]
  settings: SeriesSettings
}

const NO_SETTINGS: SeriesSettings = { ignored: [], totalOverride: null }

/** Charge une série : catalogue, collection de l'utilisateur (RLS) et ses réglages personnels. */
export async function getSeriesData(seriesId: string): Promise<SeriesData | null> {
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('id, name, total_volumes')
    .eq('id', seriesId)
    .maybeSingle()
  if (seriesError) throw seriesError
  if (!series) return null

  const { data: editionRows, error: editionsError } = await supabase
    .from('editions')
    .select('isbn, title, volume, cover_url, authors')
    .eq('series_id', seriesId)
    .order('volume', { ascending: true, nullsFirst: false })
  if (editionsError) throw editionsError

  const editions: CatalogueEdition[] = editionRows.map((row) => ({
    isbn: row.isbn,
    title: row.title,
    volume: row.volume,
    coverUrl: row.cover_url,
    authors: row.authors,
  }))

  let items: UserItem[] = []
  if (editions.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('collection_items')
      .select('id, isbn, status, read')
      .in(
        'isbn',
        editions.map((e) => e.isbn),
      )
    if (itemsError) throw itemsError
    items = itemRows.map((row) => ({
      id: row.id,
      isbn: row.isbn,
      status: row.status === 'wanted' ? 'wanted' : 'owned',
      read: row.read,
    }))
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from('user_series_settings')
    .select('ignored_volumes, total_override')
    .eq('series_id', seriesId)
    .maybeSingle()
  if (settingsError) throw settingsError

  return {
    series: { id: series.id, name: series.name, totalVolumes: series.total_volumes },
    editions,
    items,
    settings: settingsRow
      ? { ignored: settingsRow.ignored_volumes, totalOverride: settingsRow.total_override }
      : NO_SETTINGS,
  }
}

/** Réglages personnels de toutes les séries de l'utilisateur, indexés par identifiant de série. */
export async function listSeriesSettings(): Promise<Map<string, SeriesSettings>> {
  const { data, error } = await supabase
    .from('user_series_settings')
    .select('series_id, ignored_volumes, total_override')
  if (error) throw error
  return new Map(
    data.map((row) => [
      row.series_id,
      { ignored: row.ignored_volumes, totalOverride: row.total_override },
    ]),
  )
}

export async function saveSeriesSettings(
  userId: string,
  seriesId: string,
  settings: SeriesSettings,
): Promise<void> {
  const { error } = await supabase.from('user_series_settings').upsert(
    {
      user_id: userId,
      series_id: seriesId,
      ignored_volumes: [...new Set(settings.ignored)].sort((a, b) => a - b),
      total_override: settings.totalOverride,
    },
    { onConflict: 'user_id,series_id' },
  )
  if (error) throw error
}

/** Passe un album de « envie » à « possédé » (ou l'inverse). */
export async function setItemStatus(itemId: string, status: Status): Promise<void> {
  const { error } = await supabase.from('collection_items').update({ status }).eq('id', itemId)
  if (error) throw error
}

/** Ajoute à la collection (ou aux envies) une édition qui existe déjà dans le catalogue. */
export async function addCatalogueEdition(
  userId: string,
  isbn: string,
  status: Status,
): Promise<void> {
  const { error } = await supabase
    .from('collection_items')
    .insert({ user_id: userId, isbn, status })
  if (error && error.code !== '23505') throw error
}

/** Enregistre la couverture d'une édition du catalogue partagé (si elle n'en a pas encore). */
export async function setEditionCover(isbn: string, coverUrl: string): Promise<void> {
  const { error } = await supabase.rpc('set_edition_cover', {
    p_isbn: isbn,
    p_cover_url: coverUrl,
  })
  if (error) throw error
}
