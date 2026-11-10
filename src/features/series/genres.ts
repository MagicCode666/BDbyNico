/** Les genres de séries : une liste fermée, identique à la contrainte de la base (migration 20261124). */
export const GENRES = [
  { id: 'aventure', label: 'Aventure' },
  { id: 'science-fiction', label: 'Science-fiction' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'polar', label: 'Polar' },
  { id: 'historique', label: 'Historique' },
  { id: 'humour', label: 'Humour' },
  { id: 'western', label: 'Western' },
  { id: 'horreur', label: 'Horreur' },
  { id: 'jeunesse', label: 'Jeunesse' },
  { id: 'biographie', label: 'Biographie et reportage' },
  { id: 'tranche-de-vie', label: 'Tranche de vie' },
  { id: 'super-heros', label: 'Super-héros' },
  { id: 'guerre', label: 'Guerre' },
  { id: 'musique', label: 'Musique' },
  { id: 'manga', label: 'Manga' },
] as const

export type GenreId = (typeof GENRES)[number]['id']

/** Nombre maximal de genres par série. */
export const MAX_GENRES = 3

const LABELS = new Map<string, string>(GENRES.map((genre) => [genre.id, genre.label]))

export const isGenreId = (value: string): value is GenreId => LABELS.has(value)

export const genreLabel = (id: string): string => LABELS.get(id) ?? id

/** Ne garde que les genres connus, dans l'ordre de la liste fermée. */
export function toGenres(value: unknown): GenreId[] {
  if (!Array.isArray(value)) return []
  const wanted = new Set(value.filter((item): item is string => typeof item === 'string'))
  return GENRES.filter((genre) => wanted.has(genre.id)).map((genre) => genre.id)
}
