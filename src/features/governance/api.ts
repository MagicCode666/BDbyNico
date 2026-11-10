import { supabase } from '../../lib/supabase'

export type Role = 'user' | 'moderator' | 'admin'
export type Contribution = 'full' | 'collection_only'
export type ChangeStatus = 'applied' | 'pending' | 'rejected' | 'reverted'
export type ChangeKind = 'create' | 'cover'
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
  isbn: string
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
    'possèdent cet album',
    'Limite quotidienne',
    'Seuls les possesseurs',
    'déjà traitée',
  ]
  return message && known.some((part) => message.includes(part)) ? message : fallback
}
