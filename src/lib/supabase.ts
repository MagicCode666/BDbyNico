import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes (voir .env.example).',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  // PKCE : les liens des emails renvoient un `?code=` (et non un fragment `#`, réservé à HashRouter)
  auth: { flowType: 'pkce' },
})
