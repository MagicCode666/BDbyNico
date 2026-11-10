import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import ThemeProvider from '../../theme/ThemeProvider'
import { groupHits, type SearchHit, type SearchResults } from './api'
import SearchPage from './SearchPage'

vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => undefined,
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const searchCatalogue = vi.fn<(query: string) => Promise<SearchResults>>()
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchCatalogue: (query: string) => searchCatalogue(query),
}))
const addCatalogueEdition = vi.fn(async () => undefined)
vi.mock('../series/api', () => ({
  addCatalogueEdition: (...args: unknown[]) =>
    (addCatalogueEdition as (...a: unknown[]) => unknown)(...args),
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

const hit = (extra: Partial<SearchHit>): SearchHit => ({
  kind: 'album',
  ref: 'x',
  label: 'Titre',
  detail: '',
  coverUrl: null,
  seriesId: null,
  isbn: null,
  myStatus: null,
  ...extra,
})

const results = groupHits([
  hit({
    kind: 'serie',
    ref: 's1',
    label: 'Black Op',
    detail: '8 album(s) · 6 possédé(s)',
    seriesId: 's1',
  }),
  hit({
    ref: '9782205054910',
    label: 'Deux agents',
    detail: 'Black Op T1',
    isbn: '9782205054910',
    seriesId: 's1',
    myStatus: 'owned',
  }),
  hit({
    ref: '9782205058789',
    label: 'Le piège',
    detail: 'Black Op T3',
    isbn: '9782205058789',
    seriesId: 's1',
  }),
  hit({ kind: 'auteur', ref: 'Hector Labiano', label: 'Hector Labiano', detail: '8 album(s)' }),
])

function renderPage(path = '/recherche?q=black') {
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <SearchPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

describe('groupHits', () => {
  it('range les résultats par type', () => {
    expect(results.series).toHaveLength(1)
    expect(results.albums).toHaveLength(2)
    expect(results.authors).toHaveLength(1)
  })
})

describe('SearchPage', () => {
  beforeEach(() => {
    searchCatalogue.mockReset()
    addCatalogueEdition.mockClear()
    searchCatalogue.mockResolvedValue(results)
  })
  afterEach(cleanup)

  it('affiche séries, albums et auteurs trouvés', async () => {
    renderPage()
    expect(await screen.findByText('8 album(s) · 6 possédé(s)')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Auteurs' })).toBeTruthy()
    expect(screen.getByText('Possédé')).toBeTruthy()
    expect(searchCatalogue).toHaveBeenCalledWith('black')
  })

  it("propose d'ajouter seulement les albums que l'on n'a pas, en un clic", async () => {
    renderPage()
    await screen.findByRole('button', { name: '+ Envie' })
    expect(screen.getAllByRole('button', { name: '+ Possédé' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '+ Envie' }))
    await waitFor(() =>
      expect(addCatalogueEdition).toHaveBeenCalledWith('u1', '9782205058789', 'wanted'),
    )
    // L'album passe tout de suite à « Envie », sans relancer la recherche
    await screen.findByText('Envie')
    expect(screen.queryByRole('button', { name: '+ Envie' })).toBeNull()
    expect(searchCatalogue).toHaveBeenCalledTimes(1)
  })

  it("n'interroge pas la base sous deux caractères", async () => {
    searchCatalogue.mockResolvedValue({ series: [], albums: [], authors: [] })
    renderPage('/recherche?q=b')
    expect(await screen.findByText(/Tapez au moins 2 caractères/)).toBeTruthy()
  })

  it("propose d'ajouter un album quand rien ne correspond", async () => {
    searchCatalogue.mockResolvedValue({ series: [], albums: [], authors: [] })
    renderPage('/recherche?q=zzzz')
    expect(await screen.findByText(/Aucun résultat pour/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ajouter un album par son ISBN' })).toBeTruthy()
  })

  it("affiche un message d'erreur si la recherche échoue", async () => {
    searchCatalogue.mockRejectedValue(new Error('réseau'))
    renderPage()
    expect(await screen.findByText('La recherche a échoué. Réessayez.')).toBeTruthy()
  })
})
