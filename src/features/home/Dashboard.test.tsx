import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from '../../theme/ThemeProvider'
import type { Entry } from '../collection/types'
import Dashboard from './Dashboard'

vi.mock('../friends/useIncomingRequests', () => ({ useIncomingRequests: () => 0 }))
vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => ({ pseudo: 'Nico', role: 'user' }),
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))

const listCollection = vi.fn<() => Promise<Entry[]>>()
vi.mock('../collection/api', () => ({ listCollection: () => listCollection() }))
vi.mock('../series/api', () => ({ listSeriesSettings: async () => new Map() }))

const entry = (id: string, volume: number, status: 'owned' | 'wanted' = 'owned'): Entry => ({
  id,
  status,
  price: null,
  condition: null,
  notes: null,
  acquiredOn: null,
  addedAt: `2026-02-0${volume}T10:00:00Z`,
  dedication: null,
  dedicationBy: null,
  firstEdition: false,
  edition: {
    isbn: `isbn-${id}`,
    title: `Tome ${volume}`,
    volume,
    authors: [],
    publisher: null,
    publishedOn: null,
    coverUrl: null,
    kind: 'album',
    series: {
      id: 's1',
      name: 'Black Op',
      totalVolumes: 4,
      publicationStatus: null,
      startsAtZero: false,
    },
  },
})

function renderDashboard() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => listCollection.mockReset())
  afterEach(cleanup)

  it('invite à ajouter un premier album quand la collection est vide', async () => {
    listCollection.mockResolvedValue([])
    renderDashboard()
    expect(await screen.findByText('Votre collection est vide')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Chiffres clés' })).toBeNull()
  })

  it('affiche les chiffres, les séries à compléter et les derniers ajouts', async () => {
    listCollection.mockResolvedValue([entry('a', 1), entry('b', 2), entry('c', 3, 'wanted')])
    renderDashboard()
    expect(await screen.findByRole('region', { name: 'Chiffres clés' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nico' })).toBeTruthy()
    expect(screen.getByText('albums possédés').previousSibling?.textContent).toBe('2')
    expect(screen.getByRole('heading', { name: 'Séries à compléter' })).toBeTruthy()
    expect(screen.getByText(/2 \/ 4 tomes/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Progression de Black Op' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Derniers ajouts' })).toBeTruthy()
  })

  it('propose de parcourir les genres', async () => {
    listCollection.mockResolvedValue([])
    renderDashboard()
    const link = await screen.findByRole('link', { name: 'Science-fiction' })
    expect(link.getAttribute('href')).toBe('/explorer?genre=science-fiction')
  })
})
