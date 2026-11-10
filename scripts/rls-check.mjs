// Vérifie les règles de sécurité (RLS) du projet Supabase avec deux comptes de test.
// Usage : node scripts/rls-check.mjs
// Les identifiants sont demandés au clavier (mot de passe masqué) et ne sont jamais écrits.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      rl._writeToOutput = (text) => {
        if (text.includes(question)) process.stdout.write(text)
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

const newClient = () =>
  createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function login(label) {
  const email = await ask(`Email du compte ${label} : `)
  const password = await ask(`Mot de passe du compte ${label} : `, true)
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Connexion ${label} impossible : ${error.message}`)
  return { client, id: data.user.id }
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${name}${!ok && detail ? ` -> ${detail}` : ''}`)
}
const show = (x) => JSON.stringify(x)

// ISBN-13 de test valide (clé de contrôle calculée)
const isbn = (() => {
  const base = '978999999999'
  const sum = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return base + ((10 - (sum % 10)) % 10)
})()

const A = await login('A')
const B = await login('B')
if (A.id === B.id)
  throw new Error('Les deux comptes sont identiques : utilisez deux comptes différents.')
const anon = newClient()
console.log('\n--- Profils ---')

let r = await A.client.from('profiles').select('id, share_token')
check('A ne voit que son propre profil', r.data?.length === 1 && r.data[0].id === A.id, show(r))
const tokenA = r.data?.[0]?.share_token
r = await B.client.from('profiles').select('id')
check('B ne voit que son propre profil', r.data?.length === 1 && r.data[0].id === B.id, show(r))
r = await anon.from('profiles').select('id')
check('Un anonyme ne peut pas lire les profils', !!r.error || r.data?.length === 0, show(r))

r = await A.client
  .from('profiles')
  .update({ share_token: 'a'.repeat(36) })
  .eq('id', A.id)
check('A ne peut pas fixer son jeton de partage', !!r.error, show(r))
r = await A.client.from('profiles').update({ pseudo: 'Pseudo A modifié' }).eq('id', A.id).select()
check('A peut modifier son pseudo', r.data?.[0]?.pseudo === 'Pseudo A modifié', show(r))
r = await B.client.from('profiles').update({ pseudo: 'Piraté' }).eq('id', A.id).select()
check('B ne peut pas modifier le profil de A', !r.error && r.data?.length === 0, show(r))

console.log('\n--- Catalogue ---')
r = await A.client.from('editions').insert({ isbn, title: 'x' })
check('Insertion directe dans editions refusée', !!r.error, show(r))
r = await A.client.rpc('add_edition', { p_isbn: '9781234567890', p_title: 'x' })
check('ISBN invalide refusé par add_edition', !!r.error, show(r))
r = await A.client.rpc('add_edition', {
  p_isbn: isbn,
  p_title: 'TEST RLS - à supprimer',
  p_series_name: 'Série de test RLS',
  p_volume: 1,
  p_authors: ['Test'],
})
check('A ajoute une édition via add_edition', !r.error && r.data?.isbn === isbn, show(r))
r = await B.client.from('editions').select('isbn').eq('isbn', isbn)
check("B voit l'édition ajoutée par A (catalogue partagé)", r.data?.length === 1, show(r))
r = await anon.from('editions').select('isbn')
check('Un anonyme ne peut pas lire le catalogue', !!r.error || r.data?.length === 0, show(r))
r = await anon.rpc('add_edition', { p_isbn: isbn, p_title: 'x' })
check('Un anonyme ne peut pas appeler add_edition', !!r.error, show(r))

// Couvertures : adresse imposée (Open Library ou Amazon construites à partir de l'ISBN), jamais écrasée
const coverOl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
r = await anon.rpc('set_edition_cover', { p_isbn: isbn, p_cover_url: coverOl })
check('Un anonyme ne peut pas appeler set_edition_cover', !!r.error, show(r))
r = await A.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: 'https://exemple.invalid/couverture.jpg',
})
check('Adresse de couverture non autorisée refusée', !!r.error, show(r))
r = await A.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `https://covers.openlibrary.org/b/isbn/9780000000002-L.jpg`,
})
check("Adresse d'un autre ISBN refusée", !!r.error, show(r))
r = await A.client.rpc('set_edition_cover', { p_isbn: isbn, p_cover_url: coverOl })
check('A renseigne la couverture (adresse autorisée)', !r.error, show(r))
r = await B.client.from('editions').select('cover_url').eq('isbn', isbn)
check('La couverture est visible de B', r.data?.[0]?.cover_url === coverOl, show(r))
// Une couverture déjà renseignée n'est jamais écrasée, même par une autre adresse autorisée
const isbn10 = (() => {
  const body = isbn.slice(3, 12)
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (10 - i), 0)
  const check = (11 - (sum % 11)) % 11
  return body + (check === 10 ? 'X' : check)
})()
const coverAmazon = `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`
r = await B.client.rpc('set_edition_cover', { p_isbn: isbn, p_cover_url: coverAmazon })
check('Une autre adresse autorisée est acceptée sans erreur', !r.error, show(r))
const bnfBase = 'https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/cb41492610m'
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `${bnfBase}&couverture=1`,
})
check('Une adresse de couverture de la BnF est acceptée sans erreur', !r.error, show(r))
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `${bnfBase}&couverture=1&autre=1`,
})
check('Une adresse de la BnF avec un paramètre en trop est refusée', !!r.error, show(r))
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `${bnfBase}&couverture=1`.replace('catalogue.bnf.fr', 'exemple.invalid'),
})
check('Une fausse adresse de la BnF (autre site) est refusée', !!r.error, show(r))
r = await B.client.from('editions').select('cover_url').eq('isbn', isbn)
check(
  "La couverture déjà renseignée n'est pas écrasée",
  r.data?.[0]?.cover_url === coverOl,
  show(r),
)
r = await A.client
  .from('editions')
  .update({ cover_url: 'https://x/y.jpg' })
  .eq('isbn', isbn)
  .select()
check('A ne peut pas modifier une édition directement', !!r.error || r.data?.length === 0, show(r))

console.log('\n--- Import en masse ---')
const mkIsbn = (base12) => {
  const sum = [...base12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}
const importIsbn = mkIsbn('978999999998')
r = await anon.rpc('import_editions', { p_rows: [] })
check('Un anonyme ne peut pas appeler import_editions', !!r.error, show(r))
r = await A.client.rpc('import_editions', { p_rows: 'pas un tableau' })
check('Données qui ne sont pas un tableau refusées', !!r.error, show(r))
r = await A.client.rpc('import_editions', {
  p_rows: Array.from({ length: 501 }, () => ({ isbn: importIsbn, title: 'x' })),
})
check('Plus de 500 lignes dans un envoi refusé', !!r.error, show(r))
r = await A.client.rpc('import_editions', {
  p_rows: [
    {
      isbn: importIsbn,
      title: 'Import test',
      series: 'Série de test RLS',
      volume: 2,
      authors: ['Test'],
      publisher: 'Éditeur',
      published_on: '2020-01-01',
    },
    { isbn: '9781234567890', title: 'ISBN invalide' },
    { isbn: importIsbn, title: 'Doublon dans le lot' },
    { isbn, title: 'Déjà présent' },
    { isbn: mkIsbn('978999999997'), title: '' },
  ],
})
// Premier passage : 1 créée + 2 déjà présentes ; passages suivants : 3 déjà présentes
check(
  'import_editions compte créées, existantes et invalides',
  !r.error && r.data?.invalid === 2 && r.data.created + r.data.existing === 3,
  show(r),
)
r = await B.client
  .from('editions')
  .select('title, volume, source, publisher')
  .eq('isbn', importIsbn)
check(
  "L'édition importée est lisible de B avec ses champs",
  r.data?.[0]?.title === 'Import test' &&
    r.data[0].volume === 2 &&
    r.data[0].source === 'import' &&
    r.data[0].publisher === 'Éditeur',
  show(r),
)
r = await A.client.rpc('import_editions', {
  p_rows: [{ isbn: importIsbn, title: 'Autre titre', volume: 9 }],
})
r = await B.client.from('editions').select('title, volume').eq('isbn', importIsbn)
check(
  "Une édition existante n'est jamais modifiée par un import",
  r.data?.[0]?.title === 'Import test' && r.data[0].volume === 2,
  show(r),
)

console.log('\n--- Collection ---')
r = await A.client
  .from('collection_items')
  .insert({ user_id: A.id, isbn, status: 'owned' })
  .select()
check('A ajoute un album à sa collection', !r.error && r.data?.length === 1, show(r))
const itemId = r.data?.[0]?.id
// B peut avoir sa propre collection : on vérifie qu'aucune ligne de A ne lui est visible
r = await B.client.from('collection_items').select('id, user_id')
check(
  'B ne voit aucune ligne de la collection de A',
  !r.error && r.data.every((row) => row.user_id === B.id && row.id !== itemId),
  show(r),
)
r = await B.client.from('collection_items').insert({ user_id: A.id, isbn, status: 'wanted' })
check('B ne peut pas insérer une ligne au nom de A', !!r.error, show(r))
r = await B.client.from('collection_items').update({ status: 'wanted' }).eq('id', itemId).select()
check("B ne peut pas modifier l'album de A", !r.error && r.data?.length === 0, show(r))
r = await B.client.from('collection_items').delete().eq('id', itemId).select()
check("B ne peut pas supprimer l'album de A", !r.error && r.data?.length === 0, show(r))
r = await A.client.from('collection_items').select('status').eq('id', itemId)
check("L'album de A est intact", r.data?.[0]?.status === 'owned', show(r))
r = await A.client
  .from('collection_items')
  .update({ dedication: 'drawing', dedication_by: 'Hergé', first_edition: true })
  .eq('id', itemId)
  .select()
check(
  'A renseigne dédicace (dessin) et édition originale',
  !r.error &&
    r.data?.[0]?.dedication === 'drawing' &&
    r.data[0].dedication_by === 'Hergé' &&
    r.data[0].first_edition === true,
  show(r),
)
r = await A.client.from('collection_items').update({ dedication: 'autre' }).eq('id', itemId)
check('Type de dédicace inconnu refusé', !!r.error, show(r))
r = await A.client
  .from('collection_items')
  .update({ dedication_by: 'x'.repeat(101) })
  .eq('id', itemId)
check('Nom de dédicace trop long refusé', !!r.error, show(r))
r = await B.client
  .from('collection_items')
  .update({ dedication: 'signature' })
  .eq('id', itemId)
  .select()
check('B ne peut pas modifier la dédicace de A', !r.error && r.data?.length === 0, show(r))
r = await A.client.from('collection_items').insert({ user_id: A.id, isbn, status: 'wanted' })
check('Doublon (même ISBN) refusé', !!r.error, show(r))
r = await anon.from('collection_items').select('id')
check('Un anonyme ne peut pas lire les collections', !!r.error || r.data?.length === 0, show(r))

console.log('\n--- Séries et réglages personnels ---')
r = await A.client
  .from('series')
  .select('id, total_volumes, total_source')
  .eq('name_key', 'serie de test rls')
const seriesId = r.data?.[0]?.id
check(
  'A voit la série du catalogue (avec total_source)',
  !!seriesId && !!r.data[0].total_source,
  show(r),
)
r = await A.client.from('series').update({ total_volumes: 999 }).eq('id', seriesId).select()
check('A ne peut pas modifier le total partagé', !!r.error || r.data?.length === 0, show(r))
r = await A.client.from('series').insert({ name: 'Série pirate' })
check('A ne peut pas créer de série directement', !!r.error, show(r))
r = await anon.from('series').select('id')
check('Un anonyme ne peut pas lire les séries', !!r.error || r.data?.length === 0, show(r))

r = await A.client
  .from('user_series_settings')
  .insert({ user_id: A.id, series_id: seriesId, ignored_volumes: [3, 5], total_override: 12 })
  .select()
check('A enregistre ses réglages de série', !r.error && r.data?.length === 1, show(r))
r = await A.client
  .from('user_series_settings')
  .insert({ user_id: A.id, series_id: seriesId, total_override: 0 })
check('Total personnel 0 refusé', !!r.error, show(r))
r = await A.client
  .from('user_series_settings')
  .update({ total_override: 1000 })
  .eq('series_id', seriesId)
check('Total personnel 1000 refusé', !!r.error, show(r))
r = await B.client.from('user_series_settings').select('series_id')
check('B ne voit pas les réglages de A', !r.error && r.data?.length === 0, show(r))
r = await B.client
  .from('user_series_settings')
  .insert({ user_id: A.id, series_id: seriesId, ignored_volumes: [1] })
check('B ne peut pas écrire des réglages au nom de A', !!r.error, show(r))
r = await B.client
  .from('user_series_settings')
  .update({ ignored_volumes: [1, 2, 3] })
  .eq('user_id', A.id)
  .select()
check('B ne peut pas modifier les réglages de A', !r.error && r.data?.length === 0, show(r))
r = await B.client.from('user_series_settings').delete().eq('user_id', A.id).select()
check('B ne peut pas supprimer les réglages de A', !r.error && r.data?.length === 0, show(r))
r = await A.client.from('user_series_settings').select('ignored_volumes, total_override')
check(
  'Les réglages de A sont intacts',
  r.data?.length === 1 &&
    show(r.data[0].ignored_volumes) === '[3,5]' &&
    r.data[0].total_override === 12,
  show(r),
)
r = await anon.from('user_series_settings').select('series_id')
check('Un anonyme ne peut pas lire les réglages', !!r.error || r.data?.length === 0, show(r))

console.log('\n--- Partage ---')
r = await anon.rpc('get_shared_collection', { p_token: tokenA })
check('Partage désactivé : le jeton ne renvoie rien', !r.error && r.data?.length === 0, show(r))
await A.client.from('profiles').update({ share_enabled: true }).eq('id', A.id)
r = await anon.rpc('get_shared_collection', { p_token: tokenA })
const row = r.data?.[0]
check(
  'Partage activé : un anonyme voit la collection de A',
  r.data?.length === 1 && row.isbn === isbn,
  show(r),
)
const keys = row ? Object.keys(row).sort().join(',') : ''
check(
  'La vue publique ne contient que les champs prévus',
  keys === 'authors,cover_url,isbn,pseudo,series_name,status,title,volume',
  keys,
)
r = await anon.rpc('get_shared_collection', { p_token: 'jeton-inconnu' })
check('Un faux jeton ne renvoie rien', !r.error && r.data?.length === 0, show(r))
r = await B.client.rpc('get_shared_collection', { p_token: tokenA })
check(
  'Le lien fonctionne aussi pour un autre utilisateur connecté (lecture seule)',
  r.data?.length === 1,
  show(r),
)
r = await A.client.rpc('regenerate_share_token')
const newToken = r.data
check(
  'A régénère son jeton',
  !r.error && typeof newToken === 'string' && newToken !== tokenA,
  show(r),
)
r = await anon.rpc('get_shared_collection', { p_token: tokenA })
check("L'ancien lien ne fonctionne plus", !r.error && r.data?.length === 0, show(r))
r = await anon.rpc('get_shared_collection', { p_token: newToken })
check('Le nouveau lien fonctionne', r.data?.length === 1, show(r))
r = await anon.rpc('regenerate_share_token')
check('Un anonyme ne peut pas régénérer de jeton', !!r.error, show(r))
r = await anon.rpc('delete_my_account')
check('Un anonyme ne peut pas supprimer de compte', !!r.error, show(r))

console.log('\n--- Gouvernance du catalogue ---')
r = await A.client.from('profiles').update({ role: 'admin' }).eq('id', A.id)
check('Un utilisateur ne peut pas se donner le rôle administrateur', !!r.error, show(r))
r = await A.client.from('profiles').update({ contribution: 'collection_only' }).eq('id', A.id)
check('Un utilisateur ne peut pas modifier son niveau de contribution', !!r.error, show(r))
r = await A.client.from('profiles').select('role, contribution').eq('id', A.id).single()
check(
  'Un compte ordinaire a le rôle « user » et le niveau « full »',
  r.data?.role === 'user' && r.data?.contribution === 'full',
  show(r),
)
r = await B.client.rpc('report_cover', { p_isbn: isbn, p_cover_url: null })
check("Un non-possesseur ne peut pas signaler la couverture d'un album", !!r.error, show(r))
r = await A.client.rpc('report_cover', {
  p_isbn: isbn,
  p_cover_url: 'https://exemple.invalid/couverture.jpg',
})
check('Signalement avec une adresse non autorisée refusé', !!r.error, show(r))
r = await anon.rpc('report_cover', { p_isbn: isbn, p_cover_url: null })
check('Un anonyme ne peut pas signaler de couverture', !!r.error, show(r))
r = await A.client.rpc('report_cover', { p_isbn: isbn, p_cover_url: null })
check(
  'Le possesseur signale une couverture (appliquée sans attente)',
  r.data === 'applied',
  show(r),
)
r = await A.client.from('editions').select('cover_url, cover_locked').eq('isbn', isbn).single()
check(
  'Le choix verrouille la couverture (le job ne la remplace plus)',
  r.data?.cover_url === null && r.data?.cover_locked === true,
  show(r),
)
r = await A.client.rpc('set_edition_cover', { p_isbn: isbn, p_cover_url: coverOl })
r = await A.client.from('editions').select('cover_url').eq('isbn', isbn).single()
check(
  'La mise à jour automatique ne touche pas une couverture verrouillée',
  r.data?.cover_url === null,
  show(r),
)
r = await A.client.from('catalogue_changes').select('id, user_id, kind, status')
check(
  'A ne lit que ses propres lignes du journal',
  !r.error && r.data.length > 0 && r.data.every((row) => row.user_id === A.id),
  show(r),
)
r = await B.client.from('catalogue_changes').select('id, user_id')
check(
  'B ne voit aucune ligne du journal de A',
  !r.error && r.data.every((row) => row.user_id !== A.id),
  show(r),
)
r = await anon.from('catalogue_changes').select('id')
check('Un anonyme ne peut pas lire le journal', !!r.error || r.data?.length === 0, show(r))
r = await A.client.from('catalogue_changes').insert({ origin: 'user', kind: 'cover', isbn })
check('Aucune écriture directe dans le journal', !!r.error, show(r))
r = await A.client.rpc('review_change', { p_id: 1, p_accept: true })
check('Un utilisateur ordinaire ne peut pas valider une proposition', !!r.error, show(r))
r = await A.client.rpc('revert_change', { p_id: 1 })
check('Un utilisateur ordinaire ne peut pas annuler un changement', !!r.error, show(r))
r = await A.client.rpc('list_catalogue_changes')
check('Un utilisateur ordinaire ne peut pas lister tout le journal', !!r.error, show(r))
r = await A.client.rpc('list_users_admin')
check('Un utilisateur ordinaire ne peut pas lister les utilisateurs', !!r.error, show(r))
r = await A.client.rpc('set_contribution_level', { p_user: B.id, p_level: 'collection_only' })
check('Un utilisateur ordinaire ne peut pas restreindre un autre utilisateur', !!r.error, show(r))
r = await B.client.from('profiles').select('contribution').eq('id', B.id).single()
check('Le niveau de B est resté « full »', r.data?.contribution === 'full', show(r))
console.log(
  '  (les parcours « collection seule », validation et annulation sont testés par supabase/tests/gouvernance.sql)',
)

console.log('\n--- Nettoyage ---')
await A.client.from('profiles').update({ share_enabled: false }).eq('id', A.id)
r = await A.client.from('collection_items').delete().eq('id', itemId).select()
check('A supprime son album de test', !r.error && r.data?.length === 1, show(r))
r = await A.client.from('user_series_settings').delete().eq('series_id', seriesId).select()
check('A supprime ses réglages de test', !r.error && r.data?.length === 1, show(r))

console.log(`\n${passed} réussis, ${failed} échoués`)
console.log(
  `Reste dans le catalogue partagé (non supprimable par les utilisateurs) : ISBN ${isbn} et la série « Série de test RLS ».`,
)
process.exit(failed === 0 ? 0 : 1)
