import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from '../../theme/ThemeProvider'
import ExplorerPage from './ExplorerPage'
import type { ExplorerSeries } from './api'

vi.mock('../friends/useIncomingRequests', () => ({ useIncomingRequests: () => 0 }))
vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => undefined,
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))

const listSeriesByGenre = vi.fn<(genre: string) => Promise<ExplorerSeries[]>>()
vi.mock('./api', () => ({ listSeriesByGenre: (genre: string) => listSeriesByGenre(genre) }))

const series = (extra: Partial<ExplorerSeries>): ExplorerSeries => ({
  id: 's1',
  name: 'Black Op',
  totalVolumes: 6,
  publicationStatus: 'finished',
  genres: ['polar'],
  coverUrl: null,
  owned: 2,
  ...extra,
})

function renderAt(url: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/explorer" element={<ExplorerPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('ExplorerPage', () => {
  beforeEach(() => listSeriesByGenre.mockReset().mockResolvedValue([series({})]))
  afterEach(cleanup)

  it('invite à choisir un genre, sans interroger la base', () => {
    renderAt('/explorer')
    expect(screen.getByText(/Choisissez un genre/)).toBeTruthy()
    expect(listSeriesByGenre).not.toHaveBeenCalled()
  })

  it('liste les séries du genre, avec ma progression', async () => {
    renderAt('/explorer?genre=polar')
    expect(await screen.findByRole('link', { name: /Black Op/ })).toBeTruthy()
    expect(listSeriesByGenre).toHaveBeenCalledWith('polar')
    expect(screen.getByText(/2 \/ 6 tomes à moi/)).toBeTruthy()
  })

  it('ignore un genre inconnu', () => {
    renderAt('/explorer?genre=bidon')
    expect(screen.getByText(/Choisissez un genre/)).toBeTruthy()
    expect(listSeriesByGenre).not.toHaveBeenCalled()
  })

  it("explique qu'un genre est vide", async () => {
    listSeriesByGenre.mockResolvedValue([])
    renderAt('/explorer?genre=western')
    expect(await screen.findByText(/Aucune série n'est encore classée/)).toBeTruthy()
  })
})
