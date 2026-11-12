/**
 * Thèmes de l'application : Dark (sombre, par défaut) et Light (clair). La préférence « auto »
 * suit le réglage de l'appareil ; tout choix, « auto » compris, est mémorisé.
 */
export type Theme = 'rouille' | 'clair'
export type ThemePreference = 'auto' | Theme

export const THEME_KEY = 'bdbynico:theme'

/** Préférence tant que rien n'a été choisi. */
export const DEFAULT_PREFERENCE: ThemePreference = 'rouille'

export const THEME_LABELS: Record<ThemePreference, string> = {
  auto: "Automatique (selon l'appareil)",
  rouille: 'Dark',
  clair: 'Light',
}

/** Couleur de la barre du navigateur (mobile) pour chaque thème. */
export const THEME_COLORS: Record<Theme, string> = {
  rouille: '#120e0c',
  clair: '#f4f4f2',
}

export function toPreference(value: string | null | undefined): ThemePreference {
  return value === 'auto' || value === 'rouille' || value === 'clair' ? value : DEFAULT_PREFERENCE
}

/** Thème effectif : le choix manuel, sinon celui de l'appareil (sombre ou clair). */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference !== 'auto') return preference
  return systemPrefersDark ? 'rouille' : 'clair'
}

export function readPreference(): ThemePreference {
  try {
    return toPreference(localStorage.getItem(THEME_KEY))
  } catch {
    return DEFAULT_PREFERENCE
  }
}

export function savePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference)
  } catch {
    // stockage indisponible : le choix vaut pour cette session seulement
  }
}

/** Applique le thème au document : jetons de couleur (data-theme) et barre du navigateur. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}
