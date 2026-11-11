import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from '../../theme/ThemeProvider'
import type { SharedRow } from './api'
import SharedPage from './SharedPage'
import { sharedCards, sharedSummary, shareUrl, toSharedEntries } from './sharedCollection'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const getSharedCollection = vi.fn<(token: string) => Promise<SharedRow[]>>()
vi.mock('./api', () => ({ getSharedCollection: (token: string) => getSharedCollection(token) }))

const row = (extra: Partial<SharedRow> = {}): SharedRow => ({
  pseudo: 'Nico',
  isbn: 'isbn-1',
  title: 'Tome 1',
  seriesId: 's1',
  seriesName: 'Black Op',
  seriesTotal: 4,
  seriesStatus: 'finished',
  startsAtZero: false,
  volume: 1,
  volumeFrom: null,
  volumeTo: null,
  kind: 'album',
  authors: [],
  coverUrl: null,
  status: 'owned',
  read: false,
  dedicated: false,
  ...extra,
})

describe('collection partagée', () => {
  it('compte séries, albums et envies, et construit une carte par série', () => {
    const entries = toSharedEntries([
      row(),
      row({ isbn: 'isbn-2', title: 'Tome 2', volume: 2, read: true }),
      row({ isbn: 'isbn-3', title: 'Tome 3', volume: 3, status: 'wanted' }),
    ])
    expect(sharedSummary(entries)).toEqual({ seriesCount: 1, ownedCount: 2, wantedCount: 1 })
    const [card] = sharedCards(entries, 'owned', 'jeton')
    expect(card).toMatchObject({
      name: 'Black Op',
      to: '/partage/jeton/s1',
      owned: 2,
      target: 4,
      readCount: 1,
      complete: false,
    })
  })

  it('ne montre pas comme envie un tome déjà possédé via une autre édition', () => {
    const entries = toSharedEntries([
      row(),
      row({ isbn: 'isbn-bis', title: 'Tome 1 bis', status: 'wanted' }),
    ])
    expect(sharedSummary(entries).wantedCount).toBe(0)
  })

  it("construit l'adresse du partage pour le routeur en mode hash", () => {
    expect(shareUrl('abc', 'https://exemple.test/BDbyNico/#/profil')).toBe(
      'https://exemple.test/BDbyNico/#/partage/abc',
    )
  })
})

describe('SharedPage', () => {
  beforeEach(() => getSharedCollection.mockReset())
  afterEach(cleanup)

  function renderAt(path: string) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/partage/:token" element={<SharedPage />} />
            <Route path="/partage/:token/:seriesId" element={<SharedPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
  }

  it('affiche la collection, sans compte', async () => {
    getSharedCollection.mockResolvedValue([row(), row({ isbn: 'isbn-2', volume: 2 })])
    renderAt('/partage/jeton')
    expect(await screen.findByRole('heading', { name: 'Nico' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Black Op' }).getAttribute('href')).toBe(
      '/partage/jeton/s1',
    )
  })

  it('affiche le détail d’une série avec ses tomes', async () => {
    getSharedCollection.mockResolvedValue([
      row(),
      row({ isbn: 'isbn-3', title: 'Tome 3', volume: 3, status: 'wanted' }),
    ])
    renderAt('/partage/jeton/s1')
    expect(await screen.findByRole('heading', { name: 'Black Op' })).toBeTruthy()
    expect(screen.getByText('T1')).toBeTruthy()
    expect(screen.getByText(/T3 · en envie/)).toBeTruthy()
  })

  it('refuse un lien invalide ou désactivé', async () => {
    getSharedCollection.mockResolvedValue([])
    renderAt('/partage/inconnu')
    expect(await screen.findByText(/pas valide/)).toBeTruthy()
  })
})
