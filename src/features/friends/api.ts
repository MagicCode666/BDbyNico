import { supabase } from '../../lib/supabase'

export interface Friend {
  id: string
  pseudo: string
  /** Moi : cette personne voit-elle ma bibliothèque ? */
  iShare: boolean
  /** Cette personne partage-t-elle sa bibliothèque avec moi ? */
  theyShare: boolean
}

export interface FriendRequest {
  userId: string
  pseudo: string
  /** « in » : reçue ; « out » : envoyée (en attente, un refus ne se voit pas). */
  direction: 'in' | 'out'
}

export async function listFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('list_friends')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.friend_id,
    pseudo: row.pseudo,
    iShare: row.i_share,
    theyShare: row.they_share,
  }))
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_friend_requests')
  if (error) throw error
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    pseudo: row.pseudo,
    direction: row.direction === 'in' ? 'in' : 'out',
  }))
}

export async function countIncomingRequests(): Promise<number> {
  const { data, error } = await supabase.rpc('count_incoming_friend_requests')
  if (error) throw error
  return data ?? 0
}

/** Demande par pseudo exact : aucune réponse ne dit si le pseudo existe. */
export async function sendFriendRequest(pseudo: string): Promise<void> {
  const { error } = await supabase.rpc('send_friend_request', { p_pseudo: pseudo })
  if (error) throw error
}

export async function respondToRequest(userId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_friend_request', {
    p_requester: userId,
    p_accept: accept,
  })
  if (error) throw error
}

export async function cancelRequest(userId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_friend_request', { p_addressee: userId })
  if (error) throw error
}

export async function removeFriend(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_friend: userId })
  if (error) throw error
}

export async function setFriendSharing(userId: string, share: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_friend_sharing', { p_friend: userId, p_share: share })
  if (error) throw error
}

/** Accepte un lien d'invitation ; renvoie le pseudo de la personne qui invitait. */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_friend_invite', { p_token: token })
  if (error) throw error
  return data
}

export async function loadInviteToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('invite_token')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data.invite_token
}

/** Nouveau lien d'invitation : l'ancien cesse de fonctionner. */
export async function regenerateInviteToken(): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_invite_token')
  if (error) throw error
  return data
}
