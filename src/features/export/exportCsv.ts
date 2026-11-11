import type { Entry } from '../collection/types'

/**
 * Colonnes de l'export. Les premières reprennent celles de Bubble, les dernières sont propres à
 * BDbyNico : notre importeur les relit, ce qui permet de restaurer une collection sans perte.
 */
export const EXPORT_COLUMNS = [
  'Titre de la série',
  "Titre de l'album",
  'EAN',
  'Tome',
  'Type',
  'Intégrale : tome de',
  'Intégrale : tome à',
  'Date de publication',
  'Editeur',
  'Auteurs',
  'Prix',
  "Date d'ajout",
  'Dans ma collection',
  'Dédicacé',
  'Edition originale',
  'Type de dédicace',
  'Dédicace par',
  "Date d'achat",
  'État',
  'Notes',
] as const

/** Valeurs du champ « Type », celles de Bubble (relues telles quelles à l'import). */
const TYPE_LABELS = {
  album: 'album simple',
  integral: 'intégrale complète',
  special: 'hors série',
} as const

const CHECK = '✓'
const DELIMITER = ';'

/**
 * Entoure une valeur de guillemets (en doublant ceux qu'elle contient). Un texte qui commence par
 * =, +, @ ou une tabulation serait pris pour une formule par un tableur : on le préfixe d'une
 * apostrophe (que notre importeur retire).
 */
export function escapeCell(value: string): string {
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

function toRow(entry: Entry): string[] {
  const { edition } = entry
  return [
    edition.series?.name ?? '',
    edition.title,
    edition.isbn,
    edition.volume?.toString() ?? '',
    TYPE_LABELS[edition.kind ?? 'album'],
    edition.kind === 'integral' ? (edition.volumeFrom?.toString() ?? '') : '',
    edition.kind === 'integral' ? (edition.volumeTo?.toString() ?? '') : '',
    edition.publishedOn ?? '',
    edition.publisher ?? '',
    edition.authors.join(','),
    entry.price !== null ? entry.price.toFixed(2) : '',
    entry.addedAt ?? '',
    entry.status === 'owned' ? CHECK : '',
    entry.dedication ? CHECK : '',
    entry.firstEdition ? CHECK : '',
    entry.dedication === 'drawing' ? 'dessin' : entry.dedication === 'signature' ? 'signature' : '',
    entry.dedicationBy ?? '',
    entry.acquiredOn ?? '',
    entry.condition ?? '',
    entry.notes ?? '',
  ]
}

/** Construit le fichier CSV (séparateur « ; », UTF-8 avec BOM pour Excel) d'une collection. */
export function entriesToCsv(entries: Entry[]): string {
  // Par série (les albums sans série à la fin), puis par tome, puis par titre
  const sorted = [...entries].sort((a, b) => {
    const seriesA = a.edition.series?.name
    const seriesB = b.edition.series?.name
    if (seriesA !== seriesB) {
      if (!seriesA) return 1
      if (!seriesB) return -1
      return seriesA.localeCompare(seriesB, 'fr')
    }
    const volumeA = a.edition.volume ?? Number.MAX_SAFE_INTEGER
    const volumeB = b.edition.volume ?? Number.MAX_SAFE_INTEGER
    return volumeA - volumeB || a.edition.title.localeCompare(b.edition.title, 'fr')
  })
  const lines = [
    EXPORT_COLUMNS.map(escapeCell).join(DELIMITER),
    ...sorted.map((entry) => toRow(entry).map(escapeCell).join(DELIMITER)),
  ]
  return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n'
}

/** Nom du fichier exporté, ex. « bdbynico-collection-2026-11-09.csv ». */
export function exportFileName(date = new Date()): string {
  return `bdbynico-collection-${date.toISOString().slice(0, 10)}.csv`
}
