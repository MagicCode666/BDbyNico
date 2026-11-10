import { describe, expect, it } from 'vitest'

import { activeNavId } from './nav'

describe('activeNavId', () => {
  it.each([
    ['/', '', 'accueil'],
    ['/collection', '', 'collection'],
    ['/collection', '?statut=envies', 'envies'],
    ['/collection', '?statut=autre', 'collection'],
    ['/collection/ajouter', '', 'ajouter'],
    ['/collection/importer', '', 'ajouter'],
    ['/collection/9782203001176', '', 'collection'],
    ['/series/abc', '', 'collection'],
    ['/profil', '', 'profil'],
    ['/admin', '', 'admin'],
    ['/inconnue', '', null],
  ])('%s%s → %s', (pathname, search, expected) => {
    expect(activeNavId(pathname, search)).toBe(expected)
  })
})
