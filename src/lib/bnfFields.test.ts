import { describe, expect, it } from 'vitest'

import {
  languageName,
  parseFormatCm,
  parseLanguage,
  parsePages,
  parsePublicPrice,
  parseSummary,
} from './bnfFields'

describe('parsePages', () => {
  it.each([
    ['1 vol. (48 p.)', 48],
    ['1 vol. (56 p.)', 56],
    ['1 vol. (non paginé [48] p.)', 48],
    ['1 vol. (XII-300 p.)', 300],
    ['1 vol. (non paginé)', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, expected) => {
    expect(parsePages(input)).toBe(expected)
  })
})

describe('parseFormatCm', () => {
  it.each([
    ['32 cm', 32],
    ['31 cm', 31],
    ['18 cm', 18],
    ['', undefined],
    [undefined, undefined],
    ['grand format', undefined],
  ])('%s → %s', (input, expected) => {
    expect(parseFormatCm(input)).toBe(expected)
  })
})

describe('parsePublicPrice', () => {
  it.each([
    ['13,50 EUR', 13.5],
    ['14,99 EUR', 14.99],
    ['9 EUR', 9],
    ['17.5 €', 17.5],
    ['52 F', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('%s → %s', (input, expected) => {
    expect(parsePublicPrice(input)).toBe(expected)
  })
})

describe('parseLanguage et languageName', () => {
  it('accepte un code à trois lettres, en minuscules', () => {
    expect(parseLanguage('fre')).toBe('fre')
    expect(parseLanguage(' FRE ')).toBe('fre')
    expect(parseLanguage('fr')).toBeUndefined()
    expect(parseLanguage('français')).toBeUndefined()
    expect(parseLanguage(undefined)).toBeUndefined()
  })

  it('nomme les langues courantes, sinon le code en majuscules', () => {
    expect(languageName('fre')).toBe('Français')
    expect(languageName('jpn')).toBe('Japonais')
    expect(languageName('xyz')).toBe('XYZ')
    expect(languageName(null)).toBeUndefined()
  })
})

describe('parseSummary', () => {
  it('normalise les espaces et coupe à 4 000 caractères', () => {
    expect(parseSummary('  Un   résumé\n sur plusieurs   lignes ')).toBe(
      'Un résumé sur plusieurs lignes',
    )
    expect(parseSummary('x'.repeat(5000))?.length).toBe(4000)
    expect(parseSummary('   ')).toBeUndefined()
    expect(parseSummary(undefined)).toBeUndefined()
  })
})
