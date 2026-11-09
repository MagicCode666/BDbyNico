import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'

/** Résultat d'une action : `error` est un message en français, ou null si tout s'est bien passé. */
export interface ActionResult {
  error: string | null
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  /** Vrai tant que la session initiale n'a pas été lue. */
  loading: boolean
  /** Vrai quand l'utilisateur arrive depuis un lien de réinitialisation de mot de passe. */
  passwordRecovery: boolean
  signUp: (email: string, password: string, pseudo: string) => Promise<ActionResult>
  signIn: (email: string, password: string) => Promise<ActionResult>
  signOut: () => Promise<ActionResult>
  requestPasswordReset: (email: string) => Promise<ActionResult>
  updatePassword: (password: string) => Promise<ActionResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
