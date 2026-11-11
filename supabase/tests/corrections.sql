-- Test des corrections du catalogue (migration 20261128) : correct_edition, set_edition_series,
-- merge_series et annulation. S'arrête TOUJOURS par une exception (annulation) :
-- « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/corrections.sql

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
  s1 uuid;
  s2 uuid;
  i1 text := pg_temp._t_isbn('978994000001');
  i2 text := pg_temp._t_isbn('978994000002');
  n int := 0;
  e public.editions;
  c int;
  ch bigint;
  m int;
begin
  insert into auth.users (id, email, aud, role) values
    (u_mod, 'mod2@test.invalid', 'authenticated', 'authenticated'),
    (u_usr, 'usr2@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'moderator' where id = u_mod;
  insert into public.series (name) values ('Série source') returning id into s1;
  insert into public.series (name) values ('Série cible') returning id into s2;
  insert into public.editions (isbn, title, series_id, volume, authors, source, created_by) values
    (i1, 'Titre erroné', s1, 7, array['Ancien'], 'manual', u_mod),
    (i2, 'Autre album', s1, 8, array['X'], 'manual', u_mod);

  -- 1. Un modérateur corrige titre, tome, auteurs, éditeur et date : tout est journalisé
  perform pg_temp._t_as(u_mod);
  select public.correct_edition(i1, jsonb_build_object(
    'title', '  Titre juste ', 'volume', 3, 'authors', jsonb_build_array('A', ' B ', ''),
    'publisher', 'Oxymore', 'published_on', '2025-03-01')) into c;
  reset role;
  if c <> 5 then raise exception 'ECHEC : 5 champs attendus, % modifiés', c; end if; n := n + 1;
  select * into e from public.editions where isbn = i1;
  if e.title <> 'Titre juste' or e.volume <> 3 or e.authors <> array['A', 'B']
     or e.publisher <> 'Oxymore' or e.published_on <> date '2025-03-01' then
    raise exception 'ECHEC : valeurs inattendues (%)', row_to_json(e); end if; n := n + 1;
  select count(*) into c from public.catalogue_changes
    where isbn = i1 and kind like 'edition\_%' and origin = 'admin';
  if c <> 5 then raise exception 'ECHEC : % lignes de journal (5 attendues)', c; end if; n := n + 1;

  -- 2. Une valeur inchangée ne journalise rien
  perform pg_temp._t_as(u_mod);
  select public.correct_edition(i1, jsonb_build_object('title', 'Titre juste')) into c;
  reset role;
  if c <> 0 then raise exception 'ECHEC : modification fantôme'; end if; n := n + 1;

  -- 3. Un utilisateur ordinaire est refusé, et les valeurs interdites aussi
  begin
    perform pg_temp._t_as(u_usr);
    perform public.correct_edition(i1, jsonb_build_object('title', 'Vandalisme'));
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a corrigé un album';
  exception when insufficient_privilege then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.correct_edition(i1, jsonb_build_object('volume', 1000));
    reset role;
    raise exception 'ECHEC : tome hors limites accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.correct_edition(i1, jsonb_build_object('isbn', 'x'));
    reset role;
    raise exception 'ECHEC : champ inconnu accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;

  -- 4. Annuler un changement de titre le rétablit ; plus possible si le titre a encore changé
  select id into ch from public.catalogue_changes
    where isbn = i1 and kind = 'edition_title' and status = 'applied';
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  if (select title from public.editions where isbn = i1) <> 'Titre erroné' then
    raise exception 'ECHEC : titre non rétabli'; end if; n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = i1 and kind = 'edition_volume' and status = 'applied';
  update public.editions set volume = 9 where isbn = i1;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : annulation acceptée alors que le tome a changé';
  exception when object_not_in_prerequisite_state then reset role; n := n + 1; end;

  -- 5. Détacher un album de sa série efface son tome ; l'annulation le rattache de nouveau
  perform pg_temp._t_as(u_mod);
  perform public.set_edition_series(i2, null);
  reset role;
  select * into e from public.editions where isbn = i2;
  if e.series_id is not null or e.volume is not null then
    raise exception 'ECHEC : album non détaché (%)', row_to_json(e); end if; n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = i2 and kind = 'edition_series' and status = 'applied';
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  if (select series_id from public.editions where isbn = i2) is distinct from s1 then
    raise exception 'ECHEC : série non rétablie'; end if; n := n + 1;

  -- 6. Fusion : les albums passent dans la série cible, la source disparaît, la fusion est journalisée
  perform pg_temp._t_as(u_mod);
  select public.merge_series(s1, s2) into m;
  reset role;
  if m <> 2 then raise exception 'ECHEC : 2 albums déplacés attendus, %', m; end if; n := n + 1;
  if exists (select 1 from public.series where id = s1)
     or (select count(*) from public.editions where series_id = s2) <> 2 then
    raise exception 'ECHEC : fusion incomplète'; end if; n := n + 1;
  select id into ch from public.catalogue_changes
    where kind = 'series_merge' and series_id = s2 and old_value = 'Série source';
  if ch is null then raise exception 'ECHEC : fusion non journalisée'; end if; n := n + 1;

  -- 7. Une fusion ne s'annule pas
  begin
    perform pg_temp._t_as(u_mod);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : fusion annulée';
  exception when object_not_in_prerequisite_state then reset role; n := n + 1; end;

  -- 8. Fusionner une série avec elle-même est refusé
  begin
    perform pg_temp._t_as(u_mod);
    perform public.merge_series(s2, s2);
    reset role;
    raise exception 'ECHEC : fusion d''une série avec elle-même';
  exception when invalid_parameter_value then reset role; n := n + 1; end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
