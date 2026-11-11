import type { PublicationStatus } from '../series/status'
import type { AlbumKind } from './kinds'

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
  publicationStatus?: PublicationStatus | null
  /** Le catalogue connaît un tome 0 (prologue) : il compte dans la série pour tout le monde. */
  startsAtZero?: boolean
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
  /** Couverture choisie à la main : la recherche automatique n'y touche plus. */
  coverLocked?: boolean
  /** Album ordinaire, intégrale ou hors-série (absent : album). */
  kind?: AlbumKind
  /** Intégrale : tomes repris (absents : toute la série). */
  volumeFrom?: number | null
  volumeTo?: number | null
  /** En attente de validation par un modérateur (visible de son auteur seulement). */
  pending?: boolean
  /** Fiche descriptive (BnF) : tous les champs sont facultatifs. */
  summary?: string | null
  pages?: number | null
  formatCm?: number | null
  publicPrice?: number | null
  language?: string | null
  /** La BnF a déjà été interrogée pour ces champs (même sans résultat). */
  detailsChecked?: boolean
}

/** Un album de la collection de l'utilisateur : la ligne `collection_items` + son édition. */
export interface Entry {
  id: string
  status: Status
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
