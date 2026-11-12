import { supabase } from '../../lib/supabase'

/** Enregistre (ou, avec null, retire) l'avatar de l'utilisateur. */
export async function saveAvatar(userId: string, avatar: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar }).eq('id', userId)
  if (error) throw error
}
