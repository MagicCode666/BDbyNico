import { describe, expect, it } from 'vitest'

import type { CatalogueEdition } from './buildView'
import { heroEdition, seriesAuthors } from './hero'

const edition = (extra: Partial<CatalogueEdition>): CatalogueEdition => ({
  isbn: 'i',
  title: 't',
  volume: null,
  coverUrl: null,
  authors: [],
  ...extra,
})

describe('seriesAuthors', () => {
  it('classe les auteurs par présence puis par nom, trois au plus', () => {
    const editions = [
      { authors: ['Desberg', 'Labiano'] },
      { authors: ['Desberg', 'Labiano', 'Chagnaud'] },
      { authors: ['Desberg'] },
      { authors: ['Autre'] },
    ]
    expect(seriesAuthors(editions)).toEqual(['Desberg', 'Labiano', 'Autre'])
    expect(seriesAuthors(editions, 1)).toEqual(['Desberg'])
  })

  it("compte un auteur une seule fois par album et gère l'absence d'auteur", () => {
    expect(seriesAuthors([{ authors: ['A', 'A'] }, { authors: [] }])).toEqual(['A'])
    expect(seriesAuthors([])).toEqual([])
  })
})

describe('heroEdition', () => {
  it('prend le premier tome qui a une couverture', () => {
    const picked = heroEdition([
      edition({ isbn: 'a', volume: 3, coverUrl: 'c3' }),
      edition({ isbn: 'b', volume: 1, coverUrl: null }),
      edition({ isbn: 'c', volume: 2, coverUrl: 'c2' }),
    ])
    expect(picked?.isbn).toBe('c')
  })

  it('préfère un tome numéroté à une intégrale ou à un album sans numéro', () => {
    const picked = heroEdition([
      edition({ isbn: 'integrale', kind: 'integral', volume: 1, coverUrl: 'i' }),
      edition({ isbn: 'sans-numero', volume: null, coverUrl: 's' }),
      edition({ isbn: 'tome', volume: 5, coverUrl: 't' }),
    ])
    expect(picked?.isbn).toBe('tome')
  })

  it("renvoie undefined quand aucune couverture n'est connue", () => {
    expect(heroEdition([edition({ volume: 1 })])).toBeUndefined()
  })
})
