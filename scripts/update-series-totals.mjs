// Job quotidien : calcule le total de tomes de chaque série d'après la BnF et enrichit le
// catalogue partagé avec les albums connus. Sert aussi de ping anti-pause pour Supabase.
//
// Usage :
//   node scripts/update-series-totals.mjs                 mise à jour réelle (clé service_role requise)
//   node scripts/update-series-totals.mjs --dry-run       lit la base, n'écrit rien
//   node scripts/update-series-totals.mjs --limit 20      nombre de séries traitées (100 par défaut)
//   node scripts/update-series-totals.mjs --name "Lucky Luke"   interroge seulement la BnF et affiche
//                                                         le résultat (aucune clé, aucune écriture)
import { createClient } from '@supabase/supabase-js'

import { computeSeries, fetchNotices, mapLimit } from './lib/bnf-series.mjs'

const args = process.argv.slice(2)
const option = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const dryRun = args.includes('--dry-run')
const limit = Number(option('--limit') ?? 100)
// Séries traitées en parallèle (la BnF est lente : ~3 s par requête)
const CONCURRENCY = 4
const singleName = option('--name')

async function inspectOne(name) {
  console.log(`Recherche de « ${name} » à la BnF…`)
  const notices = await fetchNotices(name)
  const result = computeSeries(notices, name)
  console.log(`Notices lues : ${notices.length}, dans la série : ${result.matched}`)
  console.log(
    `Écartées : ${result.skipped.sansNumero} sans numéro, ${result.skipped.special} spéciales`,
  )
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
    .select('id, name, total_volumes')
    .eq('total_source', 'auto')
    .order('total_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw error
  console.log(`${seriesList.length} série(s) à vérifier${dryRun ? ' (simulation)' : ''}.`)

  let done = 0
  let failed = 0
  await mapLimit(seriesList, CONCURRENCY, async (series) => {
    try {
      const notices = await fetchNotices(series.name)
      const result = computeSeries(notices, series.name)
      // Le total ne diminue jamais tout seul : une série ne perd pas de tomes
      const newTotal =
        result.reliable && result.total > (series.total_volumes ?? 0) ? result.total : undefined
      console.log(
        `- ${series.name} : total ${series.total_volumes ?? '?'} -> ${newTotal ?? 'inchangé'}, ` +
          `${result.albums.length} album(s), ${result.skipped.special} spécial(aux) écarté(s)` +
          (result.reliable
            ? ''
            : ` [peu fiable : ${Math.round(result.coverage * 100)} % des tomes référencés, ignoré]`),
      )
      if (!dryRun) {
        const update = { total_checked_at: new Date().toISOString() }
        if (newTotal !== undefined) update.total_volumes = newTotal
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
  if (seriesList.length > 0 && done === 0) process.exit(1)
}

if (singleName) await inspectOne(singleName)
else await run()
