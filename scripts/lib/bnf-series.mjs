// Calcul du total de tomes d'une série et de la liste de ses albums à partir du catalogue de la BnF.
// Utilisé par le job quotidien (scripts/update-series-totals.mjs).
import { normalizeIsbn } from '../../src/lib/isbn.ts'

const SRU_URL = 'https://catalogue.bnf.fr/api/SRU'
const PAGE_SIZE = 50
/** Part minimale de tomes référencés pour considérer le total comme fiable. */
const MIN_COVERAGE = 0.5
// Plafond de notices lues par série (24 requêtes) : suffisant pour les plus grosses séries
const MAX_NOTICES = 1200

/** Mentions d'édition ou notes qui signalent un tirage spécial, un recueil ou une promotion. */
const SPECIAL_PATTERN =
  /collector|tirage|noir et blanc|n&b|int[ée]grale|coffret|offert|r[ée]unit|recueil|compilation|sp[ée]cial|fac-simil|luxe|publicitaire/i

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** « Spirou et Fantasio . Hors-série . » → « Spirou et Fantasio. Hors-série » */
export function cleanSeriesName(name) {
  return name.replace(/\s+\./g, '.').replace(/\.+$/, '').trim()
}

/** Clé de comparaison : minuscules, sans accents ni ponctuation superflue. */
export function nameKey(name) {
  return cleanSeriesName(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function datafields(record, tag) {
  const pattern = new RegExp(`<mxc:datafield tag="${tag}"[^>]*>(.*?)</mxc:datafield>`, 'gs')
  return [...record.matchAll(pattern)].map((match) =>
    [...match[1].matchAll(/<mxc:subfield code="(.)">(.*?)<\/mxc:subfield>/gs)].map((sub) => [
      sub[1],
      decodeEntities(sub[2]).trim(),
    ]),
  )
}

const sub = (field, code) => field?.find(([c]) => c === code)?.[1]

function yearToIso(text) {
  const year = text?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]
  return year ? `${year}-01-01` : undefined
}

/** Extrait un numéro de tome simple ; null pour une plage (« 1-3 », « 1 à 3 ») ou l'absence de numéro. */
export function parseVolume(text) {
  if (!text) return null
  if (/\d+\s*(?:-|–|—|à|\/|et|&)\s*\d+/i.test(text)) return null
  const digits = text.match(/\d+/)?.[0]
  const volume = digits ? Number(digits) : null
  return volume !== null && volume >= 1 && volume <= 999 ? volume : null
}

/** Lit une réponse SRU (UNIMARC) et renvoie les notices sous forme simple. */
export function parseNotices(xml) {
  return [...xml.matchAll(/<srw:record>(.*?)<\/srw:record>/gs)].map(([, record]) => {
    const f200 = datafields(record, '200')[0]
    const f210 = datafields(record, '210')[0] ?? datafields(record, '214')[0]
    const f225 = datafields(record, '225')[0]
    const authors = []
    for (const field of ['700', '701', '702'].flatMap((tag) => datafields(record, tag))) {
      const last = sub(field, 'a')
      if (!last) continue
      const name = [sub(field, 'b'), last].filter(Boolean).join(' ')
      if (!authors.includes(name)) authors.push(name)
    }
    const isbn = datafields(record, '010')
      .map((field) => sub(field, 'a'))
      .filter(Boolean)
      .map((value) => normalizeIsbn(value))
      .find(Boolean)
    return {
      isbn,
      title: sub(f200, 'a'),
      authors,
      publisher: sub(f210, 'c'),
      publishedOn: yearToIso(sub(f210, 'd')),
      seriesName: sub(f225, 'a') ? cleanSeriesName(sub(f225, 'a')) : undefined,
      volumeText: sub(f225, 'v'),
      mention: [
        ...datafields(record, '205').map((field) => sub(field, 'a')),
        ...datafields(record, '300').map((field) => sub(field, 'a')),
      ]
        .filter(Boolean)
        .join(' | '),
    }
  })
}

/**
 * Garde les notices de la série (nom exact) qui sont de vrais tomes numérotés,
 * puis renvoie le total (plus grand numéro) et un album par tome.
 */
export function computeSeries(notices, seriesName) {
  const key = nameKey(seriesName)
  const inSeries = notices.filter((n) => n.seriesName && nameKey(n.seriesName) === key)
  const kept = []
  const skipped = { sansNumero: 0, special: 0 }
  for (const notice of inSeries) {
    const volume = parseVolume(notice.volumeText)
    if (volume === null) {
      skipped.sansNumero++
    } else if (SPECIAL_PATTERN.test(notice.mention)) {
      skipped.special++
    } else {
      kept.push({ ...notice, volume })
    }
  }

  // Un album par tome : on préfère une notice avec ISBN, puis la plus ancienne
  const byVolume = new Map()
  for (const notice of kept) {
    const current = byVolume.get(notice.volume)
    const better =
      !current ||
      (!current.isbn && notice.isbn) ||
      (!!current.isbn === !!notice.isbn &&
        (notice.publishedOn ?? '9999') < (current.publishedOn ?? '9999'))
    if (better) byVolume.set(notice.volume, notice)
  }
  const albums = [...byVolume.values()].sort((a, b) => a.volume - b.volume)
  const total = albums.length > 0 ? albums[albums.length - 1].volume : null
  // Part des tomes 1..total que la BnF référence : en dessous du seuil, le total est douteux
  // (nom de série ambigu, numérotation d'une autre collection…) et on ne l'enregistre pas.
  const coverage = total ? albums.length / total : 0
  return {
    total,
    albums,
    skipped,
    matched: inSeries.length,
    coverage,
    reliable: coverage >= MIN_COVERAGE,
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Exécute `task` sur chaque élément, `limit` à la fois, en gardant l'ordre des résultats. */
export async function mapLimit(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Une page de résultats, avec quelques nouvelles tentatives si la BnF est surchargée. */
async function fetchPage(query, start, fetchFn, retryDelayMs) {
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query,
    recordSchema: 'unimarcxchange',
    maximumRecords: String(PAGE_SIZE),
    startRecord: String(start),
  })
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchFn(`${SRU_URL}?${params}`, {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`BnF : HTTP ${response.status}`)
      const xml = await response.text()
      return {
        total: Number(xml.match(/numberOfRecords>(\d+)/)?.[1] ?? 0),
        notices: parseNotices(xml),
      }
    } catch (error) {
      if (attempt >= 3) throw error
      await sleep(retryDelayMs * attempt)
    }
  }
}

/**
 * Récupère les notices de la BnF susceptibles d'appartenir à la série (par pages de 50).
 * La première page donne le nombre total ; les suivantes sont lues `pageConcurrency` à la fois.
 */
export async function fetchNotices(
  seriesName,
  { fetchFn = fetch, retryDelayMs = 1000, pageConcurrency = 3 } = {},
) {
  const term = seriesName.replace(/"/g, ' ')
  const query = `bib.anywhere all "${term}" and bib.doctype all "a"`
  const first = await fetchPage(query, 1, fetchFn, retryDelayMs)
  const starts = []
  for (
    let start = 1 + PAGE_SIZE;
    start <= MAX_NOTICES && start <= first.total;
    start += PAGE_SIZE
  ) {
    starts.push(start)
  }
  const others = await mapLimit(starts, pageConcurrency, async (start) => {
    const page = await fetchPage(query, start, fetchFn, retryDelayMs)
    return page.notices
  })
  return [...first.notices, ...others.flat()]
}
