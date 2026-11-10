import { describe, expect, it } from 'vitest'

import { governanceErrorMessage } from './api'

describe('governanceErrorMessage', () => {
  it('garde le message du serveur quand il est connu et lisible', () => {
    const error = new Error('La couverture a changé depuis : annulation impossible')
    expect(governanceErrorMessage(error, 'Échec')).toBe(error.message)
  })

  it('accepte les erreurs de Supabase (objets simples)', () => {
    expect(
      governanceErrorMessage({ message: 'Limite quotidienne de signalements atteinte' }, 'Échec'),
    ).toBe('Limite quotidienne de signalements atteinte')
  })

  it('remplace un message technique par le texte de repli', () => {
    expect(governanceErrorMessage(new Error('permission denied for table x'), 'Échec')).toBe(
      'Échec',
    )
    expect(governanceErrorMessage(undefined, 'Échec')).toBe('Échec')
  })
})
