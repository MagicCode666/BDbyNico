import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeProvider from '../../theme/ThemeProvider'
import Sidebar from './Sidebar'
import { SIDEBAR_KEY } from './useSidebarCollapsed'

vi.mock('./useAccountSummary', () => ({
  useAccountSummary: () => ({ pseudo: 'Nico', role: 'user' }),
  ROLE_LABELS: { user: 'Collectionneur', moderator: 'Modérateur', admin: 'Administrateur' },
}))

function renderSidebar() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('affiche les libellés par défaut', () => {
    renderSidebar()
    expect(screen.getByText('Ma collection')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Réduire le menu' }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('se réduit aux icônes, garde des noms accessibles et retient le choix', () => {
    const { unmount } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    expect(screen.queryByText('Ma collection')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ma collection' }).getAttribute('title')).toBe(
      'Ma collection',
    )
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1')
    unmount()

    renderSidebar()
    expect(screen.queryByText('Ma collection')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }))
    expect(screen.getByText('Ma collection')).toBeTruthy()
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0')
  })
})
