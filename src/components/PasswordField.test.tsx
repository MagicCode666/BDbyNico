import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import PasswordField from './PasswordField'

describe('PasswordField', () => {
  afterEach(cleanup)

  it('masque le mot de passe par défaut et le montre sur demande', () => {
    render(<PasswordField label="Mot de passe" name="password" defaultValue="secret123" />)
    const input = screen.getByLabelText('Mot de passe') as HTMLInputElement
    expect(input.type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(input.type).toBe('text')
    expect(input.value).toBe('secret123')

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }))
    expect(input.type).toBe('password')
  })

  it('ne soumet pas le formulaire en cliquant sur l’œil', () => {
    let submitted = false
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submitted = true
        }}
      >
        <PasswordField label="Mot de passe" name="password" />
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(submitted).toBe(false)
  })
})
