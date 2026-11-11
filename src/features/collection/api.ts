import type { AlbumDetails } from '../../lib/bnfFields'
import { supabase } from '../../lib/supabase'
import { toPublicationStatus } from '../series/status'
import { toAlbumKind } from './kinds'
import type { Dedication, Edition, Entry, SeriesInfo, Status } from './types'
import { withoutSupersededWishes } from './utils'

const SELECT = `
  id, status, price, condition, notes, acquired_on, created_at, dedication, dedication_by,
  first_edition,
  editions (
    isbn, title, volume, authors, publisher, published_on, cover_url,
    review_status, cover_locked, kind, volume_from, volume_to,
    summary, pages, format_cm, public_price, language, details_checked_at,
    series ( id, name, total_volumes, publication_status, starts_at_zero )
  )
`

interface RawSeries {
  id: string
  name: string
  total_volumes: number | null
  publication_status: string | null
  starts_at_zero?: boolean
}

interface RawEdition {
  isbn: string
  title: string
  volume: number | null
  authors: string[]
  publisher: string | null
  published_on: string | null
  cover_url: string | null
  review_status?: string
  cover_locked?: boolean
  kind?: string
  volume_from?: number | null
  volume_to?: number | null
  summary?: string | null
  pages?: number | null
  format_cm?: number | null
  public_price?: number | string | null
  language?: string | null
  details_checked_at?: string | null
  series: RawSeries | null
}

interface RawItem {
  id: string
  status: string
  price: number | null
  condition: string | null
  notes: string | null
  acquired_on: string | null
  created_at: string | null
  dedication: string | null
  dedication_by: string | null
  first_edition: boolean
  editions: RawEdition | null
}

function toDedication(value: string | null): Dedication | null {
  return value === 'signature' || value === 'drawing' ? value : null
}

function toSeries(raw: RawSeries | null): SeriesInfo | null {
  return raw
    ? {
        id: raw.id,
        name: raw.name,
        totalVolumes: raw.total_volumes,
        publicationStatus: toPublicationStatus(raw.publication_status),
        startsAtZero: raw.starts_at_zero ?? false,
      }
    : null
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
    coverLocked: raw.cover_locked ?? false,
    kind: toAlbumKind(raw.kind),
    volumeFrom: raw.volume_from ?? null,
    volumeTo: raw.volume_to ?? null,
    pending: raw.review_status === 'pending',
    summary: raw.summary ?? null,
    pages: raw.pages ?? null,
    formatCm: raw.format_cm ?? null,
    // numeric(6,2) arrive parfois sous forme de texte
    publicPrice: raw.public_price == null ? null : Number(raw.public_price),
    language: raw.language ?? null,
    detailsChecked: raw.details_checked_at != null,
  }
}

function toEntry(raw: RawItem): Entry | null {
  if (!raw.editions) return null
  return {
    id: raw.id,
    status: raw.status === 'wanted' ? 'wanted' : 'owned',
    price: raw.price,
    condition: raw.condition,
    notes: raw.notes,
    acquiredOn: raw.acquired_on,
    addedAt: raw.created_at,
    dedication: toDedication(raw.dedication),
    dedicationBy: raw.dedication_by,
    firstEdition: raw.first_edition,
    edition: toEdition(raw.editions),
  }
}

export async function listCollection(): Promise<Entry[]> {
  const { data, error } = await supabase.from('collection_items').select(SELECT)
  if (error) throw error
  return withoutSupersededWishes(
    (data as unknown as RawItem[]).map(toEntry).filter((entry) => entry !== null),
  )
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
      'isbn, title, volume, authors, publisher, published_on, cover_url, cover_locked, review_status, kind, volume_from, volume_to, summary, pages, format_cm, public_price, language, details_checked_at, series ( id, name, total_volumes, publication_status, starts_at_zero )',
    )
    .eq('isbn', isbn)
    .maybeSingle()
  if (error) throw error
  return data ? toEdition(data as unknown as RawEdition) : null
}

/** Complète la fiche d'un album avec ce que la BnF en dit (jamais d'écrasement côté base). */
export async function fillEditionDetails(isbn: string, details: AlbumDetails): Promise<void> {
  const { error } = await supabase.rpc('fill_edition_details', {
    p_isbn: isbn,
    p_summary: details.summary,
    p_pages: details.pages,
    p_format_cm: details.formatCm,
    p_public_price: details.publicPrice,
    p_language: details.language,
  })
  if (error) throw error
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
  /** null : l'album est seulement référencé au catalogue, sans entrer dans la collection. */
  status: Status | null
  /** Origine des informations (« manual » par défaut). */
  source?: string
}

export class AlreadyInCollectionError extends Error {
  constructor() {
    super('Cet album est déjà dans votre collection.')
  }
}

/**
 * Ajoute l'édition au catalogue partagé (si absente) puis, sauf demande contraire (status null),
 * à la collection de l'utilisateur.
 */
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
  if (album.status === null) return

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
  price: number | null
  condition: string | null
  notes: string | null
  acquiredOn: string | null
  dedication: Dedication | null
  dedicationBy: string | null
  firstEdition: boolean
}

export async function updateEntry(id: string, changes: EntryChanges): Promise<void> {
  const { error } = await supabase
    .from('collection_items')
    .update({
      status: changes.status,
      price: changes.price,
      condition: changes.condition,
      notes: changes.notes,
      acquired_on: changes.acquiredOn,
      dedication: changes.dedication,
      // Le nom de l'auteur n'a de sens que s'il y a une dédicace
      dedication_by: changes.dedication ? changes.dedicationBy : null,
      first_edition: changes.firstEdition,
    })
    .eq('id', id)
  if (error) throw error
}

/** Nombre d'albums dans la collection de l'utilisateur (possédés et envies). */
export async function countEntries(): Promise<number> {
  const { count, error } = await supabase
    .from('collection_items')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/**
 * Retire tous les albums de la collection de l'utilisateur. Le compte et le catalogue partagé ne
 * sont pas touchés ; ses réglages de séries (tomes ignorés, totaux personnels) ne sont effacés
 * que sur demande.
 */
export async function clearCollection(userId: string, resetSeriesSettings: boolean): Promise<void> {
  const { error } = await supabase.from('collection_items').delete().eq('user_id', userId)
  if (error) throw error
  if (resetSeriesSettings) {
    const { error: settingsError } = await supabase
      .from('user_series_settings')
      .delete()
      .eq('user_id', userId)
    if (settingsError) throw settingsError
  }
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('collection_items').delete().eq('id', id)
  if (error) throw error
}
