import { describe, expect, it } from 'vitest'

import { normalizePseudo, validateEmail, validatePassword, validatePseudo } from './validation'

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
  it('refuse moins de 3 ou plus de 30 caractères', () => {
    expect(validatePseudo('ab')).toMatch(/au moins 3/)
    expect(validatePseudo('a'.repeat(31))).toMatch(/30/)
  })
  it('refuse les caractères interdits', () => {
    for (const pseudo of ['a<b>c', 'nico@mail', 'a/b/c', 'a\\b', 'a&b', 'a\u0001b']) {
      expect(validatePseudo(pseudo)).not.toBeNull()
    }
  })
  it('accepte un pseudo normal, accents et tirets compris', () => {
    expect(validatePseudo('Nico')).toBeNull()
    expect(validatePseudo('Éloïse-Marie 2')).toBeNull()
    expect(validatePseudo('a'.repeat(30))).toBeNull()
  })
  it('compte les espaces superflus comme la base : retirés avant de mesurer', () => {
    expect(normalizePseudo('  Marie   Claire ')).toBe('Marie Claire')
    expect(validatePseudo(' a  ')).toMatch(/au moins 3/)
  })
})
