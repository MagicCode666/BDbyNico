/**
 * Thèmes de l'application : « Rouille et chrome » (sombre) et « Papier et encre » (clair).
 * La préférence « auto » suit le réglage de l'appareil ; un choix manuel est mémorisé.
 */
export type Theme = 'rouille' | 'clair'
export type ThemePreference = 'auto' | Theme

export const THEME_KEY = 'bdbynico:theme'

export const THEME_LABELS: Record<ThemePreference, string> = {
  auto: "Automatique (selon l'appareil)",
  rouille: 'Rouille et chrome (sombre)',
  clair: 'Papier et encre (clair)',
}

/** Couleur de la barre du navigateur (mobile) pour chaque thème. */
export const THEME_COLORS: Record<Theme, string> = {
  rouille: '#120e0c',
  clair: '#f4f4f2',
}

export function toPreference(value: string | null | undefined): ThemePreference {
  return value === 'rouille' || value === 'clair' ? value : 'auto'
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
    return 'auto'
  }
}

export function savePreference(preference: ThemePreference): void {
  try {
    if (preference === 'auto') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, preference)
  } catch {
    // stockage indisponible : le choix vaut pour cette session seulement
  }
}

/** Applique le thème au document : jetons de couleur (data-theme) et barre du navigateur. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}
