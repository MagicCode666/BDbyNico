-- Test de la suppression de compte (migration 20261134) : tout le privé disparaît, le catalogue
-- reste, et le dernier administrateur est protégé.
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/suppression_compte.sql

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
  ad1 uuid := gen_random_uuid();
  ad2 uuid := gen_random_uuid();
  s1 uuid;
  c int;
  n int := 0;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (ua, 'sa@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Suppr A"}'),
    (ub, 'sb@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Suppr B"}'),
    (ad1, 'sad1@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Suppr Admin 1"}'),
    (ad2, 'sad2@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Suppr Admin 2"}');
  insert into public.series (name) values ('Série suppression') returning id into s1;
  insert into public.editions (isbn, title, series_id, volume, authors, source, created_by)
  values ('9789970000005', 'Album A', s1, 1, array['A'], 'manual', ua);
  insert into public.collection_items (user_id, isbn, status) values
    (ua, '9789970000005', 'owned'), (ub, '9789970000005', 'wanted');
  insert into public.user_series_settings (user_id, series_id) values (ua, s1);
  insert into public.friendships (requester, addressee, status, responded_at)
  values (ua, ub, 'accepted', now());

  -- 1. Un utilisateur supprime son compte : tout son privé disparaît
  perform pg_temp._t_as(ua);
  perform public.delete_my_account();
  reset role;
  select count(*) into c from auth.users where id = ua;
  if c <> 0 then raise exception 'ECHEC : compte non supprimé'; end if; n := n + 1;
  select count(*) into c from public.profiles where id = ua;
  if c <> 0 then raise exception 'ECHEC : profil conservé'; end if; n := n + 1;
  select count(*) into c from public.collection_items where user_id = ua;
  if c <> 0 then raise exception 'ECHEC : collection conservée'; end if; n := n + 1;
  select count(*) into c from public.user_series_settings where user_id = ua;
  if c <> 0 then raise exception 'ECHEC : réglages conservés'; end if; n := n + 1;
  select count(*) into c from public.friendships where ua in (requester, addressee);
  if c <> 0 then raise exception 'ECHEC : amitié conservée'; end if; n := n + 1;

  -- 2. Le reste n'est pas touché : le catalogue reste (sans auteur), l'autre utilisateur aussi
  select count(*) into c from public.editions where isbn = '9789970000005' and created_by is null;
  if c <> 1 then raise exception 'ECHEC : album du catalogue perdu ou encore rattaché'; end if; n := n + 1;
  select count(*) into c from public.collection_items where user_id = ub;
  if c <> 1 then raise exception 'ECHEC : collection d''un autre touchée'; end if; n := n + 1;
  select count(*) into c from public.profiles where id = ub;
  if c <> 1 then raise exception 'ECHEC : profil d''un autre touché'; end if; n := n + 1;

  -- 3. Le dernier administrateur est protégé
  update public.profiles set role = 'user' where role = 'admin';
  update public.profiles set role = 'admin' where id = ad1;
  begin
    perform pg_temp._t_as(ad1);
    perform public.delete_my_account();
    reset role;
    raise exception 'ECHEC : le dernier administrateur a pu se supprimer';
  exception when sqlstate 'P0001' then
    reset role;
    if sqlerrm <> 'Dernier administrateur' then raise; end if;
    n := n + 1;
  end;
  select count(*) into c from public.profiles where id = ad1;
  if c <> 1 then raise exception 'ECHEC : dernier administrateur supprimé'; end if; n := n + 1;

  -- 4. Avec un deuxième administrateur, la suppression passe
  update public.profiles set role = 'admin' where id = ad2;
  perform pg_temp._t_as(ad1);
  perform public.delete_my_account();
  reset role;
  select count(*) into c from public.profiles where id = ad1;
  if c <> 0 then raise exception 'ECHEC : administrateur non supprimé malgré un second'; end if; n := n + 1;

  -- 5. Sans connexion, impossible
  begin
    set local role anon;
    perform public.delete_my_account();
    reset role;
    raise exception 'ECHEC : suppression anonyme acceptée';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
