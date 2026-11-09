import { beforeEach, describe, expect, it } from 'vitest'

import { markTried, wasRecentlyTried } from './covers'

describe('cache des recherches de couvertures', () => {
  beforeEach(() => localStorage.clear())

  it('ne considère pas un ISBN jamais cherché comme déjà essayé', () => {
    expect(wasRecentlyTried('9782203001176')).toBe(false)
  })

  it('mémorise une recherche pendant 14 jours', () => {
    const now = Date.UTC(2026, 10, 9)
    markTried('9782203001176', now)
    expect(wasRecentlyTried('9782203001176', now + 13 * 24 * 3600 * 1000)).toBe(true)
    expect(wasRecentlyTried('9782203001176', now + 15 * 24 * 3600 * 1000)).toBe(false)
  })

  it('mémorise chaque ISBN séparément', () => {
    markTried('9782203001176')
    expect(wasRecentlyTried('9782800116303')).toBe(false)
  })
})
