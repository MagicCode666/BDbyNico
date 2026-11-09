import { render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthContext, type AuthContextValue } from './AuthContext'
import RequireAuth from './RequireAuth'

const noop = async () => ({ error: null })

function renderAt(overrides: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    session: null,
    user: null,
    loading: false,
    passwordRecovery: false,
    signUp: noop,
    signIn: noop,
    signOut: noop,
    requestPasswordReset: noop,
    updatePassword: noop,
    ...overrides,
  }
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/profil']}>
        <Routes>
          <Route path="/connexion" element={<p>Page de connexion</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/profil" element={<p>Page privée</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RequireAuth', () => {
  it('affiche un chargement tant que la session est inconnue', () => {
    renderAt({ loading: true })
    expect(screen.getByText('Chargement…')).toBeTruthy()
  })

  it('redirige vers la connexion sans utilisateur', () => {
    renderAt({})
    expect(screen.getByText('Page de connexion')).toBeTruthy()
    expect(screen.queryByText('Page privée')).toBeNull()
  })

  it('affiche la page privée pour un utilisateur connecté', () => {
    renderAt({ user: { id: 'u1' } as User })
    expect(screen.getByText('Page privée')).toBeTruthy()
  })
})
