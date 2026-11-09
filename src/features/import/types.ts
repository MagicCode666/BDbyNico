import type { Dedication, Status } from '../collection/types'

/** Un album à importer, nettoyé et prêt à être envoyé. */
export interface ImportRow {
  /** ISBN-13 (EAN du fichier). */
  isbn: string
  title: string
  /** Le titre est absent du fichier : à compléter (BnF) ou à remplacer par un repli. */
  titleMissing: boolean
  /** Null pour un album seul (sans série) ou quand le fichier n'en donne pas. */
  seriesName: string | null
  volume: number | null
  authors: string[]
  publisher: string | null
  /** AAAA-MM-JJ */
  publishedOn: string | null
  status: Status
  read: boolean
  price: number | null
  /** Date d'ajout dans l'application d'origine (ISO), conservée comme date d'ajout. */
  addedAt: string | null
  /** Bubble ne distingue pas autographe et dessin : « signature » par défaut. */
  dedication: Dedication | null
  firstEdition: boolean
  // Colonnes facultatives, présentes dans nos propres exports (réimport sans perte)
  dedicationBy: string | null
  acquiredOn: string | null
  condition: string | null
  notes: string | null
}

/** Un point d'attention rencontré dans le fichier (ligne du fichier, en comptant l'en-tête). */
export interface ImportIssue {
  line: number
  message: string
}

export interface ImportStats {
  total: number
  owned: number
  wanted: number
  read: number
  series: number
  titlesToComplete: number
  dedicated: number
  firstEditions: number
}

export interface ImportPlan {
  rows: ImportRow[]
  /** Lignes importées mais corrigées (tome ignoré, titre à compléter…). */
  warnings: ImportIssue[]
  /** Lignes non importées (ISBN invalide, doublon dans le fichier…). */
  skipped: ImportIssue[]
  stats: ImportStats
}
