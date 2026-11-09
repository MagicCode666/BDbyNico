import { describe, expect, it } from 'vitest'

import { translateAuthError } from './errors'

describe('translateAuthError', () => {
  it('traduit les codes connus', () => {
    expect(translateAuthError({ code: 'invalid_credentials' })).toBe(
      'Email ou mot de passe incorrect.',
    )
    expect(translateAuthError({ code: 'email_not_confirmed' })).toContain('non confirmée')
  })
  it('renvoie un message générique pour un code inconnu ou absent', () => {
    const generic = translateAuthError(undefined)
    expect(translateAuthError({ code: 'inconnu' })).toBe(generic)
    expect(translateAuthError({})).toBe(generic)
    expect(generic).toContain('erreur')
  })
})
