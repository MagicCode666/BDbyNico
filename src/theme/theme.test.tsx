import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from './ThemeProvider'
import { resolveTheme, THEME_KEY, toPreference } from './theme'
import { useTheme } from './useTheme'

describe('resolveTheme', () => {
  it("suit l'appareil en automatique", () => {
    expect(resolveTheme('auto', true)).toBe('rouille')
    expect(resolveTheme('auto', false)).toBe('clair')
  })

  it("respecte un choix manuel, quel que soit l'appareil", () => {
    expect(resolveTheme('clair', true)).toBe('clair')
    expect(resolveTheme('rouille', false)).toBe('rouille')
  })

  it('lit une préférence inconnue comme le thème par défaut (sombre)', () => {
    expect(toPreference('clair')).toBe('clair')
    expect(toPreference('rouille')).toBe('rouille')
    expect(toPreference('auto')).toBe('auto')
    expect(toPreference('violet')).toBe('rouille')
    expect(toPreference(null)).toBe('rouille')
  })
})

function Probe() {
  const { preference, theme, setPreference } = useTheme()
  return (
    <div>
      <p data-testid="etat">{`${preference}/${theme}`}</p>
      <button onClick={() => setPreference('clair')}>clair</button>
      <button onClick={() => setPreference('auto')}>auto</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  let dark = true
  let listener: (() => void) | null = null

  beforeEach(() => {
    dark = true
    listener = null
    localStorage.clear()
    document.head.innerHTML = '<meta name="theme-color" content="#000000">'
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark
      },
      addEventListener: (_: string, cb: () => void) => (listener = cb),
      removeEventListener: () => (listener = null),
    }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const renderProvider = () =>
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
  const barColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

  it("démarre en sombre, même si l'appareil est en clair", () => {
    dark = false
    renderProvider()
    expect(screen.getByTestId('etat').textContent).toBe('rouille/rouille')
    expect(document.documentElement.dataset.theme).toBe('rouille')
    expect(barColor()).toBe('#120e0c')
  })

  it('mémorise un choix manuel et met à jour la barre du navigateur', () => {
    renderProvider()
    act(() => screen.getByText('clair').click())
    expect(screen.getByTestId('etat').textContent).toBe('clair/clair')
    expect(document.documentElement.dataset.theme).toBe('clair')
    expect(localStorage.getItem(THEME_KEY)).toBe('clair')
    expect(barColor()).toBe('#f4f4f2')
  })

  it('passe en automatique et le mémorise', () => {
    localStorage.setItem(THEME_KEY, 'clair')
    renderProvider()
    expect(screen.getByTestId('etat').textContent).toBe('clair/clair')
    act(() => screen.getByText('auto').click())
    expect(localStorage.getItem(THEME_KEY)).toBe('auto')
    expect(screen.getByTestId('etat').textContent).toBe('auto/rouille')
  })

  it("suit un changement de réglage de l'appareil en automatique", () => {
    localStorage.setItem(THEME_KEY, 'auto')
    renderProvider()
    dark = false
    act(() => listener?.())
    expect(screen.getByTestId('etat').textContent).toBe('auto/clair')
    expect(document.documentElement.dataset.theme).toBe('clair')
  })

  it("ne suit pas l'appareil quand le choix est manuel", () => {
    localStorage.setItem(THEME_KEY, 'rouille')
    renderProvider()
    dark = false
    act(() => listener?.())
    expect(screen.getByTestId('etat').textContent).toBe('rouille/rouille')
  })
})
