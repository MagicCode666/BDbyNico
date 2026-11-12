-- Test du pseudo unique (migration 20261131).
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/pseudo.sql

create function pg_temp._t_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

do $test$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid();
  u5 uuid := gen_random_uuid();
  p text;
  ok boolean;
  n int := 0;
begin
  -- 1. Inscription : le pseudo demandé est gardé s'il est valide et libre
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u1, 'a1@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Éloïse"}');
  select pseudo into p from public.profiles where id = u1;
  if p <> 'Éloïse' then raise exception 'ECHEC : pseudo inattendu (%)', p; end if; n := n + 1;

  -- 2. Même pseudo à la casse et aux accents près : l'inscription réussit, avec un suffixe
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u2, 'a2@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "eloise"}');
  select pseudo into p from public.profiles where id = u2;
  if p <> 'eloise-2' then raise exception 'ECHEC : suffixe attendu (%)', p; end if; n := n + 1;

  -- 3. Pseudo invalide (trop court, caractères interdits) : corrigé, jamais d'échec d'inscription
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u3, 'ab@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "ab"}');
  select pseudo into p from public.profiles where id = u3;
  if p <> 'lecteur' then raise exception 'ECHEC : pseudo court non corrigé (%)', p; end if; n := n + 1;
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u4, 'a4@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "<b>Nico</b> @ /"}');
  select pseudo into p from public.profiles where id = u4;
  if p <> 'bNicob' then raise exception 'ECHEC : caractères interdits conservés (%)', p; end if; n := n + 1;

  -- 4. Sans pseudo : début de l'adresse e-mail, avec suffixe si nécessaire
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u5, 'eloise@test.invalid', 'authenticated', 'authenticated', '{}');
  select pseudo into p from public.profiles where id = u5;
  if p <> 'eloise-3' then raise exception 'ECHEC : pseudo issu du mail (%)', p; end if; n := n + 1;

  -- 5. Changement de pseudo : refusé s'il est pris (23505) ou invalide (22023), accepté sinon
  begin
    perform pg_temp._t_as(u2);
    update public.profiles set pseudo = 'ÉLOISE' where id = u2;
    reset role;
    raise exception 'ECHEC : pseudo déjà pris accepté';
  exception when unique_violation then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u2);
    update public.profiles set pseudo = 'x' where id = u2;
    reset role;
    raise exception 'ECHEC : pseudo trop court accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  perform pg_temp._t_as(u2);
  update public.profiles set pseudo = '  Marie-Claire  ' where id = u2;
  reset role;
  select pseudo into p from public.profiles where id = u2;
  if p <> 'Marie-Claire' then raise exception 'ECHEC : pseudo non nettoyé (%)', p; end if; n := n + 1;
  -- l'ancien pseudo est libéré
  perform pg_temp._t_as(u3);
  update public.profiles set pseudo = 'eloise-2' where id = u3;
  reset role;
  n := n + 1;

  -- 6. Disponibilité : libre, pris (casse et accents ignorés), invalide ; son propre pseudo est libre
  perform pg_temp._t_as(u1);
  select public.pseudo_available('Nouveau pseudo') into ok;
  if not ok then raise exception 'ECHEC : pseudo libre refusé'; end if; n := n + 1;
  select public.pseudo_available('MARIE-CLAIRE') into ok;
  if ok then raise exception 'ECHEC : pseudo pris disponible'; end if; n := n + 1;
  select public.pseudo_available('ELOISE') into ok;
  if not ok then raise exception 'ECHEC : son propre pseudo refusé'; end if; n := n + 1;
  select public.pseudo_available('a@b') into ok;
  if ok then raise exception 'ECHEC : pseudo invalide disponible'; end if; n := n + 1;
  reset role;

  -- 7. Un anonyme peut tester une disponibilité, mais pas lire les profils
  set local role anon;
  select public.pseudo_available('Zoé Libre') into ok;
  if not ok then raise exception 'ECHEC : disponibilité refusée à un anonyme'; end if; n := n + 1;
  begin
    perform count(*) from public.profiles;
    raise exception 'ECHEC : un anonyme lit les profils';
  exception when insufficient_privilege then null; n := n + 1; end;
  reset role;

  raise exception 'OK : % vérifications', n;
end;
$test$;
