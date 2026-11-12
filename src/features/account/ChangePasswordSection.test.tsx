import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ChangePasswordSection from './ChangePasswordSection'

const signIn = vi.fn()
const updatePassword = vi.fn()
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@test.fr' }, signIn, updatePassword }),
}))

const fill = (current: string, next: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText(/^Nouveau mot de passe/), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
    target: { value: confirm },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
}

describe('ChangePasswordSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signIn.mockResolvedValue({ error: null })
    updatePassword.mockResolvedValue({ error: null })
  })
  afterEach(cleanup)

  it('vérifie l’ancien mot de passe puis enregistre le nouveau', async () => {
    render(<ChangePasswordSection />)
    fill('ancien-mdp', 'nouveau-mdp-1', 'nouveau-mdp-1')
    await waitFor(() => expect(screen.getByText('Mot de passe modifié.')).toBeTruthy())
    expect(signIn).toHaveBeenCalledWith('a@test.fr', 'ancien-mdp')
    expect(updatePassword).toHaveBeenCalledWith('nouveau-mdp-1')
  })

  it('refuse un ancien mot de passe incorrect sans rien changer', async () => {
    signIn.mockResolvedValue({ error: 'Identifiants invalides' })
    render(<ChangePasswordSection />)
    fill('faux', 'nouveau-mdp-1', 'nouveau-mdp-1')
    await waitFor(() =>
      expect(screen.getByText('Le mot de passe actuel est incorrect.')).toBeTruthy(),
    )
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('refuse une confirmation différente, un mot de passe trop court ou inchangé', async () => {
    render(<ChangePasswordSection />)
    fill('ancien-mdp', 'nouveau-mdp-1', 'autre-chose-12')
    expect(await screen.findByText(/sont différents/)).toBeTruthy()
    fill('ancien-mdp', 'court', 'court')
    expect(await screen.findByText(/au moins 8 caractères/)).toBeTruthy()
    fill('ancien-mdp', 'ancien-mdp', 'ancien-mdp')
    expect(await screen.findByText(/doit différer/)).toBeTruthy()
    expect(signIn).not.toHaveBeenCalled()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('affiche l’erreur du serveur si l’enregistrement échoue', async () => {
    updatePassword.mockResolvedValue({ error: 'Mot de passe trop faible' })
    render(<ChangePasswordSection />)
    fill('ancien-mdp', 'nouveau-mdp-1', 'nouveau-mdp-1')
    expect(await screen.findByText('Mot de passe trop faible')).toBeTruthy()
  })
})
