-- Test de la fiche album (migration 20261123) : fill_edition_details ne fait que compléter.
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/fiche_album.sql

create function pg_temp._t_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp._t_isbn(p_base text) returns text
language sql immutable as $$
  select p_base || ((10 - (
    select sum(d::int * case when (i - 1) % 2 = 0 then 1 else 3 end)
    from unnest(string_to_array(p_base, null)) with ordinality as t(d, i)
  ) % 10) % 10)::text;
$$;

do $test$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  i_a text := pg_temp._t_isbn('978992000001');
  i_p text := pg_temp._t_isbn('978992000002');
  n int := 0;
  r public.editions;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated'),
    (u2, 'u2@test.invalid', 'authenticated', 'authenticated');
  insert into public.editions (isbn, title, authors, source, created_by)
    values (i_a, 'Album A', array['X'], 'manual', u1);
  insert into public.editions (isbn, title, authors, source, created_by, review_status)
    values (i_p, 'Album en attente', array['X'], 'manual', u1, 'pending');

  -- 1. Un utilisateur connecté complète les champs vides
  perform pg_temp._t_as(u2);
  perform public.fill_edition_details(i_a, '  Un résumé ', 48, 32, 13.5, 'fre');
  reset role;
  select * into r from public.editions where isbn = i_a;
  if r.summary <> 'Un résumé' or r.pages <> 48 or r.format_cm <> 32 or r.public_price <> 13.5
     or r.language <> 'fre' or r.details_checked_at is null then
    raise exception 'ECHEC : champs non complétés (%)', row_to_json(r); end if; n := n + 1;

  -- 2. Une valeur déjà présente n'est jamais écrasée
  perform pg_temp._t_as(u2);
  perform public.fill_edition_details(i_a, 'Vandalisme', 999, 10, 1, 'eng');
  reset role;
  select * into r from public.editions where isbn = i_a;
  if r.summary <> 'Un résumé' or r.pages <> 48 or r.format_cm <> 32 or r.public_price <> 13.5
     or r.language <> 'fre' then
    raise exception 'ECHEC : une valeur existante a été écrasée (%)', row_to_json(r); end if; n := n + 1;

  -- 3. Les valeurs hors limites sont ignorées sans erreur
  update public.editions set summary = null, pages = null, format_cm = null, public_price = null,
    language = null where isbn = i_a;
  perform pg_temp._t_as(u2);
  perform public.fill_edition_details(i_a, '   ', 0, 100, -5, 'français');
  reset role;
  select * into r from public.editions where isbn = i_a;
  if r.summary is not null or r.pages is not null or r.format_cm is not null
     or r.public_price is not null or r.language is not null then
    raise exception 'ECHEC : des valeurs invalides ont été retenues (%)', row_to_json(r); end if; n := n + 1;

  -- 4. Une édition en attente n'est pas modifiable par un autre utilisateur
  perform pg_temp._t_as(u2);
  perform public.fill_edition_details(i_p, 'Intrusion', 10, 20, 5, 'fre');
  reset role;
  select * into r from public.editions where isbn = i_p;
  if r.summary is not null or r.details_checked_at is not null then
    raise exception 'ECHEC : édition en attente modifiée par un tiers'; end if; n := n + 1;

  -- 5. Son auteur, lui, peut la compléter
  perform pg_temp._t_as(u1);
  perform public.fill_edition_details(i_p, 'Mon résumé', 10, 20, 5, 'fre');
  reset role;
  select * into r from public.editions where isbn = i_p;
  if r.summary is distinct from 'Mon résumé' then
    raise exception 'ECHEC : l''auteur ne peut pas compléter son édition en attente'; end if; n := n + 1;

  -- 6. Un anonyme ne peut pas appeler la fonction
  begin
    perform set_config('role', 'anon', true);
    perform public.fill_edition_details(i_a, 'x');
    reset role;
    raise exception 'ECHEC : un anonyme a pu appeler fill_edition_details';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
