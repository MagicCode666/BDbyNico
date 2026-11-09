import { isbn13To10 } from '../../../lib/isbn'

/**
 * Adresse d'image de couverture d'Amazon, construite à partir de l'ISBN-10.
 * Adresse non documentée par Amazon : elle ne sert que de repli quand les sources officielles
 * n'ont pas de couverture, et peut un jour cesser de fonctionner.
 */
export function amazonCoverUrl(isbn13: string): string | null {
  const isbn10 = isbn13To10(isbn13)
  return isbn10
    ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`
    : null
}

/** Charge l'image pour vérifier qu'elle existe. Amazon renvoie un GIF d'un pixel quand il n'a rien. */
export function imageExists(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => finish(false), timeoutMs)
    function finish(ok: boolean) {
      clearTimeout(timer)
      image.onload = image.onerror = null
      resolve(ok)
    }
    image.onload = () => finish(image.naturalWidth > 1 && image.naturalHeight > 1)
    image.onerror = () => finish(false)
    image.referrerPolicy = 'no-referrer'
    image.src = url
  })
}

export async function findAmazonCover(isbn13: string): Promise<string | undefined> {
  const url = amazonCoverUrl(isbn13)
  return url && (await imageExists(url)) ? url : undefined
}
