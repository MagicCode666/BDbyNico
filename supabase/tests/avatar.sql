-- Test de l'avatar (migration 20261133) : format et taille imposés par la base, visible de soi et de
-- ses amis seulement.
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/avatar.sql

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
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ok_avatar text := 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  c int;
  v text;
  n int := 0;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (ua, 'va@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Avatar A"}'),
    (ub, 'vb@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Avatar B"}'),
    (uc, 'vc@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Avatar C"}');

  -- 1. Chacun règle son avatar ; un format d'image courant est accepté
  perform pg_temp._t_as(ua);
  update public.profiles set avatar = ok_avatar where id = ua;
  select avatar into v from public.profiles where id = ua;
  reset role;
  if v is distinct from ok_avatar then raise exception 'ECHEC : avatar non enregistré'; end if; n := n + 1;

  -- 2. Formats et tailles refusés : autre schéma, autre type, SVG, adresse distante, trop gros
  declare
    bad text;
  begin
    foreach bad in array array[
      'javascript:alert(1)',
      'https://exemple.test/a.png',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:text/html;base64,PGgxPmE8L2gxPg==',
      'data:image/webp;base64,@@@',
      'data:image/webp;base64,' || repeat('A', 30000)
    ] loop
      begin
        perform pg_temp._t_as(ua);
        update public.profiles set avatar = bad where id = ua;
        reset role;
        raise exception 'ECHEC : avatar refusé attendu pour %', left(bad, 40);
      exception when check_violation then reset role; n := n + 1; end;
    end loop;
  end;

  -- 3. Personne ne règle l'avatar d'un autre
  perform pg_temp._t_as(ub);
  update public.profiles set avatar = ok_avatar where id = ua;
  get diagnostics c = row_count;
  reset role;
  if c <> 0 then raise exception 'ECHEC : avatar d''un autre modifié'; end if; n := n + 1;
  perform pg_temp._t_as(ub);
  select count(*) into c from public.profiles where id = ua;
  reset role;
  if c <> 0 then raise exception 'ECHEC : profil d''un autre lisible'; end if; n := n + 1;

  -- 4. Un ami voit l'avatar (liste d'amis et demandes) ; un non-ami ne voit rien
  insert into public.friendships (requester, addressee, status, responded_at)
  values (ua, ub, 'accepted', now());
  perform pg_temp._t_as(ub);
  select avatar into v from public.list_friends() where friend_id = ua;
  reset role;
  if v is distinct from ok_avatar then raise exception 'ECHEC : avatar invisible pour un ami'; end if; n := n + 1;
  perform pg_temp._t_as(uc);
  select count(*) into c from public.list_friends();
  reset role;
  if c <> 0 then raise exception 'ECHEC : avatar visible pour un non-ami'; end if; n := n + 1;
  insert into public.friendships (requester, addressee) values (ua, uc);
  perform pg_temp._t_as(uc);
  select avatar into v from public.list_friend_requests() where user_id = ua;
  reset role;
  if v is distinct from ok_avatar then raise exception 'ECHEC : avatar absent de la demande'; end if; n := n + 1;

  -- 5. Le lien public ne le contient pas
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar'
  ) and (
    select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'collection_rows'
      and pg_get_function_result(p.oid) like '%avatar%'
  ) > 0 then raise exception 'ECHEC : avatar exposé par la vue publique'; end if; n := n + 1;

  -- 6. Retirer l'avatar
  perform pg_temp._t_as(ua);
  update public.profiles set avatar = null where id = ua;
  reset role;
  if (select avatar from public.profiles where id = ua) is not null then
    raise exception 'ECHEC : avatar non retiré'; end if; n := n + 1;

  raise exception 'OK : % vérifications', n;
end;
$test$;
