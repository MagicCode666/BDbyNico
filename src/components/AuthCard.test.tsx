import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import ThemeProvider from '../theme/ThemeProvider'
import AuthCard from './AuthCard'
import PasswordStrength from './PasswordStrength'

describe('AuthCard', () => {
  afterEach(cleanup)

  it('affiche le titre, le formulaire, le pied de page et le panneau de marque', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthCard title="Connexion" footer={<span>Pas encore de compte ?</span>}>
            <form aria-label="formulaire" />
          </AuthCard>
        </MemoryRouter>
      </ThemeProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'formulaire' })).toBeTruthy()
    expect(screen.getByText('Pas encore de compte ?')).toBeTruthy()
    expect(screen.getByTestId('auth-brand-panel').textContent).toContain('Suivez vos séries')
  })
})

describe('PasswordStrength', () => {
  afterEach(cleanup)

  it("n'affiche rien tant que rien n'est saisi", () => {
    const { container } = render(<PasswordStrength value="" />)
    expect(container.textContent).toBe('')
  })

  it('compte les caractères jusqu’au minimum puis valide la longueur', () => {
    const { rerender } = render(<PasswordStrength value="abc" />)
    expect(screen.getByText('3 / 8 caractères au minimum.')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
    rerender(<PasswordStrength value="abcdefgh" />)
    expect(screen.getByText('Longueur suffisante.')).toBeTruthy()
  })
})
