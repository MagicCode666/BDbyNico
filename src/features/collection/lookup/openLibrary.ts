import { toIsoDate } from './dates'
import type { BookInfo } from './types'

interface OpenLibraryData {
  title?: string
  subtitle?: string
  authors?: { name: string }[]
  publishers?: { name: string }[]
  publish_date?: string
  cover?: { large?: string; medium?: string }
}

interface OpenLibraryEdition {
  series?: string[]
}

/** « Tintin (18) » → { name: « Tintin », volume: 18 } */
export function parseSeries(text: string | undefined): { name: string; volume?: number } | null {
  if (!text) return null
  const match = text.trim().match(/^(.*?)\s*\(\s*(?:t(?:ome)?\.?\s*)?(\d+)\s*\)$/i)
  if (match && match[1]) return { name: match[1], volume: Number(match[2]) }
  return text.trim() ? { name: text.trim() } : null
}

/** Combine la fiche « data » d'Open Library et, si présente, la fiche édition (pour la série). */
export function parseOpenLibrary(
  data: OpenLibraryData | undefined,
  edition?: OpenLibraryEdition,
): BookInfo | null {
  if (!data?.title) return null
  const series = parseSeries(edition?.series?.[0])
  const title = [data.title, data.subtitle].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim()
  return {
    title,
    seriesName: series?.name,
    volume: series?.volume,
    authors: (data.authors ?? []).map((a) => a.name),
    publisher: data.publishers?.[0]?.name,
    publishedOn: toIsoDate(data.publish_date),
    // Open Library sert les couvertures en https (images connues, pas de lien cassé)
    coverUrl: data.cover?.large ?? data.cover?.medium,
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Open Library : HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function lookupOpenLibrary(isbn13: string): Promise<BookInfo | null> {
  const [dataResult, editionResult] = await Promise.allSettled([
    getJson<Record<string, OpenLibraryData>>(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`,
    ),
    getJson<OpenLibraryEdition>(`https://openlibrary.org/isbn/${isbn13}.json`),
  ])
  if (dataResult.status === 'rejected') throw dataResult.reason
  const data = dataResult.value?.[`ISBN:${isbn13}`]
  const edition =
    editionResult.status === 'fulfilled' ? (editionResult.value ?? undefined) : undefined
  return parseOpenLibrary(data, edition)
}
