import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from '../../theme/ThemeProvider'
import AddAlbumPage from './AddAlbumPage'

vi.mock('../friends/useIncomingRequests', () => ({ useIncomingRequests: () => 0 }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => ({ pseudo: 'Nico', role: 'user' }),
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))
vi.mock('../governance/api', () => ({ setEditionKind: vi.fn() }))
vi.mock('./lookup', () => ({ findAlbumInfo: vi.fn() }))

const addAlbum = vi.fn()
vi.mock('./api', () => ({
  addAlbum: (...args: unknown[]) => addAlbum(...args),
  AlreadyInCollectionError: class extends Error {},
}))

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/collection/ajouter" element={<AddAlbumPage />} />
          <Route path="/collection/:isbn" element={<p>Fiche de l’album</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('AddAlbumPage : référencer sans collectionner', () => {
  beforeEach(() => addAlbum.mockReset().mockResolvedValue(undefined))
  afterEach(cleanup)

  it('propose « catalogue seulement » et ne l’ajoute à aucune liste', async () => {
    renderAt('/collection/ajouter?serie=Naheulbeuk&tome=7&statut=catalogue')
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Statut' }).value).toBe(
      'catalogue',
    )
    fireEvent.change(screen.getByLabelText(/^ISBN/), { target: { value: '9782070612758' } })
    fireEvent.change(screen.getByLabelText(/^Titre/), { target: { value: 'Troisième Saison' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans le catalogue' }))
    await waitFor(() => expect(addAlbum).toHaveBeenCalled())
    expect(addAlbum.mock.calls[0][1]).toMatchObject({
      isbn: '9782070612758',
      seriesName: 'Naheulbeuk',
      volume: 7,
      status: null,
    })
    expect(await screen.findByText('Fiche de l’album')).toBeTruthy()
  })

  it('ajoute à la collection par défaut', async () => {
    renderAt('/collection/ajouter')
    fireEvent.change(screen.getByLabelText(/^ISBN/), { target: { value: '9782070612758' } })
    fireEvent.change(screen.getByLabelText(/^Titre/), { target: { value: 'Un album' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(addAlbum).toHaveBeenCalled())
    expect(addAlbum.mock.calls[0][1]).toMatchObject({ status: 'owned' })
  })
})
