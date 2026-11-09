import { supabase } from '../../lib/supabase'
import type { Edition, Entry, SeriesInfo, Status } from './types'

const SELECT = `
  id, status, read, price, condition, notes, acquired_on,
  editions (
    isbn, title, volume, authors, publisher, published_on, cover_url,
    series ( id, name, total_volumes )
  )
`

interface RawSeries {
  id: string
  name: string
  total_volumes: number | null
}

interface RawEdition {
  isbn: string
  title: string
  volume: number | null
  authors: string[]
  publisher: string | null
  published_on: string | null
  cover_url: string | null
  series: RawSeries | null
}

interface RawItem {
  id: string
  status: string
  read: boolean
  price: number | null
  condition: string | null
  notes: string | null
  acquired_on: string | null
  editions: RawEdition | null
}

function toSeries(raw: RawSeries | null): SeriesInfo | null {
  return raw ? { id: raw.id, name: raw.name, totalVolumes: raw.total_volumes } : null
}

function toEdition(raw: RawEdition): Edition {
  return {
    isbn: raw.isbn,
    title: raw.title,
    volume: raw.volume,
    authors: raw.authors,
    publisher: raw.publisher,
    publishedOn: raw.published_on,
    coverUrl: raw.cover_url,
    series: toSeries(raw.series),
  }
}

function toEntry(raw: RawItem): Entry | null {
  if (!raw.editions) return null
  return {
    id: raw.id,
    status: raw.status === 'wanted' ? 'wanted' : 'owned',
    read: raw.read,
    price: raw.price,
    condition: raw.condition,
    notes: raw.notes,
    acquiredOn: raw.acquired_on,
    edition: toEdition(raw.editions),
  }
}

export async function listCollection(): Promise<Entry[]> {
  const { data, error } = await supabase.from('collection_items').select(SELECT)
  if (error) throw error
  return (data as unknown as RawItem[]).map(toEntry).filter((entry) => entry !== null)
}

export async function getEntry(isbn: string): Promise<Entry | null> {
  const { data, error } = await supabase
    .from('collection_items')
    .select(SELECT)
    .eq('isbn', isbn)
    .maybeSingle()
  if (error) throw error
  return data ? toEntry(data as unknown as RawItem) : null
}

/** Cherche une édition déjà présente dans le catalogue partagé. */
export async function getCatalogueEdition(isbn: string): Promise<Edition | null> {
  const { data, error } = await supabase
    .from('editions')
    .select(
      'isbn, title, volume, authors, publisher, published_on, cover_url, series ( id, name, total_volumes )',
    )
    .eq('isbn', isbn)
    .maybeSingle()
  if (error) throw error
  return data ? toEdition(data as unknown as RawEdition) : null
}

export interface NewAlbum {
  isbn: string
  title: string
  seriesName?: string
  volume?: number
  authors: string[]
  publisher?: string
  publishedOn?: string
  coverUrl?: string
  status: Status
  /** Origine des informations (« manual » par défaut). */
  source?: string
}

export class AlreadyInCollectionError extends Error {
  constructor() {
    super('Cet album est déjà dans votre collection.')
  }
}

/** Ajoute l'édition au catalogue partagé (si absente) puis à la collection de l'utilisateur. */
export async function addAlbum(userId: string, album: NewAlbum): Promise<void> {
  const { error: editionError } = await supabase.rpc('add_edition', {
    p_isbn: album.isbn,
    p_title: album.title,
    p_series_name: album.seriesName,
    p_volume: album.volume,
    p_authors: album.authors,
    p_publisher: album.publisher,
    p_published_on: album.publishedOn,
    p_cover_url: album.coverUrl,
    p_source: album.source ?? 'manual',
  })
  if (editionError) throw editionError

  const { error } = await supabase
    .from('collection_items')
    .insert({ user_id: userId, isbn: album.isbn, status: album.status })
  if (error) {
    if (error.code === '23505') throw new AlreadyInCollectionError()
    throw error
  }
}

export interface EntryChanges {
  status: Status
  read: boolean
  price: number | null
  condition: string | null
  notes: string | null
  acquiredOn: string | null
}

export async function updateEntry(id: string, changes: EntryChanges): Promise<void> {
  const { error } = await supabase
    .from('collection_items')
    .update({
      status: changes.status,
      read: changes.read,
      price: changes.price,
      condition: changes.condition,
      notes: changes.notes,
      acquired_on: changes.acquiredOn,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('collection_items').delete().eq('id', id)
  if (error) throw error
}
