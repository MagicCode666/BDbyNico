import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { supabase } from '../lib/supabase'
import { AuthContext, type ActionResult, type AuthContextValue } from './AuthContext'
import { translateAuthError } from './errors'

// Les liens des emails ramènent à la racine du site (pas de fragment : HashRouter).
const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const toResult = (error: { code?: string } | null): ActionResult => ({
  error: error ? translateAuthError(error) : null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') setPasswordRecovery(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      passwordRecovery,
      signUp: async (email, password, pseudo) => {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { pseudo: pseudo.trim() }, emailRedirectTo: siteUrl() },
        })
        return toResult(error)
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        return toResult(error)
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        return toResult(error)
      },
      requestPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: siteUrl(),
        })
        return toResult(error)
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (!error) setPasswordRecovery(false)
        return toResult(error)
      },
    }),
    [session, loading, passwordRecovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
