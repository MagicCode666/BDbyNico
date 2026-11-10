import { describe, expect, it } from 'vitest'

import type { Change } from './api'
import { describeChange } from './describe'

const change = (
  kind: Change['kind'],
  oldValue: string | null,
  newValue: string | null,
): Change => ({
  id: 1,
  createdAt: '2026-11-10T10:00:00Z',
  userId: 'u',
  pseudo: 'Nico',
  origin: 'admin',
  kind,
  isbn: null,
  seriesId: 's',
  title: null,
  seriesName: 'Les parfums du pouvoir',
  volume: null,
  oldValue,
  newValue,
  status: 'applied',
  reviewedPseudo: null,
  reviewedAt: null,
  revertsId: null,
  currentCover: null,
})

describe('describeChange', () => {
  it('décrit un renommage', () => {
    expect(
      describeChange(change('series_name', 'La Maison Des Fragances', 'Les parfums du pouvoir')),
    ).toBe('Nom : « La Maison Des Fragances » → « Les parfums du pouvoir »')
  })

  it('décrit un total fixé à la main puis rendu au job', () => {
    expect(describeChange(change('series_total', 'auto:4', 'manual:5'))).toBe(
      'Total : 4 (automatique) → 5 (fixé à la main)',
    )
    expect(describeChange(change('series_total', 'manual:5', 'auto:5'))).toBe(
      'Total : 5 (fixé à la main) → 5 (automatique)',
    )
  })

  it('décrit un statut, y compris inconnu', () => {
    expect(describeChange(change('series_status', 'auto:', 'manual:finished'))).toBe(
      'Statut : inconnu (automatique) → terminée (fixé à la main)',
    )
  })

  it("décrit un changement de type d'album, avec la plage de tomes", () => {
    expect(describeChange(change('edition_kind', 'album:', 'integral:1-3'))).toBe(
      'Type : album ordinaire → intégrale (tomes 1 à 3)',
    )
    expect(describeChange(change('edition_kind', 'integral:1-3', 'integral:'))).toBe(
      'Type : intégrale (tomes 1 à 3) → intégrale (série complète)',
    )
    expect(describeChange(change('edition_kind', 'integral:2-2', 'special:'))).toBe(
      'Type : intégrale (tome 2) → hors-série',
    )
  })

  it('ne décrit rien pour un changement de couverture', () => {
    expect(describeChange(change('cover', 'a', 'b'))).toBeNull()
  })
})
