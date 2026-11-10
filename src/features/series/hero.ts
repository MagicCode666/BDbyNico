import type { CatalogueEdition } from './buildView'

/** Les auteurs les plus présents dans les albums d'une série (3 au plus par défaut). */
export function seriesAuthors(editions: { authors: string[] }[], max = 3): string[] {
  const tally = new Map<string, number>()
  for (const edition of editions) {
    for (const author of new Set(edition.authors)) {
      tally.set(author, (tally.get(author) ?? 0) + 1)
    }
  }
  return [...tally]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .slice(0, max)
    .map(([author]) => author)
}

/**
 * Album qui illustre la série : le premier tome qui a une couverture, sinon le premier album
 * qui en a une (les intégrales et hors-séries ne passent qu'en dernier recours).
 */
export function heroEdition(editions: CatalogueEdition[]): CatalogueEdition | undefined {
  const withCover = editions.filter((edition) => edition.coverUrl)
  const rank = (edition: CatalogueEdition) =>
    (edition.kind ?? 'album') !== 'album' ? 2 : edition.volume === null ? 1 : 0
  return [...withCover].sort(
    (a, b) => rank(a) - rank(b) || (a.volume ?? Infinity) - (b.volume ?? Infinity),
  )[0]
}
