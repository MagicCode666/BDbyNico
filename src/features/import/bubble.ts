import Papa from 'papaparse'

import { normalizeIsbn } from '../../lib/isbn'
import { normalizeText } from '../collection/utils'
import type { AlbumKind } from '../collection/kinds'
import type { Dedication } from '../collection/types'
import type { ImportIssue, ImportPlan, ImportRow } from './types'

/** Le fichier n'est pas un export Bubble lisible. */
export class ImportFormatError extends Error {}

const REQUIRED_COLUMNS = ['Titre de la série', "Titre de l'album", 'EAN', 'Tome']

type Record_ = Record<string, string>

function parseText(text: string, delimiter: string) {
  // Certains exports commencent par un BOM (U+FEFF) qu'il faut retirer
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return Papa.parse<Record_>(clean, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })
}

const hasColumns = (fields: string[] | undefined) =>
  !!fields && REQUIRED_COLUMNS.every((column) => fields.includes(column))

/**
 * Valeur d'une case, sans espaces autour. Nos exports préfixent d'une apostrophe les textes qui
 * commencent par =, +, @ (protection contre les formules des tableurs) : on la retire ici.
 */
const cell = (record: Record_, column: string) => {
  const value = (record[column] ?? '').trim()
  return /^'[=+@\t\r]/.test(value) ? value.slice(1) : value
}
/** Les cases à cocher de Bubble contiennent « ✓ » quand elles sont cochées. */
const flag = (record: Record_, column: string) => cell(record, column) !== ''

/**
 * Lit un numéro de tome. Renvoie `null` (avec une explication) pour les valeurs inexploitables :
 * non numérique, 0, année prise pour un tome, nombre aberrant.
 */
export function parseVolume(text: string): { volume: number | null; warning?: string } {
  const value = text.trim()
  if (value === '') return { volume: null }
  if (!/^\d+$/.test(value))
    return { volume: null, warning: `Tome « ${value} » ignoré (non numérique)` }
  const number = Number(value)
  if (number >= 1900 && number <= 2100) {
    return { volume: null, warning: `Tome « ${value} » ignoré (c'est probablement une année)` }
  }
  if (number > 999) return { volume: null, warning: `Tome « ${value} » ignoré (trop grand)` }
  return { volume: number }
}

function parseDate(text: string): string | null {
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const date = new Date(`${match[1]}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]
    ? null
    : match[1]
}

function parseTimestamp(text: string): string | null {
  const time = Date.parse(text)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function parsePrice(text: string): number | null {
  if (text === '') return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value < 100000 ? value : null
}

function parseAuthors(text: string): string[] {
  const names = text
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

/**
 * Type d'un album : le champ « Type » de Bubble (« intégrale complète », « hors série »,
 * « album simple »), sinon un titre ou un nom de série qui dit clairement « intégrale » ou
 * « coffret ». Nos propres exports ajoutent la plage de tomes reprise par une intégrale.
 */
export function parseKind(
  typeText: string,
  albumTitle: string,
  seriesTitle: string,
  fromText = '',
  toText = '',
): { kind: AlbumKind; volumeFrom: number | null; volumeTo: number | null } {
  const type = normalizeText(typeText.trim())
  let kind: AlbumKind = 'album'
  if (/int.?grale|coffret/.test(type)) kind = 'integral'
  else if (/hors/.test(type)) kind = 'special'
  else if (type === '' && /int[ée]grale|coffret/i.test(`${albumTitle} ${seriesTitle}`)) {
    kind = 'integral'
  }
  const from = /^\d{1,3}$/.test(fromText.trim()) ? Number(fromText) : null
  const to = /^\d{1,3}$/.test(toText.trim()) ? Number(toText) : null
  const hasRange = kind === 'integral' && from !== null && to !== null && from <= to
  return { kind, volumeFrom: hasRange ? from : null, volumeTo: hasRange ? to : null }
}

/** Lit un export CSV de Bubble et en tire la liste des albums à importer. */
export function parseBubbleCsv(text: string): ImportPlan {
  let parsed = parseText(text, ';')
  if (!hasColumns(parsed.meta.fields)) parsed = parseText(text, ',')
  if (!hasColumns(parsed.meta.fields)) {
    throw new ImportFormatError(
      `Ce fichier ne ressemble pas à un export Bubble (colonnes attendues : ${REQUIRED_COLUMNS.join(', ')}).`,
    )
  }

  const rows: ImportRow[] = []
  const warnings: ImportIssue[] = []
  const skipped: ImportIssue[] = []
  const seen = new Set<string>()

  parsed.data.forEach((record, index) => {
    const line = index + 2 // la ligne 1 est l'en-tête

    const isbn = normalizeIsbn(cell(record, 'EAN'))
    if (!isbn) {
      skipped.push({ line, message: `EAN « ${cell(record, 'EAN')} » invalide` })
      return
    }
    if (seen.has(isbn)) {
      skipped.push({ line, message: `EAN ${isbn} déjà présent plus haut dans le fichier` })
      return
    }
    seen.add(isbn)

    const albumTitle = cell(record, "Titre de l'album")
    const seriesTitle = cell(record, 'Titre de la série')
    const { volume, warning } = parseVolume(cell(record, 'Tome'))
    if (warning) warnings.push({ line, message: warning })

    // Un album seul porte le même titre que sa « série » et n'a pas de tome : pas de série
    const standalone =
      volume === null &&
      seriesTitle !== '' &&
      normalizeText(seriesTitle) === normalizeText(albumTitle)
    const seriesName = seriesTitle === '' || standalone ? null : seriesTitle

    const titleMissing = albumTitle === ''
    const title =
      albumTitle ||
      [seriesTitle, volume !== null ? `Tome ${volume}` : ''].filter(Boolean).join(' - ') ||
      isbn
    if (titleMissing) warnings.push({ line, message: 'Titre absent : à compléter' })

    const { kind, volumeFrom, volumeTo } = parseKind(
      cell(record, 'Type'),
      albumTitle,
      seriesTitle,
      cell(record, 'Intégrale : tome de'),
      cell(record, 'Intégrale : tome à'),
    )

    // Type précis dans nos exports ; Bubble ne donne qu'une case « Dédicacé » : « signature »
    const dedicationType = cell(record, 'Type de dédicace').toLowerCase()
    const dedication: Dedication | null =
      dedicationType === 'dessin' || dedicationType === 'drawing'
        ? 'drawing'
        : dedicationType === 'signature' || flag(record, 'Dédicacé')
          ? 'signature'
          : null

    rows.push({
      isbn,
      title,
      titleMissing,
      seriesName,
      volume,
      kind,
      volumeFrom,
      volumeTo,
      authors: parseAuthors(cell(record, 'Auteurs')),
      publisher: cell(record, 'Editeur') || null,
      publishedOn: parseDate(cell(record, 'Date de publication')),
      status: flag(record, 'Dans ma collection') ? 'owned' : 'wanted',
      price: parsePrice(cell(record, 'Prix')),
      addedAt: parseTimestamp(cell(record, "Date d'ajout")),
      dedication,
      firstEdition: flag(record, 'Edition originale'),
      dedicationBy: dedication ? cell(record, 'Dédicace par').slice(0, 100) || null : null,
      acquiredOn: parseDate(cell(record, "Date d'achat")),
      condition: (cell(record, 'État') || cell(record, 'Etat')).slice(0, 50) || null,
      notes: cell(record, 'Notes').slice(0, 2000) || null,
    })
  })

  return {
    rows,
    warnings,
    skipped,
    stats: {
      total: rows.length,
      owned: rows.filter((r) => r.status === 'owned').length,
      wanted: rows.filter((r) => r.status === 'wanted').length,
      series: new Set(rows.filter((r) => r.seriesName).map((r) => normalizeText(r.seriesName!)))
        .size,
      titlesToComplete: rows.filter((r) => r.titleMissing).length,
      dedicated: rows.filter((r) => r.dedication).length,
      firstEditions: rows.filter((r) => r.firstEdition).length,
    },
  }
}
