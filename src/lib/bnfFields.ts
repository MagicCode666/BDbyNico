/**
 * Lecture des champs descriptifs d'une notice de la BnF (format UNIMARC). Fonctions pures,
 * partagées par l'application (recherche à la saisie) et le job nocturne (scripts/).
 */

/** « 1 vol. (48 p.) » → 48 ; « 1 vol. (non paginé [48] p.) » → 48 ; sans pagination → undefined. */
export function parsePages(text: string | undefined): number | undefined {
  if (!text) return undefined
  const match = text.match(/(\d{1,4})\s*\]?\s*p\./)
  if (!match) return undefined
  const pages = Number(match[1])
  return pages >= 1 && pages <= 9999 ? pages : undefined
}

/** « 31 cm » → 31 (hauteur du livre, en centimètres). */
export function parseFormatCm(text: string | undefined): number | undefined {
  const match = text?.match(/(\d{1,2})\s*cm/)
  if (!match) return undefined
  const cm = Number(match[1])
  return cm >= 1 && cm <= 99 ? cm : undefined
}

/** « 13,50 EUR » → 13.5. Les prix anciens en francs ne sont pas repris. */
export function parsePublicPrice(text: string | undefined): number | undefined {
  const match = text?.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:EUR|€)/i)
  if (!match) return undefined
  const price = Number(match[1].replace(',', '.'))
  return Number.isFinite(price) && price >= 0 && price < 10000 ? price : undefined
}

/** Code de langue UNIMARC (ISO 639-2, 3 lettres minuscules) : « fre » → « fre ». */
export function parseLanguage(text: string | undefined): string | undefined {
  const code = text?.trim().toLowerCase()
  return code && /^[a-z]{3}$/.test(code) ? code : undefined
}

/** Résumé de la notice : espaces normalisés, 4 000 caractères au plus (limite de la base). */
export function parseSummary(text: string | undefined): string | undefined {
  const summary = text?.replace(/\s+/g, ' ').trim()
  return summary ? summary.slice(0, 4000) : undefined
}

const LANGUAGE_NAMES: Record<string, string> = {
  fre: 'Français',
  eng: 'Anglais',
  spa: 'Espagnol',
  ger: 'Allemand',
  ita: 'Italien',
  jpn: 'Japonais',
  dut: 'Néerlandais',
  por: 'Portugais',
  cat: 'Catalan',
  chi: 'Chinois',
  kor: 'Coréen',
  lat: 'Latin',
}

/** Nom lisible d'une langue (le code lui-même, en majuscules, si elle est peu courante). */
export function languageName(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  return LANGUAGE_NAMES[code] ?? code.toUpperCase()
}

/** Champs descriptifs d'un album, tels que la BnF les donne (tous facultatifs). */
export interface AlbumDetails {
  summary?: string
  pages?: number
  formatCm?: number
  publicPrice?: number
  language?: string
}
