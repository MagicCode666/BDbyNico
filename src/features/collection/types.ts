export type Status = 'owned' | 'wanted'

export const STATUS_LABELS: Record<Status, string> = {
  owned: 'Possédé',
  wanted: 'Envie',
}

/** Dédicace d'un exemplaire : simple autographe, ou vrai dessin personnalisé. */
export type Dedication = 'signature' | 'drawing'

export const DEDICATION_LABELS: Record<Dedication, string> = {
  signature: 'Signature',
  drawing: 'Dessin',
}

export interface SeriesInfo {
  id: string
  name: string
  totalVolumes: number | null
}

export interface Edition {
  isbn: string
  title: string
  volume: number | null
  authors: string[]
  publisher: string | null
  publishedOn: string | null
  coverUrl: string | null
  series: SeriesInfo | null
}

/** Un album de la collection de l'utilisateur : la ligne `collection_items` + son édition. */
export interface Entry {
  id: string
  status: Status
  read: boolean
  price: number | null
  condition: string | null
  notes: string | null
  acquiredOn: string | null
  /** Date d'ajout à la collection (ISO). */
  addedAt: string | null
  dedication: Dedication | null
  /** Auteur ou artiste de la dédicace. */
  dedicationBy: string | null
  firstEdition: boolean
  edition: Edition
}

export type ReadFilter = 'all' | 'read' | 'unread'
