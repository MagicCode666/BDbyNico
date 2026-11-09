import { describe, expect, it } from 'vitest'

import { validateEmail, validatePassword, validatePseudo } from './validation'

describe('validateEmail', () => {
  it('accepte une adresse valide, espaces autour compris', () => {
    expect(validateEmail('  nico@example.com ')).toBeNull()
  })
  it.each(['', 'nico', 'nico@', 'nico@example', 'ni co@example.com'])('refuse "%s"', (value) => {
    expect(validateEmail(value)).not.toBeNull()
  })
})

describe('validatePassword', () => {
  it('refuse moins de 8 caractères', () => {
    expect(validatePassword('1234567')).not.toBeNull()
  })
  it('accepte 8 caractères', () => {
    expect(validatePassword('12345678')).toBeNull()
  })
})

describe('validatePseudo', () => {
  it('refuse un pseudo vide ou fait d espaces', () => {
    expect(validatePseudo('')).not.toBeNull()
    expect(validatePseudo('   ')).not.toBeNull()
  })
  it('refuse plus de 50 caractères', () => {
    expect(validatePseudo('a'.repeat(51))).not.toBeNull()
  })
  it('accepte un pseudo normal', () => {
    expect(validatePseudo('Nico')).toBeNull()
    expect(validatePseudo('a'.repeat(50))).toBeNull()
  })
})
