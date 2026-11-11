import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import ThemeProvider from '../../theme/ThemeProvider'
import type { SeriesData } from './api'
import SeriesPage from './SeriesPage'

vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => undefined,
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./useMissingCovers', () => ({ useMissingCovers: () => ({ covers: {}, remaining: 0 }) }))

const getSeriesData = vi.fn<(id: string) => Promise<SeriesData>>()
const addCatalogueEdition = vi.fn(async () => undefined)
const setItemStatus = vi.fn(async () => undefined)
const saveSeriesSettings = vi.fn(async () => undefined)
vi.mock('./api', () => ({
  getSeriesData: (id: string) => getSeriesData(id),
  addCatalogueEdition: (...args: unknown[]) =>
    (addCatalogueEdition as (...a: unknown[]) => unknown)(...args),
  setItemStatus: (...args: unknown[]) => (setItemStatus as (...a: unknown[]) => unknown)(...args),
  saveSeriesSettings: (...args: unknown[]) =>
    (saveSeriesSettings as (...a: unknown[]) => unknown)(...args),
}))

const noop = async () => ({ error: null })
const auth: AuthContextValue = {
  session: null,
  user: { id: 'u1' } as AuthContextValue['user'],
  loading: false,
  passwordRecovery: false,
  signUp: noop,
  signIn: noop,
  signOut: noop,
  requestPasswordReset: noop,
  updatePassword: noop,
}

const edition = (volume: number) => ({
  isbn: `isbn-${volume}`,
  title: 'Black Op',
  volume,
  coverUrl: null,
  authors: ['S. Desberg', 'H. Labiano'],
  kind: 'album' as const,
})

const data = (): SeriesData => ({
  series: {
    id: 's1',
    name: 'Black Op',
    totalVolumes: 4,
    publicationStatus: 'finished',
    startsAtZero: false,
    genres: ['aventure', 'polar'],
  },
  editions: [1, 2, 3, 4].map(edition),
  items: [
    { id: 'item-1', isbn: 'isbn-1', status: 'owned' },
    { id: 'item-2', isbn: 'isbn-2', status: 'wanted' },
  ],
  settings: { ignored: [], totalOverride: null },
})

function renderPage() {
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/series/s1']}>
          <Routes>
            <Route path="/series/:seriesId" element={<SeriesPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

const tomeTitles = () =>
  screen.getAllByText(/^Black Op · Tome \d+$/).map((element) => element.textContent)

describe('SeriesPage', () => {
  beforeEach(() => {
    getSeriesData.mockReset()
    addCatalogueEdition.mockClear()
    setItemStatus.mockClear()
    getSeriesData.mockImplementation(async () => data())
  })
  afterEach(cleanup)

  it("affiche l'en-tête : titre, auteurs, statut et progression", async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Black Op' })).toBeTruthy()
    expect(screen.getByText('H. Labiano · S. Desberg')).toBeTruthy()
    // « Terminée » est aussi une option des réglages : on vise la pastille de l'en-tête
    expect(
      screen.getAllByText('Terminée').some((element) => element.classList.contains('badge')),
    ).toBe(true)
    expect(screen.getByText(/\/ 4 tomes/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    expect(tomeTitles()).toEqual([
      'Black Op · Tome 1',
      'Black Op · Tome 2',
      'Black Op · Tome 3',
      'Black Op · Tome 4',
    ])
  })

  it("filtre : Possédés ne garde que ceux qu'on a, Manquants ceux qui ne sont pas dans la collection", async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(screen.getByRole('button', { name: 'Possédés' }))
    expect(tomeTitles()).toEqual(['Black Op · Tome 1'])
    // Un tome en envie reste manquant à la collection
    fireEvent.click(screen.getByRole('button', { name: 'Manquants' }))
    expect(tomeTitles()).toEqual(['Black Op · Tome 2', 'Black Op · Tome 3', 'Black Op · Tome 4'])
    fireEvent.click(screen.getByRole('button', { name: 'Tous' }))
    expect(tomeTitles()).toHaveLength(4)
  })

  it('ajoute un tome manquant en un clic depuis son coin, puis recharge la série', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Ajouter à ma collection : Black Op · Tome 3' }),
    )
    await waitFor(() => expect(addCatalogueEdition).toHaveBeenCalledWith('u1', 'isbn-3', 'owned'))
    await waitFor(() => expect(getSeriesData).toHaveBeenCalledTimes(2))
  })

  it('passe un tome en envie à « possédé » depuis son coin', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(screen.getByRole('button', { name: "Je l'ai : Black Op · Tome 2" }))
    await waitFor(() => expect(setItemStatus).toHaveBeenCalledWith('item-2', 'owned'))
  })

  it('« Tout ajouter » demande confirmation puis ajoute les manquants et valide les envies', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(screen.getByRole('button', { name: /Tout ajouter à ma collection/ }))
    expect(screen.getByText('Ajouter 3 tome(s) à ma collection ?')).toBeTruthy()
    expect(addCatalogueEdition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(addCatalogueEdition).toHaveBeenCalledTimes(2))
    expect(addCatalogueEdition).toHaveBeenCalledWith('u1', 'isbn-3', 'owned')
    expect(addCatalogueEdition).toHaveBeenCalledWith('u1', 'isbn-4', 'owned')
    expect(setItemStatus).toHaveBeenCalledWith('item-2', 'owned')
  })

  it('« Tout ajouter » peut être annulé sans rien ajouter', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(screen.getByRole('button', { name: /Tout ajouter à ma collection/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(addCatalogueEdition).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Tout ajouter à ma collection/ })).toBeTruthy()
  })

  it('« Manquants en envie » ajoute seulement les tomes du catalogue absents', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Black Op' })
    fireEvent.click(screen.getByRole('button', { name: /Mettre les manquants en envie/ }))
    expect(screen.getByText('Mettre 2 tome(s) en envie ?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(addCatalogueEdition).toHaveBeenCalledTimes(2))
    expect(addCatalogueEdition).toHaveBeenCalledWith('u1', 'isbn-3', 'wanted')
    expect(setItemStatus).not.toHaveBeenCalled()
  })
})
