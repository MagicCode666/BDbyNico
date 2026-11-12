-- Test des amis (migration 20261132) : demandes, acceptation, refus, lien d'invitation, partage
-- par ami, accès aux bibliothèques, absence d'accès direct aux tables.
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/amis.sql

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
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  i1 text := pg_temp._t_isbn('978996000001');
  i2 text := pg_temp._t_isbn('978996000002');
  tok_a text;
  tok_b text;
  c int;
  r record;
  v text;
  n int := 0;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (ua, 'fa@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Alice"}'),
    (ub, 'fb@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Bruno"}'),
    (uc, 'fc@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Chloé"}'),
    (ud, 'fd@test.invalid', 'authenticated', 'authenticated', '{"pseudo": "Denis"}');
  insert into public.editions (isbn, title, authors, source) values
    (i1, 'Album un', array['X'], 'manual'), (i2, 'Album deux', array['X'], 'manual');
  insert into public.collection_items (user_id, isbn, status) values
    (ub, i1, 'owned'), (ub, i2, 'wanted'), (ua, i1, 'owned');
  select invite_token into tok_a from public.profiles where id = ua;
  select share_token into tok_b from public.profiles where id = ub;

  -- 1. Demande par pseudo exact (casse et accents ignorés) ; l'autre la voit, avec une pastille
  perform pg_temp._t_as(ua);
  perform public.send_friend_request('  bRUNO ');
  reset role;
  perform pg_temp._t_as(ub);
  select count(*) into c from public.list_friend_requests() where direction = 'in' and pseudo = 'Alice';
  if c <> 1 then raise exception 'ECHEC : demande non reçue'; end if; n := n + 1;
  if public.count_incoming_friend_requests() <> 1 then
    raise exception 'ECHEC : compteur de demandes'; end if; n := n + 1;
  reset role;
  perform pg_temp._t_as(ua);
  select count(*) into c from public.list_friend_requests() where direction = 'out' and pseudo = 'Bruno';
  if c <> 1 then raise exception 'ECHEC : demande envoyée non listée'; end if; n := n + 1;

  -- 2. Pseudo inconnu ou soi-même : aucune erreur, aucune demande (rien ne révèle qui est inscrit)
  perform public.send_friend_request('Personne');
  perform public.send_friend_request('alice');
  reset role;
  if (select count(*) from public.friendships) <> 1 then
    raise exception 'ECHEC : demande fantôme'; end if; n := n + 1;

  -- 3. Tant que la demande n'est pas acceptée, aucune bibliothèque n'est lisible
  perform pg_temp._t_as(ua);
  select count(*) into c from public.get_friend_collection(ub);
  reset role;
  if c <> 0 then raise exception 'ECHEC : bibliothèque lisible avant acceptation'; end if; n := n + 1;

  -- 4. Acceptation : chacun voit l'autre ; Alice lit la bibliothèque de Bruno (possédés et envies)
  perform pg_temp._t_as(ub);
  perform public.respond_friend_request(ua, true);
  select count(*) into c from public.list_friends() where friend_id = ua and i_share and they_share;
  reset role;
  if c <> 1 then raise exception 'ECHEC : ami non listé côté Bruno'; end if; n := n + 1;
  perform pg_temp._t_as(ua);
  select count(*) into c from public.list_friends() where friend_id = ub and pseudo = 'Bruno';
  if c <> 1 then raise exception 'ECHEC : ami non listé côté Alice'; end if; n := n + 1;
  select count(*) into c from public.get_friend_collection(ub);
  if c <> 2 then raise exception 'ECHEC : 2 lignes attendues, %', c; end if; n := n + 1;
  select count(*) into c from public.get_friend_collection(ub) where dedicated;
  reset role;
  if c <> 0 then raise exception 'ECHEC : dédicace exposée par défaut'; end if; n := n + 1;

  -- 5. Bruno coupe le partage pour Alice : elle ne voit plus rien, lui voit toujours Alice
  perform pg_temp._t_as(ub);
  perform public.set_friend_sharing(ua, false);
  select count(*) into c from public.get_friend_collection(ua);
  reset role;
  if c <> 1 then raise exception 'ECHEC : Bruno ne voit plus Alice'; end if; n := n + 1;
  perform pg_temp._t_as(ua);
  select count(*) into c from public.get_friend_collection(ub);
  if c <> 0 then raise exception 'ECHEC : partage coupé mais lisible'; end if; n := n + 1;
  select count(*) into c from public.list_friends() where friend_id = ub and not they_share and i_share;
  reset role;
  if c <> 1 then raise exception 'ECHEC : état du partage mal rapporté'; end if; n := n + 1;
  -- Les envies masquées par les réglages du profil le restent pour les amis
  perform pg_temp._t_as(ub);
  perform public.set_friend_sharing(ua, true);
  reset role;
  update public.profiles set share_wishes = false where id = ub;
  perform pg_temp._t_as(ua);
  select count(*) into c from public.get_friend_collection(ub);
  reset role;
  if c <> 1 then raise exception 'ECHEC : envies exposées malgré le réglage'; end if; n := n + 1;
  update public.profiles set share_wishes = true where id = ub;

  -- 6. Un non-ami ne voit rien ; un anonyme n'a pas le droit d'appeler ces fonctions
  perform pg_temp._t_as(uc);
  select count(*) into c from public.get_friend_collection(ub);
  reset role;
  if c <> 0 then raise exception 'ECHEC : un non-ami lit une bibliothèque'; end if; n := n + 1;
  begin
    set local role anon;
    perform * from public.get_friend_collection(ub);
    reset role;
    raise exception 'ECHEC : un anonyme appelle get_friend_collection';
  exception when insufficient_privilege then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(uc);
    perform * from public.friendships;
    reset role;
    raise exception 'ECHEC : lecture directe de friendships';
  exception when insufficient_privilege then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(uc);
    perform public.collection_rows(ub);
    reset role;
    raise exception 'ECHEC : collection_rows appelable directement';
  exception when insufficient_privilege then reset role; n := n + 1; end;

  -- 7. Refus : le demandeur croit sa demande en attente ; l'autre n'est pas visible pour lui
  perform pg_temp._t_as(uc);
  perform public.send_friend_request('alice');
  reset role;
  perform pg_temp._t_as(ua);
  perform public.respond_friend_request(uc, false);
  if public.count_incoming_friend_requests() <> 0 then
    raise exception 'ECHEC : demande refusée encore comptée'; end if; n := n + 1;
  reset role;
  perform pg_temp._t_as(uc);
  select count(*) into c from public.list_friend_requests() where direction = 'out';
  if c <> 1 then raise exception 'ECHEC : refus visible du demandeur'; end if; n := n + 1;
  select count(*) into c from public.get_friend_collection(ua);
  reset role;
  if c <> 0 then raise exception 'ECHEC : bibliothèque lisible après refus'; end if; n := n + 1;
  -- Alice, qui avait refusé, redemande à Chloé : l'amitié se conclut
  perform pg_temp._t_as(ua);
  perform public.send_friend_request('chloé');
  select count(*) into c from public.list_friends() where friend_id = uc;
  reset role;
  if c <> 1 then raise exception 'ECHEC : redemande après refus sans effet'; end if; n := n + 1;

  -- 8. Lien d'invitation : amitié immédiate ; lien invalide ou personnel refusé
  perform pg_temp._t_as(ud);
  select public.accept_friend_invite(tok_a) into v;
  if v <> 'Alice' then raise exception 'ECHEC : pseudo de l''invitant (%)', v; end if; n := n + 1;
  select count(*) into c from public.get_friend_collection(ua);
  if c <> 1 then raise exception 'ECHEC : bibliothèque illisible après invitation'; end if; n := n + 1;
  begin
    perform public.accept_friend_invite('nimportequoi');
    reset role;
    raise exception 'ECHEC : lien invalide accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  begin
    perform pg_temp._t_as(ua);
    perform public.accept_friend_invite(tok_a);
    reset role;
    raise exception 'ECHEC : son propre lien accepté';
  exception when invalid_parameter_value then reset role; n := n + 1; end;
  -- Régénérer le lien invalide l'ancien
  perform pg_temp._t_as(ua);
  perform public.regenerate_invite_token();
  reset role;
  begin
    perform pg_temp._t_as(uc);
    perform public.accept_friend_invite(tok_a);
    reset role;
    raise exception 'ECHEC : ancien lien encore valide';
  exception when invalid_parameter_value then reset role; n := n + 1; end;

  -- 9. Retirer un ami coupe tout dans les deux sens
  perform pg_temp._t_as(ub);
  perform public.remove_friend(ua);
  select count(*) into c from public.list_friends() where friend_id = ua;
  reset role;
  if c <> 0 then raise exception 'ECHEC : ami non retiré'; end if; n := n + 1;
  perform pg_temp._t_as(ua);
  select count(*) into c from public.get_friend_collection(ub);
  reset role;
  if c <> 0 then raise exception 'ECHEC : bibliothèque lisible après retrait'; end if; n := n + 1;

  -- 10. Le lien public par jeton fonctionne toujours (même requête que pour les amis)
  update public.profiles set share_enabled = true where id = ub;
  set local role anon;
  select count(*) into c from public.get_shared_collection(tok_b);
  reset role;
  if c <> 2 then raise exception 'ECHEC : lien public, % lignes', c; end if; n := n + 1;
  update public.profiles set share_enabled = false where id = ub;
  set local role anon;
  select count(*) into c from public.get_shared_collection(tok_b);
  reset role;
  if c <> 0 then raise exception 'ECHEC : lien public désactivé mais lisible'; end if; n := n + 1;

  -- 11. Limite de 20 demandes par jour
  insert into auth.users (id, email, aud, role)
  select gen_random_uuid(), 'x' || g || '@test.invalid', 'authenticated', 'authenticated'
  from generate_series(1, 20) g;
  insert into public.friendships (requester, addressee)
  select ud, id from public.profiles where id not in (ud, ua) order by pseudo limit 20;
  begin
    perform pg_temp._t_as(ud);
    perform public.send_friend_request('Bruno');
    reset role;
    raise exception 'ECHEC : limite de demandes non appliquée';
  exception when program_limit_exceeded then reset role; n := n + 1; end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
