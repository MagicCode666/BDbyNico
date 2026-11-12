-- Test de la correction d'ISBN et de la fusion d'éditions (migration 20261129).
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/isbn_editions.sql

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
  u_mod uuid := gen_random_uuid();
  u_usr uuid := gen_random_uuid();
  u_two uuid := gen_random_uuid();
  s1 uuid;
  bad text := pg_temp._t_isbn('978995000001');
  good text := pg_temp._t_isbn('978995000002');
  other text := pg_temp._t_isbn('978995000003');
  r text;
  m int;
  c int;
  e public.editions;
  n int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (u_mod, 'mod3@test.invalid', 'authenticated', 'authenticated'),
    (u_usr, 'usr3@test.invalid', 'authenticated', 'authenticated'),
    (u_two, 'two3@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'moderator' where id = u_mod;
  insert into public.series (name) values ('Série ISBN') returning id into s1;
  insert into public.editions
    (isbn, title, series_id, volume, authors, cover_url, summary, pages, details_checked_at,
     source, created_by)
  values
    (bad, 'Album', s1, 1, array['A'], 'https://covers.openlibrary.org/b/isbn/' || bad || '-L.jpg',
     'Résumé', 48, now(), 'manual', u_mod),
    (other, 'Album (autre édition)', null, null, array[]::text[], null, 'Autre résumé', 60, now(),
     'manual', u_mod);
  insert into public.collection_items (user_id, isbn, status) values
    (u_usr, bad, 'owned'), (u_two, bad, 'wanted');

  -- 1. Un modérateur corrige l'ISBN : collections suivent, infos de l'ancien ISBN effacées
  perform pg_temp._t_as(u_mod);
  select public.correct_isbn(bad, good) into r;
  reset role;
  if r <> good then raise exception 'ECHEC : nouvel ISBN non renvoyé'; end if; n := n + 1;
  if exists (select 1 from public.editions where isbn = bad) then
    raise exception 'ECHEC : ancien ISBN encore présent'; end if; n := n + 1;
  select * into e from public.editions where isbn = good;
  if e.cover_url is not null or e.summary is not null or e.pages is not null
     or e.details_checked_at is not null or e.title <> 'Album' or e.series_id <> s1 then
    raise exception 'ECHEC : fiche inattendue (%)', row_to_json(e); end if; n := n + 1;
  select count(*) into c from public.collection_items where isbn = good;
  if c <> 2 or exists (select 1 from public.collection_items where isbn = bad) then
    raise exception 'ECHEC : collections non suivies (%)', c; end if; n := n + 1;
  select count(*) into c from public.catalogue_changes
    where kind = 'edition_isbn' and isbn = good and old_value = bad and new_value = good;
  if c <> 1 then raise exception 'ECHEC : correction non journalisée'; end if; n := n + 1;

  -- 2. Refus : ISBN invalide, déjà existant, utilisateur ordinaire
  begin
    perform pg_temp._t_as(u_mod);
    perform public.correct_isbn(good, '9789950000000');
    reset role;
    raise exception 'ECHEC : ISBN invalide accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.correct_isbn(good, other);
    reset role;
    raise exception 'ECHEC : ISBN existant accepté';
  exception when unique_violation then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_usr);
    perform public.correct_isbn(good, pg_temp._t_isbn('978995000009'));
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a corrigé un ISBN';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  -- 3. Fusion : p_from absorbée ; champs vides complétés, collections reprises, doublon résolu
  insert into public.collection_items (user_id, isbn, status) values (u_two, other, 'wanted');
  perform pg_temp._t_as(u_mod);
  select public.merge_editions(other, good) into m;
  reset role;
  if m <> 1 then raise exception 'ECHEC : 1 entrée attendue, %', m; end if; n := n + 1;
  if exists (select 1 from public.editions where isbn = other) then
    raise exception 'ECHEC : édition absorbée encore présente'; end if; n := n + 1;
  select * into e from public.editions where isbn = good;
  if e.summary <> 'Autre résumé' or e.pages <> 60 or e.title <> 'Album' then
    raise exception 'ECHEC : complétion inattendue (%)', row_to_json(e); end if; n := n + 1;
  if (select count(*) from public.collection_items where isbn = good) <> 2 then
    raise exception 'ECHEC : doublon de collection'; end if; n := n + 1;

  -- 4. Ni la correction d'ISBN ni la fusion ne s'annulent
  begin
    perform pg_temp._t_as(u_mod);
    perform public.revert_change((
      select id from public.catalogue_changes where kind = 'edition_isbn' and isbn = good));
    reset role;
    raise exception 'ECHEC : correction d''ISBN annulée';
  exception when object_not_in_prerequisite_state then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.revert_change((
      select id from public.catalogue_changes where kind = 'edition_merge' and isbn = good));
    reset role;
    raise exception 'ECHEC : fusion annulée';
  exception when object_not_in_prerequisite_state then reset role; n := n + 1; end;

  -- 5. Fusion avec soi-même et par un utilisateur ordinaire refusées
  begin
    perform pg_temp._t_as(u_mod);
    perform public.merge_editions(good, good);
    reset role;
    raise exception 'ECHEC : fusion avec soi-même';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_usr);
    perform public.merge_editions(good, bad);
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a fusionné';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
