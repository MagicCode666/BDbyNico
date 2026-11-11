import { supabase } from '../../lib/supabase'

export type Role = 'user' | 'moderator' | 'admin'
export type Contribution = 'full' | 'collection_only'
export type ChangeStatus = 'applied' | 'pending' | 'rejected' | 'reverted'
export type ChangeKind =
  | 'create'
  | 'cover'
  | 'edition_kind'
  | 'edition_title'
  | 'edition_volume'
  | 'edition_authors'
  | 'edition_publisher'
  | 'edition_date'
  | 'edition_series'
  | 'series_name'
  | 'series_total'
  | 'series_status'
  | 'series_genres'
  | 'series_merge'
export type ChangeOrigin = 'user' | 'import' | 'job' | 'admin'

export interface Access {
  role: Role
  contribution: Contribution
  isModerator: boolean
  isAdmin: boolean
}

export const NO_ACCESS: Access = {
  role: 'user',
  contribution: 'full',
  isModerator: false,
  isAdmin: false,
}

function toRole(value: string): Role {
  return value === 'admin' || value === 'moderator' ? value : 'user'
}

/** Rôle et niveau de contribution de l'utilisateur connecté. */
export async function getMyAccess(userId: string): Promise<Access> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, contribution')
    .eq('id', userId)
    .single()
  if (error) throw error
  const role = toRole(data.role)
  return {
    role,
    contribution: data.contribution === 'collection_only' ? 'collection_only' : 'full',
    isModerator: role !== 'user',
    isAdmin: role === 'admin',
  }
}

export type ReportResult = 'applied' | 'pending' | 'unchanged'

/** Signale une mauvaise couverture et propose la bonne (null : « aucune couverture »). */
export async function reportCover(isbn: string, coverUrl: string | null): Promise<ReportResult> {
  const { data, error } = await supabase.rpc('report_cover', {
    p_isbn: isbn,
    // La fonction accepte null (« aucune couverture ») : les types générés ne le disent pas
    p_cover_url: coverUrl as string,
  })
  if (error) throw error
  return data === 'pending' || data === 'unchanged' ? data : 'applied'
}

export interface Change {
  id: number
  createdAt: string
  userId: string | null
  pseudo: string | null
  origin: ChangeOrigin
  kind: ChangeKind
  /** null pour un changement de série */
  isbn: string | null
  seriesId: string | null
  title: string | null
  seriesName: string | null
  volume: number | null
  oldValue: string | null
  newValue: string | null
  status: ChangeStatus
  reviewedPseudo: string | null
  reviewedAt: string | null
  revertsId: number | null
  currentCover: string | null
}

export interface ChangeFilters {
  status?: ChangeStatus
  userId?: string
  origin?: ChangeOrigin
  hideJob?: boolean
  before?: number
  limit?: number
}

export async function listChanges(filters: ChangeFilters = {}): Promise<Change[]> {
  const { data, error } = await supabase.rpc('list_catalogue_changes', {
    p_status: filters.status,
    p_user: filters.userId,
    p_origin: filters.origin,
    p_hide_job: filters.hideJob ?? false,
    p_before: filters.before,
    p_limit: filters.limit ?? 50,
  })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    pseudo: row.pseudo,
    origin: row.origin as ChangeOrigin,
    kind: row.kind as ChangeKind,
    isbn: row.isbn,
    seriesId: row.series_id,
    title: row.title,
    seriesName: row.series_name,
    volume: row.volume,
    oldValue: row.old_value,
    newValue: row.new_value,
    status: row.status as ChangeStatus,
    reviewedPseudo: row.reviewed_pseudo,
    reviewedAt: row.reviewed_at,
    revertsId: row.reverts_id,
    currentCover: row.current_cover,
  }))
}

/** Nombre de propositions en attente (visible des modérateurs seulement). */
export async function countPending(): Promise<number> {
  const { count, error } = await supabase
    .from('catalogue_changes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function reviewChange(id: number, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('review_change', { p_id: id, p_accept: accept })
  if (error) throw error
}

export async function revertChange(id: number): Promise<void> {
  const { error } = await supabase.rpc('revert_change', { p_id: id })
  if (error) throw error
}

export interface AdminUser {
  id: string
  pseudo: string
  role: Role
  contribution: Contribution
  createdAt: string
  collectionCount: number
  changeCount: number
  pendingCount: number
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('list_users_admin')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    pseudo: row.pseudo,
    role: toRole(row.role),
    contribution: row.contribution === 'collection_only' ? 'collection_only' : 'full',
    createdAt: row.created_at,
    collectionCount: Number(row.collection_count),
    changeCount: Number(row.change_count),
    pendingCount: Number(row.pending_count),
  }))
}

export async function setContribution(userId: string, level: Contribution): Promise<void> {
  const { error } = await supabase.rpc('set_contribution_level', {
    p_user: userId,
    p_level: level,
  })
  if (error) throw error
}

/** Message lisible pour une erreur renvoyée par une fonction de gouvernance. */
export function governanceErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message
  const known = [
    'a changé depuis',
    'Une série porte déjà ce nom',
    'Nom de série invalide',
    'Le total doit être',
    'possèdent cet album',
    'Limite quotidienne',
    'Seuls les possesseurs',
    'Plage de tomes invalide',
    'Le titre doit',
    'Le numéro de tome',
    'Trop d',
    'Série introuvable',
    'Choisissez deux',
    'Une fusion ne s',
    'Éditeur trop long',
    'La série d',
    'déjà traitée',
  ]
  return message && known.some((part) => message.includes(part)) ? message : fallback
}

export interface AdminSeries {
  id: string
  name: string
  totalVolumes: number | null
  /** « manual » : total fixé par un modérateur, le job n'y touche plus. */
  totalSource: 'auto' | 'manual'
  publicationStatus: 'ongoing' | 'finished' | null
  statusSource: 'auto' | 'manual'
  editionCount: number
}

export async function listSeriesAdmin(query: string): Promise<AdminSeries[]> {
  const { data, error } = await supabase.rpc('list_series_admin', { p_query: query, p_limit: 30 })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    totalVolumes: row.total_volumes,
    totalSource: row.total_source === 'manual' ? 'manual' : 'auto',
    publicationStatus:
      row.publication_status === 'ongoing' || row.publication_status === 'finished'
        ? row.publication_status
        : null,
    statusSource: row.status_source === 'manual' ? 'manual' : 'auto',
    editionCount: Number(row.edition_count),
  }))
}

export async function renameSeries(seriesId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_series', { p_series: seriesId, p_name: name })
  if (error) throw error
}

/** Fixe le total partagé ; null le rend au job automatique. */
export async function setSeriesTotal(seriesId: string, total: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_series_total', {
    p_series: seriesId,
    // La fonction accepte null (retour au job) : les types générés ne le disent pas
    p_total: total as number,
  })
  if (error) throw error
}

/** Fixe le statut partagé ; null le rend au job automatique. */
export async function setSeriesStatus(
  seriesId: string,
  status: 'ongoing' | 'finished' | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_series_status', {
    p_series: seriesId,
    p_status: status as string,
  })
  if (error) throw error
}

/** Fixe les genres de la série (3 au plus, liste fermée). */
export async function setSeriesGenres(seriesId: string, genres: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_series_genres', {
    p_series: seriesId,
    p_genres: genres,
  })
  if (error) throw error
}

/** Change le type d'un album (tome, intégrale avec sa plage de tomes, hors-série). */
export async function setEditionKind(
  isbn: string,
  kind: 'album' | 'integral' | 'special',
  from: number | null,
  to: number | null,
): Promise<ReportResult> {
  const { data, error } = await supabase.rpc('set_edition_kind', {
    p_isbn: isbn,
    p_kind: kind,
    // La fonction accepte null (pas de plage) : les types générés ne le disent pas
    p_from: from as number,
    p_to: to as number,
  })
  if (error) throw error
  return data === 'pending' || data === 'unchanged' ? data : 'applied'
}

export interface EditionCorrections {
  title?: string
  /** null : album sans numéro de tome. */
  volume?: number | null
  authors?: string[]
  /** null ou vide : éditeur inconnu. */
  publisher?: string | null
  /** Date ISO (AAAA-MM-JJ) ; null ou vide : date inconnue. */
  publishedOn?: string | null
}

/** Corrige les informations d'un album (modérateurs) : chaque champ changé est journalisé. */
export async function correctEdition(isbn: string, changes: EditionCorrections): Promise<number> {
  const payload: Record<string, unknown> = {}
  if (changes.title !== undefined) payload.title = changes.title
  if (changes.volume !== undefined) payload.volume = changes.volume
  if (changes.authors !== undefined) payload.authors = changes.authors
  if (changes.publisher !== undefined) payload.publisher = changes.publisher
  if (changes.publishedOn !== undefined) payload.published_on = changes.publishedOn
  const { data, error } = await supabase.rpc('correct_edition', {
    p_isbn: isbn,
    p_changes: payload as never,
  })
  if (error) throw error
  return data
}

/** Rattache un album à une série, ou le détache (null) : son numéro de tome est alors effacé. */
export async function setEditionSeries(isbn: string, seriesId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_edition_series', {
    p_isbn: isbn,
    // La fonction accepte null (détacher) : les types générés ne le disent pas
    p_series: seriesId as string,
  })
  if (error) throw error
}

/** Fusionne la série `from` dans la série `into` : renvoie le nombre d'albums déplacés. */
export async function mergeSeries(from: string, into: string): Promise<number> {
  const { data, error } = await supabase.rpc('merge_series', { p_from: from, p_into: into })
  if (error) throw error
  return data
}
