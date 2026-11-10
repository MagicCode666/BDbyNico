import { supabase } from '../../lib/supabase'
import { isOutsideGrid, toAlbumKind } from '../collection/kinds'
import { toPublicationStatus, type PublicationStatus } from '../series/status'

export interface ExplorerSeries {
  id: string
  name: string
  totalVolumes: number | null
  publicationStatus: PublicationStatus | null
  genres: string[]
  coverUrl: string | null
  /** Tomes que l'utilisateur possède dans cette série. */
  owned: number
}

const LIMIT = 120

/** Séries du catalogue qui portent un genre, avec une couverture et ce que j'en possède. */
export async function listSeriesByGenre(genre: string): Promise<ExplorerSeries[]> {
  const { data: series, error } = await supabase
    .from('series')
    .select('id, name, total_volumes, publication_status, genres')
    .contains('genres', [genre])
    .order('name_key')
    .limit(LIMIT)
  if (error) throw error
  if (series.length === 0) return []
  const ids = series.map((row) => row.id)

  const { data: editions, error: editionsError } = await supabase
    .from('editions')
    .select('series_id, volume, cover_url, kind')
    .in('series_id', ids)
    .not('cover_url', 'is', null)
    .order('volume', { ascending: true, nullsFirst: false })
  if (editionsError) throw editionsError
  // Première couverture d'un tome ordinaire (les lignes arrivent par numéro croissant)
  const covers = new Map<string, string>()
  for (const row of editions) {
    if (row.series_id && row.cover_url && !isOutsideGrid(toAlbumKind(row.kind))) {
      if (!covers.has(row.series_id)) covers.set(row.series_id, row.cover_url)
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('collection_items')
    .select('editions!inner ( series_id, kind )')
    .eq('status', 'owned')
    .in('editions.series_id', ids)
  if (itemsError) throw itemsError
  const owned = new Map<string, number>()
  for (const item of items as unknown as { editions: { series_id: string; kind: string } }[]) {
    if (isOutsideGrid(toAlbumKind(item.editions.kind))) continue
    owned.set(item.editions.series_id, (owned.get(item.editions.series_id) ?? 0) + 1)
  }

  return series.map((row) => ({
    id: row.id,
    name: row.name,
    totalVolumes: row.total_volumes,
    publicationStatus: toPublicationStatus(row.publication_status),
    genres: row.genres,
    coverUrl: covers.get(row.id) ?? null,
    owned: owned.get(row.id) ?? 0,
  }))
}
