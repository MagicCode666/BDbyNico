import { supabase } from '../../lib/supabase'

/** Message affiché quand le dernier administrateur tente de supprimer son compte. */
export const LAST_ADMIN_MESSAGE =
  'Vous êtes le dernier administrateur : désignez-en un autre avant de supprimer votre compte.'

/** Supprime le compte connecté et toutes ses données privées. Irréversible. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error)
    throw new Error(error.message === 'Dernier administrateur' ? LAST_ADMIN_MESSAGE : error.message)
}
