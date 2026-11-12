import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import ThemeProvider from '../theme/ThemeProvider'
import LegalNoticePage, { CONTACT_EMAIL } from './LegalNoticePage'
import PrivacyPage from './PrivacyPage'

const renderPage = (page: React.ReactElement) =>
  render(
    <ThemeProvider>
      <MemoryRouter>{page}</MemoryRouter>
    </ThemeProvider>,
  )

describe('pages légales', () => {
  afterEach(cleanup)

  it('les mentions légales donnent le contact et renvoient vers la confidentialité', () => {
    renderPage(<LegalNoticePage />)
    expect(screen.getByRole('heading', { name: 'Mentions légales' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: CONTACT_EMAIL }).length).toBeGreaterThan(0)
    const link = screen.getByRole('link', { name: 'politique de confidentialité' })
    expect(link.getAttribute('href')).toBe('/confidentialite')
  })

  it('la politique de confidentialité décrit les droits et la suppression de compte', () => {
    renderPage(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: 'Politique de confidentialité' })).toBeTruthy()
    expect(screen.getByText(/Supprimer mon compte/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'cnil.fr' })).toBeTruthy()
  })

  it('le pied de page propose les deux pages', () => {
    renderPage(<PrivacyPage />)
    const nav = screen.getByRole('navigation', { name: 'Informations légales' })
    expect(nav.textContent).toContain('Mentions légales')
    expect(nav.textContent).toContain('Confidentialité')
  })
})
