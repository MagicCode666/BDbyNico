import { imageExists } from './amazon'

/**
 * Couvertures de deux libraires en ligne, indexées par ISBN-13 : elles complètent Amazon (dont
 * l'adresse suppose un ISBN-10, absent des ISBN en 979) et la BnF pour les albums récents.
 * Adresses non documentées : elles ne servent que de repli et peuvent un jour cesser de
 * fonctionner. Elles répondent par une erreur quand elles n'ont pas l'image.
 */
export const decitreCoverUrl = (isbn13: string): string =>
  `https://products-images.di-static.com/image/x/${isbn13}-475x500-1.jpg`

export const abebooksCoverUrl = (isbn13: string): string =>
  `https://pictures.abebooks.com/isbn/${isbn13}-fr-300.jpg`

/** Première couverture trouvée chez les libraires (Decitre, puis AbeBooks). */
export async function findRetailerCover(isbn13: string): Promise<string | undefined> {
  for (const url of [decitreCoverUrl(isbn13), abebooksCoverUrl(isbn13)]) {
    if (await imageExists(url)) return url
  }
  return undefined
}
