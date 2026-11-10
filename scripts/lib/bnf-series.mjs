// Calcul du total de tomes d'une série et de la liste de ses albums à partir du catalogue de la BnF.
// Utilisé par le job quotidien (scripts/update-series-totals.mjs).
import {
  parseFormatCm,
  parseLanguage,
  parsePages,
  parsePublicPrice,
  parseSummary,
} from '../../src/lib/bnfFields.ts'
import { isbn13To10, normalizeIsbn } from '../../src/lib/isbn.ts'
import { fetchWithRetry } from './covers.mjs'

const SRU_URL = 'https://catalogue.bnf.fr/api/SRU'
const PAGE_SIZE = 50
/** Part minimale de tomes référencés pour considérer le total comme fiable. */
const MIN_COVERAGE = 0.5
/** Seuil réduit quand un album que l'on possède confirme qu'il s'agit bien de la série. */
const MIN_COVERAGE_CONFIRMED = 0.25
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
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Retire la précision entre parenthèses ajoutée par certaines bases (« Lucky Luke (Dargaud) »
 * → « Lucky Luke »). Une parenthèse avec un chiffre (« Gaston (40ème Anniversaire) ») désigne
 * une collection à part : le nom est alors gardé tel quel.
 */
export function strippedName(name) {
  const stripped = name.replace(/\s*\([^)\d]*\)\s*/g, ' ').trim()
  return stripped || name
}

/**
 * Noms de série à essayer à la BnF pour un nom d'origine : le nom sans sa précision entre
 * parenthèses, puis le nom contenu dans la parenthèse. Bubble écrit par exemple
 * « La Maison Des Fragances (Les Parfums Du Pouvoir - La saga de la Maison Capella) » alors que la
 * série s'appelle « Les parfums du pouvoir ». Une parenthèse avec un chiffre désigne une
 * collection à part (« Gaston (40ème Anniversaire) ») : elle n'est pas essayée.
 */
export function nameVariants(name) {
  const variants = [strippedName(name)]
  // Seulement une parenthèse de la forme « Série - sous-titre » ; « (Dargaud) » ou « (Divers) »
  // sont des précisions (éditeur, auteur), pas des noms de série.
  const inner = name.match(/\(([^)\d]+)\)/)?.[1]
  const parts = inner?.split(/\s+[-–—]\s+/)
  const first = parts && parts.length > 1 ? parts[0].trim() : undefined
  if (first && first.length >= 3) variants.push(first)
  const seen = new Set()
  return variants.filter((variant) => {
    const key = nameKey(variant)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Les auteurs les plus fréquents (nom complet) d'une liste d'albums. */
export function topAuthors(editions, count = 3) {
  const tally = new Map()
  for (const edition of editions) {
    for (const author of new Set(edition.authors ?? [])) {
      tally.set(author, (tally.get(author) ?? 0) + 1)
    }
  }
  return [...tally]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([author]) => author)
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
      dateText: sub(f210, 'd'),
      seriesName: sub(f225, 'a') ? cleanSeriesName(sub(f225, 'a')) : undefined,
      volumeText: sub(f225, 'v'),
      details: {
        summary: parseSummary(sub(datafields(record, '330')[0], 'a')),
        pages: parsePages(sub(datafields(record, '215')[0], 'a')),
        formatCm: parseFormatCm(sub(datafields(record, '215')[0], 'd')),
        publicPrice: parsePublicPrice(
          sub(
            datafields(record, '010').find((f) => sub(f, 'd')),
            'd',
          ),
        ),
        language: parseLanguage(sub(datafields(record, '101')[0], 'a')),
      },
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
export function computeSeries(notices, seriesName, { minCoverage = MIN_COVERAGE } = {}) {
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
    reliable: coverage >= minCoverage,
  }
}

/**
 * Trouve dans les notices la série qui correspond le mieux au nom donné. Le nom du site d'origine
 * peut différer de celui de la BnF (« Gaston Lagaffe » / « Gaston », « Tintin » / « Les aventures
 * de Tintin ») : sont candidates les séries au même nom (sans la précision entre parenthèses)
 * et celles qui contiennent un album que l'on possède déjà (`ownedIsbns`).
 * On garde la candidate fiable qui référence le plus de tomes.
 */
export function bestMatch(notices, seriesName, ownedIsbns = []) {
  const wanted = new Set([nameKey(seriesName), nameKey(strippedName(seriesName))])
  const owned = new Set(ownedIsbns)
  const candidates = new Map()
  const confirmed = new Set()
  for (const notice of notices) {
    if (!notice.seriesName) continue
    const key = nameKey(notice.seriesName)
    const isOwned = notice.isbn && owned.has(notice.isbn)
    if (wanted.has(key) || isOwned) candidates.set(key, notice.seriesName)
    if (isOwned) confirmed.add(key)
  }
  let best = { ...computeSeries(notices, seriesName), bnfName: seriesName }
  for (const [key, name] of candidates) {
    const minCoverage = confirmed.has(key) ? MIN_COVERAGE_CONFIRMED : MIN_COVERAGE
    const result = { ...computeSeries(notices, name, { minCoverage }), bnfName: name }
    const better =
      (result.reliable && !best.reliable) ||
      (result.reliable === best.reliable && result.albums.length > best.albums.length)
    if (better) best = result
  }
  return best
}

/**
 * Statut de publication d'après la « notice d'ensemble » de la série à la BnF : ses dates de
 * parution sont ouvertes (« 2003- ») tant que la série continue et fermées (« 2003-2014 ») une
 * fois terminée. Renvoie undefined quand la BnF ne dit rien (ou rien de sûr).
 */
export function publicationStatus(notices, seriesName) {
  const key = nameKey(seriesName)
  const umbrella = notices.filter(
    (n) => /notice d'ensemble/i.test(n.mention) && n.title && nameKey(n.title) === key,
  )
  let status
  for (const notice of umbrella) {
    const text = notice.dateText ?? ''
    if (/\d{4}\s*-\s*\d{4}/.test(text)) return 'finished'
    if (/\d{4}\s*-\s*\]?\s*$/.test(text)) status = 'ongoing'
  }
  return status
}

/**
 * Nouveau total à enregistrer, ou undefined s'il ne change pas. Un album que l'on possède prouve
 * que son tome existe : le total n'est jamais inférieur au plus grand tome connu, même si la BnF
 * ne le référence pas. Un tome possédé ne suffit pas à lui seul à créer un total (sans total
 * fiable, il resterait présenté comme certain alors qu'il n'est qu'un minimum).
 */
export function decideTotal({ reliable, bnfTotal, current, ownedMax }) {
  const trusted = reliable || !!current
  if (!trusted) return undefined
  const candidate = Math.max(reliable ? (bnfTotal ?? 0) : 0, ownedMax ?? 0)
  return candidate > (current ?? 0) ? candidate : undefined
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
  { fetchFn = fetch, retryDelayMs = 1000, pageConcurrency = 3, authors = [] } = {},
) {
  const quote = (text) => text.replace(/"/g, ' ')
  // Restreindre aux auteurs connus évite de noyer les séries au nom courant (« XIII », « Le Chat »)
  const byAuthor =
    authors.length > 0
      ? ` and (${authors.map((author) => `bib.author all "${quote(author)}"`).join(' or ')})`
      : ''
  const query = `bib.anywhere all "${quote(strippedName(seriesName))}"${byAuthor} and bib.doctype all "a"`
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

/**
 * Noms de série que la BnF donne aux albums déjà connus (par ISBN), du plus fréquent au moins
 * fréquent. C'est la façon la plus sûre de retrouver le nom officiel d'une série dont le nom
 * d'origine diffère (« Tintin » → « Les aventures de Tintin »).
 */
export async function seriesNamesForIsbns(isbns, { fetchFn = fetch, max = 2 } = {}) {
  const wanted = new Set(isbns)
  const terms = [...wanted]
    .slice(0, 20)
    .flatMap((isbn) => [isbn, isbn13To10(isbn)])
    .filter(Boolean)
  if (terms.length === 0) return []
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: `bib.isbn any "${terms.join(' ')}"`,
    recordSchema: 'unimarcxchange',
    maximumRecords: '50',
  })
  const response = await fetchFn(`${SRU_URL}?${params}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`BnF : HTTP ${response.status}`)
  const counts = new Map()
  for (const notice of parseNotices(await response.text())) {
    if (!notice.seriesName || !notice.isbn || !wanted.has(notice.isbn)) continue
    const key = nameKey(notice.seriesName)
    const current = counts.get(key)
    counts.set(key, { name: notice.seriesName, count: (current?.count ?? 0) + 1 })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((entry) => entry.name)
}

/**
 * Champs descriptifs (résumé, pages, format, prix, langue) des albums demandés, par ISBN-13.
 * Un ISBN absent de la réponse n'apparaît pas dans le résultat. Une seule requête pour tout le lot.
 */
export async function fetchDetails(isbns, { fetchFn = fetch, retry } = {}) {
  const wanted = new Set(isbns)
  const terms = isbns.flatMap((isbn) => [isbn, isbn13To10(isbn)]).filter(Boolean)
  if (terms.length === 0) return new Map()
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: `bib.isbn any "${terms.join(' ')}"`,
    recordSchema: 'unimarcxchange',
    maximumRecords: '50',
  })
  const response = await fetchWithRetry(
    fetchFn,
    `${SRU_URL}?${params}`,
    { signal: AbortSignal.timeout(30000) },
    retry,
  )
  if (!response.ok) throw new Error(`BnF : HTTP ${response.status}`)
  const found = new Map()
  for (const notice of parseNotices(await response.text())) {
    if (notice.isbn && wanted.has(notice.isbn) && !found.has(notice.isbn)) {
      found.set(notice.isbn, notice.details)
    }
  }
  return found
}
