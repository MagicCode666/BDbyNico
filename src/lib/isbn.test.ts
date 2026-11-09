import { describe, expect, it } from 'vitest'

import { formatIsbn, isValidIsbn13, normalizeIsbn } from './isbn'

describe('isValidIsbn13', () => {
  it('accepte un ISBN-13 valide', () => {
    expect(isValidIsbn13('9782070612758')).toBe(true)
  })
  it('refuse une clé de contrôle fausse ou un format incorrect', () => {
    expect(isValidIsbn13('9782070612759')).toBe(false)
    expect(isValidIsbn13('978207061275')).toBe(false)
    expect(isValidIsbn13('abcdefghijklm')).toBe(false)
  })
})

describe('normalizeIsbn', () => {
  it('retire tirets et espaces', () => {
    expect(normalizeIsbn('978-2-07-061275-8')).toBe('9782070612758')
    expect(normalizeIsbn(' 978 2070612758 ')).toBe('9782070612758')
  })
  it('convertit un ISBN-10 en ISBN-13', () => {
    expect(normalizeIsbn('2-07-061275-X')).toBe(null)
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157')
  })
  it('accepte un ISBN-10 se terminant par X', () => {
    expect(normalizeIsbn('080442957X')).toBe('9780804429573')
  })
  it('refuse une saisie invalide', () => {
    expect(normalizeIsbn('')).toBeNull()
    expect(normalizeIsbn('123')).toBeNull()
    expect(normalizeIsbn('9782070612759')).toBeNull()
  })
})

describe('formatIsbn', () => {
  it('sépare le préfixe', () => {
    expect(formatIsbn('9782070612758')).toBe('978 2070612758')
  })
})
