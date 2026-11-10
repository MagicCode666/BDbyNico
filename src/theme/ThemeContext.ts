import { createContext } from 'react'

import type { Theme, ThemePreference } from './theme'

export interface ThemeContextValue {
  /** Ce que l'utilisateur a choisi (auto, rouille ou clair). */
  preference: ThemePreference
  /** Le thème réellement affiché. */
  theme: Theme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
