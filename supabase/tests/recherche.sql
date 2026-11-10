-- Test de la recherche globale (migration 20261122).
--
-- Comme gouvernance.sql : le script s'arrête TOUJOURS par une exception (annulation de ses
-- écritures) dont le message donne le résultat, « OK : n vérifications » ou « ECHEC : ... ».
--   npx supabase db query --remote --yes -f supabase/tests/recherche.sql

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
  s_cre uuid;
  s_blk uuid;
  i_blk1 text := pg_temp._t_isbn('978991000001');
  i_blk2 text := pg_temp._t_isbn('978991000002');
  i_cre1 text := pg_temp._t_isbn('978991000003');
  i_solo text := pg_temp._t_isbn('978991000004');
  i_secret text := pg_temp._t_isbn('978991000005');
  n int := 0;
  c int;
  v text;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated'),
    (u2, 'u2@test.invalid', 'authenticated', 'authenticated');

  insert into public.series (name) values ('Le Crépuscule des Dieux') returning id into s_cre;
  insert into public.series (name) values ('Black Op') returning id into s_blk;
  insert into public.editions (isbn, title, series_id, volume, authors, source, created_by) values
    (i_blk1, 'Deux agents', s_blk, 1, array['Stephen Desberg', 'Hector Labiano'], 'manual', u1),
    (i_blk2, 'Le piège russe', s_blk, 2, array['Stephen Desberg', 'Hector Labiano'], 'manual', u1),
    (i_cre1, 'La Malédiction des Nibelungen', s_cre, 1, array['Nicolas Jarry'], 'manual', u1),
    (i_solo, 'Album seul 100% pur_jus', null, null, array['Quelqu''un'], 'manual', u1);
  insert into public.editions (isbn, title, authors, source, created_by, review_status)
    values (i_secret, 'Album secret', array['Anonyme'], 'manual', u2, 'pending');
  insert into public.collection_items (user_id, isbn, status) values
    (u1, i_blk1, 'owned'), (u2, i_blk2, 'wanted');

  -- 1. Accents et casse ignorés, séries trouvées par leur nom
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('crepuscule') where kind = 'serie' and ref = s_cre::text;
  reset role;
  if c <> 1 then raise exception 'ECHEC : « crepuscule » (sans accent) ne trouve pas la série'; end if; n := n + 1;
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('CRÉPUSCULE dieux') where kind = 'serie' and ref = s_cre::text;
  reset role;
  if c <> 1 then raise exception 'ECHEC : deux mots avec accent et majuscules ne trouvent pas la série'; end if; n := n + 1;

  -- 2. Tous les mots doivent se retrouver, titre et série ensemble
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('black agents') where kind = 'album' and ref = i_blk1;
  reset role;
  if c <> 1 then raise exception 'ECHEC : « black agents » (série + titre) ne trouve pas l''album'; end if; n := n + 1;
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('black nibelungen') where kind in ('album', 'serie');
  reset role;
  if c <> 0 then raise exception 'ECHEC : un mot absent ne devrait rien renvoyer'; end if; n := n + 1;

  -- 3. Auteurs
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('labiano') where kind = 'auteur' and label = 'Hector Labiano';
  reset role;
  if c <> 1 then raise exception 'ECHEC : l''auteur n''est pas trouvé'; end if; n := n + 1;
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('labiano') where kind = 'album';
  reset role;
  if c <> 2 then raise exception 'ECHEC : les albums de l''auteur ne sont pas trouvés (%)', c; end if; n := n + 1;

  -- 4. ISBN exact, avec tirets
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue(
    substr(i_blk2, 1, 3) || '-' || substr(i_blk2, 4)) where kind = 'album' and ref = i_blk2;
  reset role;
  if c <> 1 then raise exception 'ECHEC : l''ISBN avec tiret ne trouve pas l''album'; end if; n := n + 1;

  -- 5. Requêtes vides ou trop courtes
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('a');
  select count(*) + c into c from public.search_catalogue('');
  select count(*) + c into c from public.search_catalogue(null);
  select count(*) + c into c from public.search_catalogue('   ');
  reset role;
  if c <> 0 then raise exception 'ECHEC : une requête vide ou d''un caractère renvoie des résultats'; end if; n := n + 1;

  -- 6. Les caractères « % » et « _ » sont ordinaires, pas des jokers
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('%%');
  select count(*) + c into c from public.search_catalogue('__');
  select count(*) + c into c from public.search_catalogue('b_ack');
  reset role;
  if c <> 0 then raise exception 'ECHEC : « % » ou « _ » servent de jokers (%)', '%', c; end if; n := n + 1;
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('100% pur_jus') where kind = 'album' and ref = i_solo;
  reset role;
  if c <> 1 then raise exception 'ECHEC : « %% » et « _ » littéraux ne sont pas retrouvés'; end if; n := n + 1;

  -- 7. Limite par type
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('desberg', 1) where kind = 'album';
  reset role;
  if c <> 1 then raise exception 'ECHEC : la limite par type n''est pas respectée (%)', c; end if; n := n + 1;

  -- 8. Un album en attente n'est visible que de son auteur
  perform pg_temp._t_as(u1);
  select count(*) into c from public.search_catalogue('secret');
  reset role;
  if c <> 0 then raise exception 'ECHEC : un album en attente d''un autre est trouvé'; end if; n := n + 1;
  perform pg_temp._t_as(u2);
  select count(*) into c from public.search_catalogue('secret') where kind = 'album' and ref = i_secret;
  reset role;
  if c <> 1 then raise exception 'ECHEC : l''auteur ne retrouve pas son album en attente'; end if; n := n + 1;

  -- 9. Le statut ne vient que de sa propre collection
  perform pg_temp._t_as(u1);
  select my_status into v from public.search_catalogue('deux agents') where kind = 'album' and ref = i_blk1;
  reset role;
  if v is distinct from 'owned' then raise exception 'ECHEC : mon album possédé n''est pas marqué (%)', v; end if; n := n + 1;
  perform pg_temp._t_as(u1);
  select my_status into v from public.search_catalogue('piege russe') where kind = 'album' and ref = i_blk2;
  reset role;
  if v is not null then raise exception 'ECHEC : le statut d''un autre utilisateur fuit (%)', v; end if; n := n + 1;
  perform pg_temp._t_as(u2);
  select my_status into v from public.search_catalogue('piege russe') where kind = 'album' and ref = i_blk2;
  reset role;
  if v is distinct from 'wanted' then raise exception 'ECHEC : mon album en envie n''est pas marqué (%)', v; end if; n := n + 1;
  perform pg_temp._t_as(u2);
  select my_status into v from public.search_catalogue('deux agents') where kind = 'album' and ref = i_blk1;
  reset role;
  if v is not null then raise exception 'ECHEC : la collection de u1 est visible de u2 (%)', v; end if; n := n + 1;

  -- 10. Résumé de série : nombre d'albums et mes albums possédés
  perform pg_temp._t_as(u1);
  select detail into v from public.search_catalogue('black op') where kind = 'serie' and ref = s_blk::text;
  reset role;
  if v is distinct from '2 album(s) · 1 possédé(s)' then raise exception 'ECHEC : résumé de série inattendu (%)', v; end if; n := n + 1;

  -- 11. Un anonyme ne peut pas chercher
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.search_catalogue('black');
    reset role;
    raise exception 'ECHEC : un anonyme a pu lancer une recherche';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
