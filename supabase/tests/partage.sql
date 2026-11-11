-- Test du partage (migration 20261126) : visibilité des envies, des dédicaces, jeton et anonymes.
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/partage.sql

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
  i_own text := pg_temp._t_isbn('978993000001');
  i_wish text := pg_temp._t_isbn('978993000002');
  i_pend text := pg_temp._t_isbn('978993000003');
  v_token text;
  n int := 0;
  c int;
  v_dedicated int;
begin
  insert into auth.users (id, email, aud, role)
    values (u1, 'p1@test.invalid', 'authenticated', 'authenticated');
  insert into public.editions (isbn, title, authors, source, created_by) values
    (i_own, 'Possédé', array['X'], 'manual', u1),
    (i_wish, 'Envie', array['X'], 'manual', u1);
  insert into public.editions (isbn, title, authors, source, created_by, review_status)
    values (i_pend, 'En attente', array['X'], 'manual', u1, 'pending');
  insert into public.collection_items (user_id, isbn, status, read, dedication) values
    (u1, i_own, 'owned', true, 'drawing'),
    (u1, i_wish, 'wanted', false, null),
    (u1, i_pend, 'owned', false, null);
  select share_token into v_token from public.profiles where id = u1;

  -- 1. Partage désactivé : rien n'est visible
  select count(*) into c from public.get_shared_collection(v_token);
  if c <> 0 then raise exception 'ECHEC : collection visible sans partage (%)', c; end if; n := n + 1;

  -- 2. Partage activé : possédé et envie visibles, album en attente exclu
  update public.profiles set share_enabled = true where id = u1;
  select count(*) into c from public.get_shared_collection(v_token);
  if c <> 2 then raise exception 'ECHEC : 2 lignes attendues, % reçues', c; end if; n := n + 1;

  -- 3. Les dédicaces sont masquées par défaut
  select count(*) into v_dedicated from public.get_shared_collection(v_token) where dedicated;
  if v_dedicated <> 0 then raise exception 'ECHEC : dédicace publique par défaut'; end if; n := n + 1;

  -- 4. Interrupteur des dédicaces
  update public.profiles set share_dedications = true where id = u1;
  select count(*) into v_dedicated from public.get_shared_collection(v_token) where dedicated;
  if v_dedicated <> 1 then raise exception 'ECHEC : dédicace non signalée'; end if; n := n + 1;

  -- 5. Interrupteur des envies
  update public.profiles set share_wishes = false where id = u1;
  select count(*) into c from public.get_shared_collection(v_token) where status = 'wanted';
  if c <> 0 then raise exception 'ECHEC : envie visible alors qu''elle est masquée'; end if; n := n + 1;

  -- 6. Un jeton inconnu ne donne rien
  select count(*) into c from public.get_shared_collection('jeton-inconnu');
  if c <> 0 then raise exception 'ECHEC : jeton inconnu accepté'; end if; n := n + 1;

  -- 7. Un anonyme peut lire la vue publique
  perform set_config('role', 'anon', true);
  select count(*) into c from public.get_shared_collection(v_token);
  reset role;
  if c <> 1 then raise exception 'ECHEC : lecture anonyme (% lignes)', c; end if; n := n + 1;

  raise exception 'OK : % vérifications', n;
end;
$test$;
