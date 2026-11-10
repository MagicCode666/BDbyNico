// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Rejoue toutes les migrations sur un Postgres embarqué (sans aucun secret), puis le scénario
// supabase/tests/gouvernance.sql : droits, journal, propositions en attente, validation, annulation.
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

describe('migrations et gouvernance du catalogue', () => {
  it('toutes les migrations passent et le scénario de gouvernance réussit', async () => {
    const db = new PGlite({ extensions: { unaccent, pgcrypto } })
    await db.exec(SUPABASE_ENV)
    const migrations = readdirSync(join(root, 'migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const name of migrations) await db.exec(read(`migrations/${name}`))

    // Le scénario se termine toujours par une exception (annulation de ses écritures)
    const outcome = await db.exec(read('tests/gouvernance.sql')).then(
      () => 'Le scénario aurait dû se terminer par une exception',
      (error: Error) => error.message,
    )
    expect(outcome).toMatch(/^OK : \d+ vérifications$/)
  }, 120_000)
})
