// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// Rejoue toutes les migrations sur un Postgres embarqué (sans aucun secret), puis les scénarios
// SQL de supabase/tests : gouvernance (droits, journal, propositions, validation, annulation),
// recherche globale. Chaque scénario se termine par une exception qui annule ses écritures et dont
// le message donne le résultat (« OK : n vérifications »).
const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Environnement Supabase minimal : rôles, schéma `auth`, schéma `extensions`. */
const SUPABASE_ENV = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema extensions; create schema auth;
  grant usage on schema public, extensions to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, aud text, role text,
    raw_user_meta_data jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid $$;
  grant usage on schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

async function runScenario(db: PGlite, file: string): Promise<string> {
  return db.exec(read(file)).then(
    () => 'Le scénario aurait dû se terminer par une exception',
    (error: Error) => error.message,
  )
}

describe('migrations et scénarios SQL', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite({ extensions: { unaccent, pgcrypto, pg_trgm } })
    await db.exec(SUPABASE_ENV)
    const migrations = readdirSync(join(root, 'migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const name of migrations) await db.exec(read(`migrations/${name}`))
  }, 120_000)

  it('le scénario de gouvernance réussit', async () => {
    expect(await runScenario(db, 'tests/gouvernance.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario de recherche globale réussit', async () => {
    expect(await runScenario(db, 'tests/recherche.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario de la fiche album réussit', async () => {
    expect(await runScenario(db, 'tests/fiche_album.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario des genres réussit', async () => {
    expect(await runScenario(db, 'tests/genres.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario du partage réussit', async () => {
    expect(await runScenario(db, 'tests/partage.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario des corrections du catalogue réussit', async () => {
    expect(await runScenario(db, 'tests/corrections.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario de l’édition principale réussit', async () => {
    expect(await runScenario(db, 'tests/edition_principale.sql')).toMatch(
      /^OK : \d+ vérifications$/,
    )
  }, 120_000)

  it('le scénario ISBN et fusion d’éditions réussit', async () => {
    expect(await runScenario(db, 'tests/isbn_editions.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario du pseudo unique réussit', async () => {
    expect(await runScenario(db, 'tests/pseudo.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario des amis réussit', async () => {
    expect(await runScenario(db, 'tests/amis.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario de l’avatar réussit', async () => {
    expect(await runScenario(db, 'tests/avatar.sql')).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)

  it('le scénario de la suppression de compte réussit', async () => {
    expect(await runScenario(db, 'tests/suppression_compte.sql')).toMatch(
      /^OK : \d+ vérifications$/,
    )
  }, 120_000)
})
