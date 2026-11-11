import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import ThemeProvider from '../../theme/ThemeProvider'
import type { SeriesData } from '../series/api'
import AlbumPage from './AlbumPage'
import type { Edition, Entry } from './types'

vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => undefined,
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))

const getCatalogueEdition = vi.fn<(isbn: string) => Promise<Edition | null>>()
const getEntry = vi.fn<(isbn: string) => Promise<Entry | null>>()
const fillEditionDetails = vi.fn(async () => undefined)
vi.mock('./api', () => ({
  getCatalogueEdition: (isbn: string) => getCatalogueEdition(isbn),
  getEntry: (isbn: string) => getEntry(isbn),
  fillEditionDetails: (...args: unknown[]) =>
    (fillEditionDetails as (...a: unknown[]) => unknown)(...args),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

const getSeriesData = vi.fn<(id: string) => Promise<SeriesData | null>>()
const addCatalogueEdition = vi.fn(async () => undefined)
vi.mock('../series/api', () => ({
  getSeriesData: (id: string) => getSeriesData(id),
  addCatalogueEdition: (...args: unknown[]) =>
    (addCatalogueEdition as (...a: unknown[]) => unknown)(...args),
}))

const lookupBnf = vi.fn()
vi.mock('./lookup/bnf', () => ({ lookupBnf: (isbn: string) => lookupBnf(isbn) }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../governance/CoverReportDialog', () => ({ default: () => null }))

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

const edition = (extra: Partial<Edition> = {}): Edition => ({
  isbn: '9782800100001',
  title: 'Deux agents',
  volume: 1,
  authors: ['Stephen Desberg', 'Hector Labiano'],
  publisher: 'Le Lombard',
  publishedOn: '2021-03-12',
  coverUrl: null,
  series: {
    id: 's1',
    name: 'Black Op',
    totalVolumes: 6,
    publicationStatus: 'finished',
    startsAtZero: false,
  },
  kind: 'album',
  summary: 'Un agent double dans la guerre froide.',
  pages: 48,
  formatCm: 32,
  publicPrice: 13.5,
  language: 'fre',
  detailsChecked: true,
  ...extra,
})

const entry = (): Entry => ({
  id: 'item-1',
  status: 'owned',
  price: null,
  condition: null,
  notes: null,
  acquiredOn: null,
  addedAt: null,
  dedication: null,
  dedicationBy: null,
  firstEdition: false,
  edition: edition(),
})

const seriesData = (): SeriesData => ({
  series: {
    id: 's1',
    name: 'Black Op',
    totalVolumes: 6,
    publicationStatus: 'finished',
    startsAtZero: false,
    genres: ['aventure', 'polar'],
  },
  editions: [1, 2].map((volume) => ({
    isbn: `isbn-${volume}`,
    title: `Tome ${volume}`,
    volume,
    coverUrl: null,
    authors: [],
    kind: 'album' as const,
  })),
  items: [{ id: 'item-1', isbn: 'isbn-1', status: 'owned' }],
  settings: { ignored: [], totalOverride: null },
})

function renderPage() {
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/collection/9782800100001']}>
          <Routes>
            <Route path="/collection/:isbn" element={<AlbumPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

describe('AlbumPage', () => {
  beforeEach(() => {
    getCatalogueEdition.mockReset().mockResolvedValue(edition())
    getEntry.mockReset().mockResolvedValue(entry())
    getSeriesData.mockReset().mockResolvedValue(seriesData())
    addCatalogueEdition.mockClear()
    fillEditionDetails.mockClear()
    lookupBnf.mockReset().mockResolvedValue(null)
  })
  afterEach(cleanup)

  it('affiche le titre, la série, le résumé et les caractéristiques', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Deux agents' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Black Op' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Un agent double dans la guerre froide.')).toBeTruthy()
    expect(screen.getByText('48')).toBeTruthy()
    expect(screen.getByText('32 cm de haut')).toBeTruthy()
    expect(screen.getByText('Français')).toBeTruthy()
    expect(screen.getByText(/13,50\s€/)).toBeTruthy()
    expect(screen.getByText('12 mars 2021', { selector: 'dd' })).toBeTruthy()
  })

  it('montre la fiche de collection et le bandeau de la série pour un album possédé', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Dans ma collection' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dans la série' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: "Je l'ai" })).toBeNull()
  })

  it("propose d'ajouter un album du catalogue qui n'est pas dans la collection", async () => {
    getEntry.mockResolvedValue(null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Je le veux' }))
    await waitFor(() =>
      expect(addCatalogueEdition).toHaveBeenCalledWith('u1', '9782800100001', 'wanted'),
    )
    expect(screen.queryByRole('heading', { name: 'Dans ma collection' })).toBeNull()
  })

  it("interroge la BnF une seule fois pour une fiche jamais complétée, puis l'enregistre", async () => {
    getCatalogueEdition.mockResolvedValue(
      edition({ summary: null, pages: null, detailsChecked: false }),
    )
    getEntry.mockResolvedValue(null)
    lookupBnf.mockResolvedValue({ authors: [], pages: 56, summary: 'Résumé BnF' })
    renderPage()
    await screen.findByRole('heading', { name: 'Deux agents' })
    await waitFor(() => expect(fillEditionDetails).toHaveBeenCalledTimes(1))
    expect(fillEditionDetails).toHaveBeenCalledWith('9782800100001', {
      authors: [],
      pages: 56,
      summary: 'Résumé BnF',
    })
    expect(lookupBnf).toHaveBeenCalledTimes(1)
  })

  it("n'interroge pas la BnF quand la fiche a déjà été vérifiée", async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Deux agents' })
    expect(lookupBnf).not.toHaveBeenCalled()
  })

  it('signale un album introuvable', async () => {
    getCatalogueEdition.mockResolvedValue(null)
    getEntry.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/n'est pas dans le catalogue/)).toBeTruthy()
  })
})
