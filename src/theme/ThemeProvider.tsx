import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { ThemeContext } from './ThemeContext'
import {
  applyTheme,
  readPreference,
  resolveTheme,
  savePreference,
  type ThemePreference,
} from './theme'

const QUERY = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const systemPrefersDark = () => window.matchMedia(QUERY).matches

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark, () => true)
  const theme = resolveTheme(preference, prefersDark)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setPreference = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
