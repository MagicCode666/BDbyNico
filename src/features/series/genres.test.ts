import { describe, expect, it } from 'vitest'

import { genreLabel, GENRES, isGenreId, toGenres } from './genres'

describe('genres', () => {
  it('compte quinze genres, sans doublon', () => {
    expect(GENRES).toHaveLength(15)
    expect(new Set(GENRES.map((genre) => genre.id)).size).toBe(15)
  })

  it("nomme un genre, ou rend son identifiant s'il est inconnu", () => {
    expect(genreLabel('science-fiction')).toBe('Science-fiction')
    expect(genreLabel('inconnu')).toBe('inconnu')
    expect(isGenreId('polar')).toBe(true)
    expect(isGenreId('inconnu')).toBe(false)
  })

  it("ne garde que les genres connus, dans l'ordre de la liste", () => {
    expect(toGenres(['western', 'bidon', 'aventure', 3])).toEqual(['aventure', 'western'])
    expect(toGenres(null)).toEqual([])
    expect(toGenres('aventure')).toEqual([])
  })
})
