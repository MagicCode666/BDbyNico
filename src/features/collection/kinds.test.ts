import { describe, expect, it } from 'vitest'

import {
  coveredVolumes,
  detectKind,
  isOutsideGrid,
  rangeLabel,
  shortKindLabel,
  toAlbumKind,
  volumeListLabel,
} from './kinds'

describe('kinds', () => {
  it('lit un type inconnu comme un album ordinaire', () => {
    expect(toAlbumKind('integral')).toBe('integral')
    expect(toAlbumKind('special')).toBe('special')
    expect(toAlbumKind('coffret')).toBe('album')
    expect(toAlbumKind(null)).toBe('album')
  })

  it('sait si un album est hors de la grille des tomes', () => {
    expect(isOutsideGrid('integral')).toBe(true)
    expect(isOutsideGrid('special')).toBe(true)
    expect(isOutsideGrid('album')).toBe(false)
    expect(isOutsideGrid(undefined)).toBe(false)
  })

  it('décrit la plage de tomes', () => {
    expect(rangeLabel(1, 3)).toBe('Tomes 1 à 3')
    expect(rangeLabel(2, 2)).toBe('Tome 2')
    expect(rangeLabel(null, null)).toBe('Série complète')
  })

  it('liste les tomes repris par une intégrale, toute la série sans plage', () => {
    expect(coveredVolumes(1, 3, 10)).toEqual([1, 2, 3])
    expect(coveredVolumes(null, null, 4)).toEqual([1, 2, 3, 4])
    expect(coveredVolumes(null, null, 0)).toEqual([])
    expect(coveredVolumes(0, 2, 5)).toEqual([0, 1, 2])
  })

  it('donne un libellé court de vignette', () => {
    expect(shortKindLabel('integral', 1, 3)).toBe('Intégr. T1-3')
    expect(shortKindLabel('integral', 2, 2)).toBe('Intégr. T2')
    expect(shortKindLabel('integral', null, null)).toBe('Intégr.')
    expect(shortKindLabel('special', null, null)).toBe('HS')
  })

  it("devine une intégrale d'après le titre ou la note « Réunit »", () => {
    expect(detectKind('Légendes des Contrées Oubliées - Intégrale')).toBe('integral')
    expect(detectKind('Coffret Blake et Mortimer')).toBe('integral')
    expect(detectKind('La trilogie du mal', 'Réunit : "Le bourreau de Portland"')).toBe('integral')
    expect(detectKind('La trilogie du mal', 'Rel. | Réunit : "A" ; "B"')).toBe('integral')
    expect(detectKind('Le bourreau de Portland', 'Édition courante')).toBe('album')
    expect(detectKind('Titre', 'Ne réunit rien')).toBe('album')
    expect(detectKind('Alix - La Griffe Noire')).toBe('album')
  })
})

describe('volumeListLabel', () => {
  it('résume les numéros consécutifs et liste les autres', () => {
    expect(volumeListLabel([])).toBe('')
    expect(volumeListLabel([2])).toBe('2')
    expect(volumeListLabel([1, 2, 3])).toBe('1 à 3')
    expect(volumeListLabel([1, 3, 4])).toBe('1, 3, 4')
  })
})
