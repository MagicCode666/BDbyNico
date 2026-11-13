-- Test de l'édition principale d'un tome (migration 20261136) : set_primary_edition, remplacement,
-- retrait, perte du statut au changement de numéro, annulation. S'arrête TOUJOURS par une exception
-- (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/edition_principale.sql

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
  a1 text := pg_temp._t_isbn('978994100001');
  a2 text := pg_temp._t_isbn('978994100002');
  a3 text := pg_temp._t_isbn('978994100003');
  integ text := pg_temp._t_isbn('978994100004');
  n int := 0;
  r text;
  c int;
  ch bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (u_mod, 'mod3@test.invalid', 'authenticated', 'authenticated'),
    (u_usr, 'usr3@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'moderator' where id = u_mod;
  insert into public.series (name) values ('Série à éditions multiples') returning id into s1;
  insert into public.editions (isbn, title, series_id, volume, source, created_by) values
    (a1, 'Tome 24 ancienne édition', s1, 24, 'manual', u_mod),
    (a2, 'Bwouf allô Bill', s1, 24, 'manual', u_mod),
    (a3, 'Tome 23', s1, 23, 'manual', u_mod);
  insert into public.editions (isbn, title, series_id, kind, source, created_by)
    values (integ, 'Intégrale', s1, 'integral', 'manual', u_mod);

  -- 1. Un modérateur désigne la principale : appliqué, journalisé
  perform pg_temp._t_as(u_mod);
  select public.set_primary_edition(a1) into r;
  reset role;
  if r <> 'applied' then raise exception 'ECHEC : % au lieu de applied', r; end if; n := n + 1;
  if not (select is_primary from public.editions where isbn = a1) then
    raise exception 'ECHEC : édition non principale'; end if; n := n + 1;
  select count(*) into c from public.catalogue_changes
    where isbn = a1 and kind = 'edition_primary' and old_value = '' and new_value = a1;
  if c <> 1 then raise exception 'ECHEC : journal absent'; end if; n := n + 1;

  -- 2. Redésigner la même édition ne fait rien
  perform pg_temp._t_as(u_mod);
  select public.set_primary_edition(a1) into r;
  reset role;
  if r <> 'unchanged' then raise exception 'ECHEC : % au lieu de unchanged', r; end if; n := n + 1;

  -- 3. Une autre édition du même tome remplace la première : une seule principale
  perform pg_temp._t_as(u_mod);
  select public.set_primary_edition(a2) into r;
  reset role;
  select count(*) into c from public.editions where series_id = s1 and volume = 24 and is_primary;
  if c <> 1 or not (select is_primary from public.editions where isbn = a2) then
    raise exception 'ECHEC : % principales pour le tome 24', c; end if; n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = a2 and kind = 'edition_primary' and new_value = a2;
  if (select old_value from public.catalogue_changes where id = ch) <> a1 then
    raise exception 'ECHEC : ancienne principale non journalisée'; end if; n := n + 1;

  -- 4. Les autres tomes ne sont pas touchés
  if (select is_primary from public.editions where isbn = a3) then
    raise exception 'ECHEC : le tome 23 est devenu principal'; end if; n := n + 1;

  -- 5. Un utilisateur ordinaire est refusé
  begin
    perform pg_temp._t_as(u_usr);
    perform public.set_primary_edition(a1);
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a désigné une principale';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  -- 6. Une intégrale (hors grille) ne peut pas être principale ; deux principales non plus
  begin
    perform pg_temp._t_as(u_mod);
    perform public.set_primary_edition(integ);
    reset role;
    raise exception 'ECHEC : une intégrale est devenue principale';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  begin
    update public.editions set is_primary = true where isbn = a1;
    raise exception 'ECHEC : deux principales pour le même tome';
  exception when unique_violation then n := n + 1; end;

  -- 7. Annuler le choix rend sa place à l'ancienne principale
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  if not (select is_primary from public.editions where isbn = a1)
     or (select is_primary from public.editions where isbn = a2) then
    raise exception 'ECHEC : annulation sans effet'; end if; n := n + 1;
  if (select status from public.catalogue_changes where id = ch) <> 'reverted' then
    raise exception 'ECHEC : changement non marqué annulé'; end if; n := n + 1;

  -- 8. Retirer le choix puis l'annuler
  perform pg_temp._t_as(u_mod);
  select public.set_primary_edition(a1, false) into r;
  reset role;
  if r <> 'applied' or exists (select 1 from public.editions where series_id = s1 and is_primary) then
    raise exception 'ECHEC : retrait sans effet'; end if; n := n + 1;
  select id into ch from public.catalogue_changes
    where kind = 'edition_primary' and new_value = '' and isbn = a1 and status = 'applied';
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  if not (select is_primary from public.editions where isbn = a1) then
    raise exception 'ECHEC : annulation du retrait sans effet'; end if; n := n + 1;

  -- 9. Une édition qui change de numéro perd son statut de principale
  update public.editions set volume = 22 where isbn = a1;
  if (select is_primary from public.editions where isbn = a1) then
    raise exception 'ECHEC : statut conservé après changement de numéro'; end if; n := n + 1;

  -- 10. Les autres types de changement s'annulent toujours (délégation à la fonction interne)
  perform pg_temp._t_as(u_mod);
  perform public.correct_edition(a3, jsonb_build_object('title', 'Tome 23 corrigé'));
  reset role;
  select id into ch from public.catalogue_changes where isbn = a3 and kind = 'edition_title';
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  if (select title from public.editions where isbn = a3) <> 'Tome 23' then
    raise exception 'ECHEC : annulation d''un autre changement cassée'; end if; n := n + 1;

  -- 11. L'annulation reste réservée aux modérateurs
  begin
    perform pg_temp._t_as(u_usr);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a annulé un changement';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
