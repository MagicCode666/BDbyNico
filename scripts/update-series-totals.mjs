// Job quotidien : calcule le total de tomes de chaque série d'après la BnF et enrichit le
// catalogue partagé avec les albums connus. Sert aussi de ping anti-pause pour Supabase.
//
// Usage :
//   node scripts/update-series-totals.mjs                 mise à jour réelle (clé service_role requise)
//   node scripts/update-series-totals.mjs --dry-run       lit la base, n'écrit rien
//   node scripts/update-series-totals.mjs --skip-covers   ne touche pas aux couvertures
//   node scripts/update-series-totals.mjs --limit 20      nombre de séries traitées (100 par défaut)
//   node scripts/update-series-totals.mjs --name "Lucky Luke" [--authors "Morris;Goscinny"]   interroge seulement la BnF et affiche
//                                                         le résultat (aucune clé, aucune écriture)
import { createClient } from '@supabase/supabase-js'

import {
  amazonCoverExists,
  amazonCoverUrl,
  bnfCoverExists,
  bnfCoverUrls,
  findRetailerCover,
  OPEN_LIBRARY_PREFIX,
} from './lib/covers.mjs'
import {
  bestMatch,
  decideTotal,
  fetchNotices,
  mapLimit,
  nameKey,
  nameVariants,
  publicationStatus,
  seriesNamesForIsbns,
  topAuthors,
} from './lib/bnf-series.mjs'

const args = process.argv.slice(2)
const option = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const dryRun = args.includes('--dry-run')
const skipCovers = args.includes('--skip-covers')
// Couvertures Open Library vérifiées par passage (le reste aux passages suivants)
const COVER_BATCH = 1500
const limit = Number(option('--limit') ?? 100)
// Séries traitées en parallèle (la BnF est lente : ~3 s par requête)
const CONCURRENCY = 4
const singleName = option('--name')
const singleAuthors = (option('--authors') ?? '').split(';').filter(Boolean)

async function inspectOne(name) {
  console.log(`Recherche de « ${name} » à la BnF…`)
  const notices = await fetchNotices(name, { authors: singleAuthors })
  const result = bestMatch(notices, name)
  console.log(`Notices lues : ${notices.length}, dans la série : ${result.matched}`)
  console.log(
    `Écartées : ${result.skipped.sansNumero} sans numéro, ${result.skipped.special} spéciales`,
  )
  console.log(`Série BnF retenue : ${result.bnfName}`)
  console.log(`Statut de publication : ${publicationStatus(notices, result.bnfName) ?? 'inconnu'}`)
  console.log(`Total de tomes retenu : ${result.total ?? 'inconnu'}`)
  console.log(`Albums retenus (un par tome) : ${result.albums.length}`)
  console.log(
    `Fiabilité : ${Math.round(result.coverage * 100)} % des tomes référencés -> ` +
      (result.reliable ? 'total enregistré' : 'douteux, ignoré par le job'),
  )
  for (const album of result.albums.slice(-12)) {
    console.log(`  T${album.volume}  ${album.isbn ?? '(sans ISBN)'}  ${album.title}`)
  }
}

/**
 * Cherche la série à la BnF. Les albums déjà saisis par les utilisateurs servent de repères :
 * leurs auteurs restreignent la recherche et leurs ISBN confirment le nom de la série à la BnF.
 */
async function lookupSeries(db, series) {
  const { data: owned, error } = await db
    .from('editions')
    .select('isbn, authors, volume')
    .eq('series_id', series.id)
    .neq('source', 'bnf')
    .eq('review_status', 'approved')
    // Intégrales et hors-séries ne sont pas des tomes : ni repère de série, ni numéro à compter
    .eq('kind', 'album')
  if (error) throw error
  const isbns = owned.map((edition) => edition.isbn)
  const authors = topAuthors(owned)
  const ownedMax = Math.max(0, ...owned.map((edition) => edition.volume ?? 0))

  // Noms à essayer : d'abord celui que la BnF donne aux albums déjà connus, puis les variantes
  // du nom d'origine (sans la précision entre parenthèses, nom contenu dans la parenthèse)
  let anchored = []
  try {
    anchored = await seriesNamesForIsbns(isbns)
  } catch {
    // la recherche par ISBN est un plus : on continue avec le nom d'origine
  }
  const names = []
  for (const name of [...anchored, ...nameVariants(series.name)]) {
    if (!names.some((known) => nameKey(known) === nameKey(name))) names.push(name)
  }

  let fallback
  for (const name of names.slice(0, 3)) {
    for (const withAuthors of authors.length > 0 ? [true, false] : [false]) {
      const notices = await fetchNotices(name, withAuthors ? { authors } : {})
      const result = {
        ...bestMatch(notices, name, isbns),
        ownedMax,
        status: undefined,
      }
      result.status = publicationStatus(notices, result.bnfName)
      if (result.reliable) return result
      fallback ??= result
    }
  }
  return fallback
}

async function run() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
    process.exit(1)
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: seriesList, error } = await db
    .from('series')
    .select('id, name, total_volumes, status_source')
    .eq('total_source', 'auto')
    .order('total_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw error
  console.log(`${seriesList.length} série(s) à vérifier${dryRun ? ' (simulation)' : ''}.`)

  let done = 0
  let failed = 0
  await mapLimit(seriesList, CONCURRENCY, async (series) => {
    try {
      const result = await lookupSeries(db, series)
      // Le total ne diminue jamais tout seul : une série ne perd pas de tomes
      const newTotal = decideTotal({
        reliable: result.reliable,
        bnfTotal: result.total,
        current: series.total_volumes,
        ownedMax: result.ownedMax,
      })
      console.log(
        `- ${series.name}${result.bnfName === series.name ? '' : ` [BnF : ${result.bnfName}]`} : total ${series.total_volumes ?? '?'} -> ${newTotal ?? 'inchangé'}, ` +
          `${result.albums.length} album(s), ${result.skipped.special} spécial(aux) écarté(s)` +
          (result.status ? `, ${result.status === 'finished' ? 'terminée' : 'en cours'}` : '') +
          (result.reliable
            ? ''
            : ` [peu fiable : ${Math.round(result.coverage * 100)} % des tomes référencés, ignoré]`),
      )
      if (!dryRun) {
        const update = { total_checked_at: new Date().toISOString() }
        if (newTotal !== undefined) update.total_volumes = newTotal
        // Un statut fixé à la main par un modérateur n'est jamais modifié
        if (result.reliable && result.status && series.status_source === 'auto') {
          update.publication_status = result.status
        }
        const { error: updateError } = await db.from('series').update(update).eq('id', series.id)
        if (updateError) throw updateError

        // Une correspondance douteuse n'alimente pas le catalogue partagé
        const rows = (result.reliable ? result.albums : [])
          .filter((album) => album.isbn && album.title)
          .map((album) => ({
            isbn: album.isbn,
            title: album.title.slice(0, 300),
            series_id: series.id,
            volume: album.volume,
            authors: album.authors,
            publisher: album.publisher ?? null,
            published_on: album.publishedOn ?? null,
            source: 'bnf',
          }))
        if (rows.length > 0) {
          // Les albums déjà saisis par un utilisateur sont conservés tels quels
          const { error: insertError } = await db
            .from('editions')
            .upsert(rows, { onConflict: 'isbn', ignoreDuplicates: true })
          if (insertError) throw insertError
        }
      }
      done++
    } catch (e) {
      failed++
      console.error(`- ${series.name} : échec (${e.message ?? e})`)
    }
  })
  console.log(`Terminé : ${done} réussie(s), ${failed} en échec.`)
  if (!skipCovers) {
    try {
      await improveCovers(db, 'upgrade')
      await improveCovers(db, 'fill')
    } catch (e) {
      console.error(`Couvertures : échec (${e.message ?? e})`)
    }
  }
  if (seriesList.length > 0 && done === 0) process.exit(1)
}

if (singleName) await inspectOne(singleName)
else await run()
