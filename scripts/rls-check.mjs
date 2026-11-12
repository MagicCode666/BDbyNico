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

// Le compte A doit etre un contributeur ordinaire (role user, niveau full) : avec le niveau
// collection seule, ses changements de couverture et de type restent en attente de validation
// et encombrent la file de l'administration. On s'arrete avant de rien creer.
const levelA = await A.client.from('profiles').select('role, contribution').eq('id', A.id).single()
if (levelA.data?.role !== 'user' || levelA.data?.contribution !== 'full') {
  throw new Error(
    `Le compte A doit avoir le role user et le niveau full (actuellement ${show(levelA.data)}) : ` +
      'reglez-le dans Administration > Utilisateurs (Contributeur), puis relancez.',
  )
}
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
r = await B.client.from('profiles').select('pseudo').eq('id', B.id).single()
const pseudoB = r.data?.pseudo
r = await A.client
  .from('profiles')
  .update({ pseudo: pseudoB?.toUpperCase() })
  .eq('id', A.id)
  .select()
check(
  'Le pseudo est unique (casse ignorée) : A ne peut pas prendre celui de B',
  r.error?.code === '23505',
  show(r),
)
r = await A.client.from('profiles').update({ pseudo: 'ab' }).eq('id', A.id).select()
check('Un pseudo trop court est refusé', r.error?.code === '22023', show(r))
r = await anon.rpc('pseudo_available', { p_pseudo: pseudoB })
check('pseudo_available : un pseudo pris n’est pas disponible', r.data === false, show(r))
r = await anon.rpc('pseudo_available', { p_pseudo: 'Pseudo introuvable zz9' })
check(
  'pseudo_available : un pseudo libre est disponible (même pour un anonyme)',
  r.data === true,
  show(r),
)

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
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `https://products-images.di-static.com/image/x/${isbn}-475x500-1.jpg`,
})
check('Une adresse de couverture Decitre est acceptée sans erreur', !r.error, show(r))
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: `https://pictures.abebooks.com/isbn/${isbn}-fr-300.jpg`,
})
check('Une adresse de couverture AbeBooks est acceptée sans erreur', !r.error, show(r))
r = await B.client.rpc('set_edition_cover', {
  p_isbn: isbn,
  p_cover_url: 'https://pictures.abebooks.com/isbn/9780000000002-fr-300.jpg',
})
check('Une adresse de libraire pour un autre ISBN est refusée', !!r.error, show(r))
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
await A.client.rpc('import_editions', {
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
// B peut avoir ses propres réglages : on vérifie qu'aucune ligne de A ne lui est visible
r = await B.client.from('user_series_settings').select('series_id, user_id')
check(
  'B ne voit aucun réglage de A',
  !r.error && r.data.every((row) => row.user_id !== A.id),
  show(r),
)
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
  keys ===
    'authors,cover_url,dedicated,isbn,kind,pseudo,series_id,series_name,series_status,series_total,starts_at_zero,status,title,volume,volume_from,volume_to',
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
r = await anon.rpc('get_shared_collection', { p_token: newToken })
check(
  'Les dédicaces ne sont pas publiques par défaut',
  r.data?.[0]?.dedicated === false && !JSON.stringify(r.data).includes('Hergé'),
  show(r),
)
r = await A.client.from('profiles').update({ share_dedications: true }).eq('id', A.id).select()
check('A peut activer le partage de ses dédicaces', !r.error && r.data?.length === 1, show(r))
r = await anon.rpc('get_shared_collection', { p_token: newToken })
check(
  'Dédicaces activées : signalées, mais sans le nom du dédicaceur',
  r.data?.[0]?.dedicated === true && !JSON.stringify(r.data).includes('Hergé'),
  show(r),
)
await A.client.from('profiles').update({ share_dedications: false }).eq('id', A.id)
r = await A.client.from('profiles').update({ share_wishes: false }).eq('id', A.id).select()
check('A peut masquer ses envies', !r.error && r.data?.length === 1, show(r))
await A.client.from('profiles').update({ share_wishes: true }).eq('id', A.id)
r = await B.client
  .from('profiles')
  .update({ share_wishes: false, share_dedications: true })
  .eq('id', A.id)
  .select()
check(
  'B ne peut pas modifier les réglages de partage de A',
  !r.error && r.data?.length === 0,
  show(r),
)
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
// Album dédié (le verrou de couverture persiste d'un passage à l'autre : l'état de départ importe peu)
const govIsbn = mkIsbn('978999999996')
const govCover = `https://covers.openlibrary.org/b/isbn/${govIsbn}-L.jpg`
r = await A.client.rpc('add_edition', {
  p_isbn: govIsbn,
  p_title: 'TEST RLS gouvernance - à supprimer',
  p_series_name: 'Série de test RLS',
  p_volume: 2,
})
check('A crée un album pour les tests de gouvernance', !r.error, show(r))
await A.client.from('collection_items').insert({ user_id: A.id, isbn: govIsbn, status: 'owned' })
r = await A.client.from('collection_items').select('id').eq('isbn', govIsbn).single()
const govItemId = r.data?.id
check('A possède cet album', !r.error && !!govItemId, show(r))
// A n'a pas cet album dans sa collection (créé par l'import de test) : refusé.
// (B ne convient pas ici : il peut être administrateur, donc autorisé à corriger tout album.)
r = await A.client.rpc('report_cover', { p_isbn: importIsbn, p_cover_url: null })
check("Un non-possesseur ne peut pas signaler la couverture d'un album", !!r.error, show(r))
r = await A.client.rpc('report_cover', {
  p_isbn: govIsbn,
  p_cover_url: 'https://exemple.invalid/couverture.jpg',
})
check('Signalement avec une adresse non autorisée refusé', !!r.error, show(r))
r = await anon.rpc('report_cover', { p_isbn: govIsbn, p_cover_url: null })
check('Un anonyme ne peut pas signaler de couverture', !!r.error, show(r))
r = await A.client.rpc('report_cover', { p_isbn: govIsbn, p_cover_url: govCover })
check(
  'Le possesseur choisit une couverture autorisée',
  !r.error && ['applied', 'unchanged'].includes(r.data),
  show(r),
)
r = await A.client.rpc('report_cover', { p_isbn: govIsbn, p_cover_url: null })
check(
  'Le possesseur signale « pas de couverture » (appliqué sans attente)',
  r.data === 'applied',
  show(r),
)
r = await A.client.from('editions').select('cover_url, cover_locked').eq('isbn', govIsbn).single()
check(
  'Le choix verrouille la couverture (le job ne la remplace plus)',
  r.data?.cover_url === null && r.data?.cover_locked === true,
  show(r),
)
await A.client.rpc('set_edition_cover', { p_isbn: govIsbn, p_cover_url: govCover })
r = await A.client.from('editions').select('cover_url').eq('isbn', govIsbn).single()
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
// Un modérateur ou un administrateur lit tout le journal (voulu) : le contrôle dépend du rôle de B
r = await B.client.from('profiles').select('role').eq('id', B.id).single()
const bIsModerator = r.data?.role === 'moderator' || r.data?.role === 'admin'
r = await B.client.from('catalogue_changes').select('id, user_id')
check(
  bIsModerator
    ? 'B (modérateur) lit tout le journal, y compris les lignes de A'
    : 'B ne voit aucune ligne du journal de A',
  !r.error &&
    (bIsModerator
      ? r.data.some((row) => row.user_id === A.id)
      : r.data.every((row) => row.user_id !== A.id)),
  show(r),
)
r = await anon.from('catalogue_changes').select('id')
check('Un anonyme ne peut pas lire le journal', !!r.error || r.data?.length === 0, show(r))
r = await A.client
  .from('catalogue_changes')
  .insert({ origin: 'user', kind: 'cover', isbn: govIsbn })
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
// (B peut être administrateur, donc autorisé : le contrôle d'un non-possesseur se fait avec A)
r = await A.client.rpc('set_edition_kind', {
  p_isbn: importIsbn,
  p_kind: 'integral',
  p_from: 1,
  p_to: 3,
})
check("A ne peut pas changer le type d'un album qu'il ne possède pas", !!r.error, show(r))
r = await anon.rpc('set_edition_kind', { p_isbn: govIsbn, p_kind: 'integral', p_from: 1, p_to: 3 })
check("Un anonyme ne peut pas changer le type d'un album", !!r.error, show(r))
r = await A.client.rpc('set_edition_kind', {
  p_isbn: govIsbn,
  p_kind: 'coffret',
  p_from: 1,
  p_to: 3,
})
check("Un type d'album inconnu est refusé", !!r.error, show(r))
r = await A.client.rpc('set_edition_kind', {
  p_isbn: govIsbn,
  p_kind: 'integral',
  p_from: 3,
  p_to: 1,
})
check('Une plage de tomes inversée est refusée', !!r.error, show(r))
r = await A.client.rpc('set_edition_kind', {
  p_isbn: govIsbn,
  p_kind: 'integral',
  p_from: 1,
  p_to: 3,
})
check(
  'Le possesseur déclare une intégrale des tomes 1 à 3',
  !r.error && ['applied', 'unchanged'].includes(r.data),
  show(r),
)
r = await A.client
  .from('editions')
  .select('kind, volume_from, volume_to')
  .eq('isbn', govIsbn)
  .single()
check(
  'Le type et la plage sont enregistrés',
  r.data?.kind === 'integral' && r.data?.volume_from === 1 && r.data?.volume_to === 3,
  show(r),
)
r = await A.client.from('editions').update({ kind: 'album' }).eq('isbn', govIsbn).select()
check("Aucune modification directe du type d'un album", !!r.error || r.data?.length === 0, show(r))
r = await A.client.rpc('set_edition_kind', {
  p_isbn: govIsbn,
  p_kind: 'album',
  p_from: null,
  p_to: null,
})
check(
  "Le possesseur rétablit l'album ordinaire (état de départ du prochain passage)",
  !r.error && ['applied', 'unchanged'].includes(r.data),
  show(r),
)
r = await A.client.rpc('rename_series', { p_series: seriesId, p_name: 'Nom pirate' })
check('Un utilisateur ordinaire ne peut pas renommer une série', !!r.error, show(r))
r = await A.client.rpc('set_series_total', { p_series: seriesId, p_total: 99 })
check('Un utilisateur ordinaire ne peut pas fixer le total partagé', !!r.error, show(r))
r = await A.client.rpc('set_series_status', { p_series: seriesId, p_status: 'finished' })
check('Un utilisateur ordinaire ne peut pas fixer le statut partagé', !!r.error, show(r))
r = await A.client.rpc('list_series_admin', { p_query: 'test' })
check('Un utilisateur ordinaire ne peut pas lister les séries (administration)', !!r.error, show(r))
r = await anon.rpc('rename_series', { p_series: seriesId, p_name: 'Nom pirate' })
check('Un anonyme ne peut pas renommer une série', !!r.error, show(r))
r = await A.client
  .from('series')
  .select('name, total_source, status_source')
  .eq('id', seriesId)
  .single()
check(
  'La série est intacte (nom, total et statut non modifiés)',
  r.data?.name === 'Série de test RLS' &&
    r.data?.total_source === 'auto' &&
    r.data?.status_source === 'auto',
  show(r),
)
console.log(
  '  (les parcours « collection seule », validation et annulation sont testés par supabase/tests/gouvernance.sql)',
)

console.log('\n--- Fiche album, genres, corrections et recherche ---')
const denied = (res) => res.error?.code === '42501'
r = await anon.rpc('fill_edition_details', { p_isbn: isbn, p_summary: 'x' })
check('Un anonyme ne peut pas appeler fill_edition_details', !!r.error, show(r))
r = await A.client.rpc('fill_edition_details', {
  p_isbn: isbn,
  p_summary: 'Résumé de test',
  p_pages: 48,
  p_format_cm: 32,
  p_public_price: 13.5,
  p_language: 'fre',
})
check('A complète la fiche d’une édition', !r.error, show(r))
await A.client.rpc('fill_edition_details', { p_isbn: isbn, p_summary: 'Vandalisme', p_pages: 999 })
r = await B.client.from('editions').select('summary, pages').eq('isbn', isbn).single()
check(
  'Une fiche déjà remplie n’est jamais écrasée (et B la voit)',
  r.data?.summary === 'Résumé de test' && r.data?.pages === 48,
  show(r),
)
r = await A.client.rpc('fill_edition_details', { p_isbn: isbn, p_pages: -5, p_language: 'x' })
check('Des valeurs hors limites sont ignorées sans erreur', !r.error, show(r))
r = await A.client.from('editions').update({ summary: 'Direct' }).eq('isbn', isbn).select()
check('Aucune écriture directe du résumé', !!r.error || r.data?.length === 0, show(r))

r = await A.client.from('series').select('genres').eq('id', seriesId).single()
const genresBefore = show(r.data?.genres)
r = await A.client.rpc('set_series_genres', { p_series: seriesId, p_genres: ['aventure'] })
check('Un utilisateur ordinaire ne peut pas fixer les genres (refus de droit)', denied(r), show(r))
r = await anon.rpc('set_series_genres', { p_series: seriesId, p_genres: ['aventure'] })
check('Un anonyme ne peut pas fixer les genres', !!r.error, show(r))
r = await A.client
  .from('series')
  .update({ genres: ['polar'] })
  .eq('id', seriesId)
  .select()
check('Aucune écriture directe des genres', !!r.error || r.data?.length === 0, show(r))
r = await A.client.from('series').select('genres').eq('id', seriesId).single()
check('Les genres de la série sont intacts', show(r.data?.genres) === genresBefore, show(r))

const someUuid = '00000000-0000-0000-0000-000000000001'
r = await A.client.rpc('correct_edition', { p_isbn: isbn, p_changes: { title: 'Vandalisme' } })
check('Un utilisateur ordinaire ne peut pas corriger un album (refus de droit)', denied(r), show(r))
r = await anon.rpc('correct_edition', { p_isbn: isbn, p_changes: { title: 'Vandalisme' } })
check('Un anonyme ne peut pas corriger un album', !!r.error, show(r))
r = await A.client.rpc('set_edition_series', { p_isbn: isbn, p_series: null })
check('Un utilisateur ordinaire ne peut pas détacher un album (refus de droit)', denied(r), show(r))
r = await anon.rpc('set_edition_series', { p_isbn: isbn, p_series: seriesId })
check('Un anonyme ne peut pas rattacher un album à une série', !!r.error, show(r))
r = await A.client.rpc('merge_series', { p_from: seriesId, p_into: someUuid })
check(
  'Un utilisateur ordinaire ne peut pas fusionner des séries (refus de droit)',
  denied(r),
  show(r),
)
r = await anon.rpc('merge_series', { p_from: seriesId, p_into: someUuid })
check('Un anonyme ne peut pas fusionner des séries', !!r.error, show(r))
r = await A.client.rpc('correct_isbn', { p_old: isbn, p_new: '9782205073492' })
check('Un utilisateur ordinaire ne peut pas corriger un ISBN (refus de droit)', denied(r), show(r))
r = await anon.rpc('correct_isbn', { p_old: isbn, p_new: '9782205073492' })
check('Un anonyme ne peut pas corriger un ISBN', !!r.error, show(r))
r = await A.client.rpc('merge_editions', { p_from: isbn, p_into: '9782205073492' })
check(
  'Un utilisateur ordinaire ne peut pas fusionner des éditions (refus de droit)',
  denied(r),
  show(r),
)
r = await anon.rpc('merge_editions', { p_from: isbn, p_into: '9782205073492' })
check('Un anonyme ne peut pas fusionner des éditions', !!r.error, show(r))
r = await B.client.from('editions').select('title, series_id').eq('isbn', isbn).single()
check(
  'L’album et sa série sont intacts après ces tentatives',
  r.data?.title === 'TEST RLS - à supprimer' && r.data?.series_id === seriesId,
  show(r),
)

r = await anon.rpc('search_catalogue', { p_query: 'test' })
check('Un anonyme ne peut pas utiliser la recherche globale', !!r.error, show(r))
r = await A.client.rpc('search_catalogue', { p_query: 'test rls' })
check('A utilise la recherche globale', !r.error && Array.isArray(r.data), show(r))

console.log('\n--- Nettoyage ---')
await A.client
  .from('profiles')
  .update({ share_enabled: false, share_wishes: true, share_dedications: false })
  .eq('id', A.id)
r = await A.client.from('collection_items').delete().eq('id', govItemId).select()
check("A retire l'album de gouvernance de sa collection", !r.error && r.data?.length === 1, show(r))
r = await A.client.from('collection_items').delete().eq('id', itemId).select()
check('A supprime son album de test', !r.error && r.data?.length === 1, show(r))
r = await A.client.from('user_series_settings').delete().eq('series_id', seriesId).select()
check('A supprime ses réglages de test', !r.error && r.data?.length === 1, show(r))

console.log(`\n${passed} réussis, ${failed} échoués`)
console.log(
  `Reste dans le catalogue partagé (non supprimable par les utilisateurs) : ISBN ${isbn} et la série « Série de test RLS ».`,
)
process.exit(failed === 0 ? 0 : 1)
