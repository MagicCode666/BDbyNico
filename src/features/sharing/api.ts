import { supabase } from '../../lib/supabase'

/** Une ligne de la vue publique d'une collection partagée. */
export interface SharedRow {
  pseudo: string
  isbn: string
  title: string
  seriesId: string | null
  seriesName: string | null
  seriesTotal: number | null
  seriesStatus: string | null
  startsAtZero: boolean
  volume: number | null
  volumeFrom: number | null
  volumeTo: number | null
  kind: string | null
  authors: string[]
  coverUrl: string | null
  status: string
  read: boolean
  dedicated: boolean
}

export async function getSharedCollection(token: string): Promise<SharedRow[]> {
  const { data, error } = await supabase.rpc('get_shared_collection', { p_token: token })
  if (error) throw error
  return (data ?? []).map((row) => ({
    pseudo: row.pseudo,
    isbn: row.isbn,
    title: row.title,
    seriesId: row.series_id ?? null,
    seriesName: row.series_name ?? null,
    seriesTotal: row.series_total ?? null,
    seriesStatus: row.series_status ?? null,
    startsAtZero: !!row.starts_at_zero,
    volume: row.volume ?? null,
    volumeFrom: row.volume_from ?? null,
    volumeTo: row.volume_to ?? null,
    kind: row.kind ?? null,
    authors: row.authors ?? [],
    coverUrl: row.cover_url ?? null,
    status: row.status,
    read: !!row.read,
    dedicated: !!row.dedicated,
  }))
}

export interface ShareSettings {
  enabled: boolean
  wishes: boolean
  dedications: boolean
  token: string
}

export async function loadShareSettings(userId: string): Promise<ShareSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select('share_enabled, share_wishes, share_dedications, share_token')
    .eq('id', userId)
    .single()
  if (error) throw error
  return {
    enabled: data.share_enabled,
    wishes: data.share_wishes,
    dedications: data.share_dedications,
    token: data.share_token,
  }
}

export async function saveShareSettings(
  userId: string,
  patch: Partial<Pick<ShareSettings, 'enabled' | 'wishes' | 'dedications'>>,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      ...(patch.enabled !== undefined && { share_enabled: patch.enabled }),
      ...(patch.wishes !== undefined && { share_wishes: patch.wishes }),
      ...(patch.dedications !== undefined && { share_dedications: patch.dedications }),
    })
    .eq('id', userId)
  if (error) throw error
}

/** Nouveau jeton : l'ancien lien cesse de fonctionner. */
export async function regenerateShareToken(): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_share_token')
  if (error) throw error
  return data
}
