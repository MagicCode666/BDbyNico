-- Test de la gouvernance du catalogue (migration 20261114).
--
-- Simule cinq utilisateurs (administrateur, modérateur, contributeur, « collection seule »,
-- tiers) et vérifie les droits, la journalisation, les propositions en attente, la validation et
-- l'annulation. Le script s'arrête TOUJOURS par une exception, ce qui annule toutes ses écritures :
-- rien ne reste en base. Le message de l'exception donne le résultat :
--   « OK : n vérifications » si tout passe, « ECHEC : ... » sinon.
--
-- Les deux fonctions d'aide sont temporaires (schéma pg_temp) : elles disparaissent avec la session.
--
-- Lancement (confirmation de l'écriture requise, car le script écrit avant d'annuler) :
--   npx supabase db query --remote --yes -f supabase/tests/gouvernance.sql

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
  adm uuid := gen_random_uuid();
  mdr uuid := gen_random_uuid();
  ctr uuid := gen_random_uuid();   -- contributeur
  rst uuid := gen_random_uuid();   -- « collection seule »
  oth uuid := gen_random_uuid();   -- tiers sans lien avec les albums
  i_c text := pg_temp._t_isbn('978990000001');
  i_r text := pg_temp._t_isbn('978990000002');
  i_s text := pg_temp._t_isbn('978990000003');
  ol_c text;
  ol_r text;
  n int := 0;
  v text;
  c bigint;
  rec record;
begin
  ol_c := format('https://covers.openlibrary.org/b/isbn/%s-L.jpg', i_c);
  ol_r := format('https://covers.openlibrary.org/b/isbn/%s-L.jpg', i_r);

  insert into auth.users (id, email, aud, role) values
    (adm, 'adm@test.invalid', 'authenticated', 'authenticated'),
    (mdr, 'mdr@test.invalid', 'authenticated', 'authenticated'),
    (ctr, 'ctr@test.invalid', 'authenticated', 'authenticated'),
    (rst, 'rst@test.invalid', 'authenticated', 'authenticated'),
    (oth, 'oth@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set role = 'moderator' where id = mdr;
  update public.profiles set contribution = 'collection_only' where id = rst;

  -- 1. Un compte ordinaire ne peut pas s'attribuer un rôle ni un niveau -----------------------
  begin
    perform pg_temp._t_as(ctr);
    update public.profiles set role = 'admin' where id = ctr;
    reset role;
    raise exception 'ECHEC : un utilisateur a pu changer son rôle';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  begin
    perform pg_temp._t_as(rst);
    update public.profiles set contribution = 'full' where id = rst;
    reset role;
    raise exception 'ECHEC : un utilisateur a pu changer son niveau';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;

  -- 2. Création d'éditions : directe pour le contributeur, en attente pour « collection seule » --
  perform pg_temp._t_as(ctr);
  perform public.add_edition(i_c, 'Album du contributeur', 'Série test gouvernance', 1);
  insert into public.collection_items (user_id, isbn, status) values (ctr, i_c, 'owned');
  reset role;
  if (select review_status from public.editions where isbn = i_c) <> 'approved' then
    raise exception 'ECHEC : l''édition du contributeur devrait être approuvée';
  end if; n := n + 1;
  if not exists (select 1 from public.catalogue_changes
                 where isbn = i_c and kind = 'create' and status = 'applied' and user_id = ctr) then
    raise exception 'ECHEC : création du contributeur non journalisée'; end if; n := n + 1;

  perform pg_temp._t_as(rst);
  perform public.add_edition(i_r, 'Album en attente', 'Série en attente', 1);
  insert into public.collection_items (user_id, isbn, status) values (rst, i_r, 'owned');
  reset role;
  if (select review_status from public.editions where isbn = i_r) <> 'pending' then
    raise exception 'ECHEC : l''édition de « collection seule » devrait être en attente'; end if;
  n := n + 1;
  if not exists (select 1 from public.catalogue_changes
                 where isbn = i_r and kind = 'create' and status = 'pending' and user_id = rst) then
    raise exception 'ECHEC : création en attente non journalisée'; end if; n := n + 1;

  -- une édition en attente n'est visible que de son auteur et des modérateurs
  perform pg_temp._t_as(oth);
  select count(*) into c from public.editions where isbn = i_r;
  reset role;
  if c <> 0 then raise exception 'ECHEC : un tiers voit une édition en attente'; end if; n := n + 1;
  perform pg_temp._t_as(ctr);
  select count(*) into c from public.editions where isbn = i_r;
  reset role;
  if c <> 0 then raise exception 'ECHEC : un contributeur voit l''édition en attente d''un autre'; end if;
  n := n + 1;
  perform pg_temp._t_as(rst);
  select count(*) into c from public.editions where isbn = i_r;
  reset role;
  if c <> 1 then raise exception 'ECHEC : l''auteur ne voit pas son édition en attente'; end if; n := n + 1;
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.editions where isbn = i_r;
  reset role;
  if c <> 1 then raise exception 'ECHEC : un modérateur ne voit pas l''édition en attente'; end if; n := n + 1;

  begin
    perform pg_temp._t_as(oth);
    perform public.add_edition(i_r, 'Autre titre');
    reset role;
    raise exception 'ECHEC : un tiers a pu utiliser une édition en attente';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;

  -- 3. Signalement de couverture ----------------------------------------------------------------
  -- un non-possesseur est refusé
  begin
    perform pg_temp._t_as(oth);
    perform public.report_cover(i_c, ol_c);
    reset role;
    raise exception 'ECHEC : un non-possesseur a pu signaler une couverture';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  -- une adresse non autorisée est refusée
  begin
    perform pg_temp._t_as(ctr);
    perform public.report_cover(i_c, 'https://exemple.invalid/x.jpg');
    reset role;
    raise exception 'ECHEC : une adresse non autorisée a été acceptée';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;

  -- un contributeur possesseur : appliqué tout de suite, verrouillé, journalisé
  update public.editions set cover_url = format('https://images-na.ssl-images-amazon.com/images/P/%s.01.LZZZZZZZ.jpg',
    public.isbn13_to_isbn10(i_c)) where isbn = i_c;
  perform pg_temp._t_as(ctr);
  v := public.report_cover(i_c, ol_c);
  reset role;
  if v <> 'applied' then raise exception 'ECHEC : signalement du contributeur non appliqué (%)', v; end if;
  n := n + 1;
  if (select cover_url from public.editions where isbn = i_c) <> ol_c
     or not (select cover_locked from public.editions where isbn = i_c) then
    raise exception 'ECHEC : couverture non remplacée ou non verrouillée'; end if; n := n + 1;
  select id into c from public.catalogue_changes
    where isbn = i_c and kind = 'cover' and status = 'applied' and user_id = ctr;
  if c is null then raise exception 'ECHEC : changement de couverture non journalisé'; end if; n := n + 1;

  -- la mise à jour automatique ne touche pas une couverture verrouillée, même vide
  perform pg_temp._t_as(ctr);
  perform public.report_cover(i_c, null);
  perform public.set_edition_cover(i_c, ol_c);
  reset role;
  if (select cover_url from public.editions where isbn = i_c) is not null then
    raise exception 'ECHEC : la mise à jour automatique a écrasé un choix manuel'; end if;
  n := n + 1;

  -- 4. « Collection seule » : la proposition de couverture attend la validation ----------------
  perform pg_temp._t_as(mdr);
  perform public.review_change(
    (select id from public.catalogue_changes where isbn = i_r and kind = 'create'), true);
  reset role;
  if (select review_status from public.editions where isbn = i_r) <> 'approved' then
    raise exception 'ECHEC : la validation n''a pas approuvé l''édition'; end if; n := n + 1;

  perform pg_temp._t_as(rst);
  v := public.report_cover(i_r, ol_r);
  reset role;
  if v <> 'pending' then raise exception 'ECHEC : la proposition aurait dû être en attente (%)', v; end if;
  n := n + 1;
  if (select cover_url from public.editions where isbn = i_r) is not null then
    raise exception 'ECHEC : une proposition en attente a modifié le catalogue'; end if; n := n + 1;
  select id into c from public.catalogue_changes
    where isbn = i_r and kind = 'cover' and status = 'pending';

  perform pg_temp._t_as(mdr);
  perform public.review_change(c, true);
  reset role;
  if (select cover_url from public.editions where isbn = i_r) <> ol_r then
    raise exception 'ECHEC : la validation n''a pas appliqué la couverture'; end if; n := n + 1;
  if (select status from public.catalogue_changes where id = c) <> 'applied' then
    raise exception 'ECHEC : statut non mis à jour après validation'; end if; n := n + 1;

  -- 5. Annulation (revert) -----------------------------------------------------------------------
  perform pg_temp._t_as(mdr);
  perform public.revert_change(c);
  reset role;
  if (select cover_url from public.editions where isbn = i_r) is not null then
    raise exception 'ECHEC : l''annulation n''a pas rétabli l''ancienne valeur'; end if; n := n + 1;
  if (select status from public.catalogue_changes where id = c) <> 'reverted' then
    raise exception 'ECHEC : statut non mis à jour après annulation'; end if; n := n + 1;
  if not exists (select 1 from public.catalogue_changes where reverts_id = c and origin = 'admin') then
    raise exception 'ECHEC : l''annulation n''est pas journalisée'; end if; n := n + 1;
  begin
    perform pg_temp._t_as(mdr);
    perform public.revert_change(c);
    reset role;
    raise exception 'ECHEC : un changement a pu être annulé deux fois';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;

  -- annulation refusée si la valeur a changé depuis
  update public.editions set cover_url = null, cover_locked = false where isbn = i_r;
  perform pg_temp._t_as(ctr);
  insert into public.collection_items (user_id, isbn, status) values (ctr, i_r, 'owned');
  perform public.report_cover(i_r, ol_r);                      -- changement appliqué (contributeur)
  reset role;
  select id into c from public.catalogue_changes
    where isbn = i_r and kind = 'cover' and status = 'applied' and user_id = ctr;
  update public.editions set cover_url = 'https://exemple.invalid/autre.jpg' where isbn = i_r;
  begin
    perform pg_temp._t_as(mdr);
    perform public.revert_change(c);
    reset role;
    raise exception 'ECHEC : annulation acceptée alors que la valeur avait changé';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;

  -- 6. Refus d'une création en attente : l'édition, la ligne de collection et la série disparaissent
  perform pg_temp._t_as(rst);
  perform public.add_edition(i_s, 'Album refusé', 'Série refusée', 1);
  insert into public.collection_items (user_id, isbn, status) values (rst, i_s, 'owned');
  reset role;
  perform pg_temp._t_as(mdr);
  perform public.review_change(
    (select id from public.catalogue_changes where isbn = i_s and kind = 'create'), false);
  reset role;
  if exists (select 1 from public.editions where isbn = i_s)
     or exists (select 1 from public.collection_items where isbn = i_s)
     or exists (select 1 from public.series where name = 'Série refusée') then
    raise exception 'ECHEC : le refus n''a pas nettoyé l''édition, la collection ou la série'; end if;
  n := n + 1;
  if (select status from public.catalogue_changes where isbn = i_s and kind = 'create') <> 'rejected' then
    raise exception 'ECHEC : création refusée non marquée comme telle'; end if; n := n + 1;

  -- 7. Droits : seuls les modérateurs valident ou annulent, seul l'administrateur gère les niveaux --
  foreach v in array array['review', 'revert', 'list', 'users', 'level'] loop
    begin
      perform pg_temp._t_as(ctr);
      if v = 'review' then perform public.review_change(c, true);
      elsif v = 'revert' then perform public.revert_change(c);
      elsif v = 'list' then perform * from public.list_catalogue_changes();
      elsif v = 'users' then perform * from public.list_users_admin();
      else perform public.set_contribution_level(rst, 'full'); end if;
      reset role;
      raise exception 'ECHEC : un utilisateur ordinaire a pu appeler % ', v;
    exception when insufficient_privilege then
      reset role; n := n + 1;
    end;
  end loop;
  begin
    perform pg_temp._t_as(mdr);
    perform public.set_contribution_level(rst, 'full');
    reset role;
    raise exception 'ECHEC : un modérateur a pu changer un niveau de contribution';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  perform pg_temp._t_as(adm);
  perform public.set_contribution_level(rst, 'full');
  perform public.set_contribution_level(rst, 'collection_only');
  select count(*) into c from public.list_users_admin();
  reset role;
  if c < 5 then raise exception 'ECHEC : la liste des utilisateurs est incomplète'; end if; n := n + 1;
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_catalogue_changes(p_status => 'applied');
  reset role;
  if c < 1 then raise exception 'ECHEC : le modérateur ne voit pas le journal'; end if; n := n + 1;

  -- 8. Lecture du journal : chacun voit ses lignes, le modérateur voit tout, un anonyme rien -------
  perform pg_temp._t_as(oth);
  select count(*) into c from public.catalogue_changes;
  reset role;
  if c <> 0 then raise exception 'ECHEC : un tiers lit le journal d''autrui'; end if; n := n + 1;
  perform pg_temp._t_as(ctr);
  select count(*) into c from public.catalogue_changes where user_id <> ctr;
  reset role;
  if c <> 0 then raise exception 'ECHEC : un utilisateur lit les lignes des autres'; end if; n := n + 1;
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.catalogue_changes;
    reset role;
    raise exception 'ECHEC : un anonyme lit le journal';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  begin
    perform set_config('role', 'anon', true);
    perform public.report_cover(i_c, ol_c);
    reset role;
    raise exception 'ECHEC : un anonyme a pu signaler une couverture';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;

  -- 8b. Les lignes des albums de test (ISBN 97899999999…) n'apparaissent pas dans le journal admin
  insert into public.catalogue_changes (user_id, origin, kind, isbn, new_value)
  values (ctr, 'user', 'cover', '9789999999995', 'https://exemple.invalid/test');
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_catalogue_changes() where isbn = '9789999999995';
  reset role;
  if c <> 0 then raise exception 'ECHEC : une ligne de test apparait dans le journal admin'; end if;
  n := n + 1;
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_catalogue_changes() where isbn = i_c;
  reset role;
  if c = 0 then raise exception 'ECHEC : le filtre masque aussi les vraies lignes'; end if;
  n := n + 1;

  -- 8c. L'import en masse conserve le tome 0 (prologue)
  perform pg_temp._t_as(ctr);
  perform public.import_editions(jsonb_build_array(jsonb_build_object(
    'isbn', pg_temp._t_isbn('978990000004'), 'title', 'Prologue', 'series', 'Série tome zéro',
    'volume', '0')));
  reset role;
  if (select volume from public.editions where isbn = pg_temp._t_isbn('978990000004')) is distinct from 0 then
    raise exception 'ECHEC : le tome 0 n''a pas été conservé par l''import'; end if;
  n := n + 1;

  -- 9. Le job (sans utilisateur) remplace une couverture : journalisé « job », annulable --------
  update public.editions set cover_url = ol_c, cover_locked = false where isbn = i_c;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.editions
  set cover_url = format('https://images-na.ssl-images-amazon.com/images/P/%s.01.LZZZZZZZ.jpg',
    public.isbn13_to_isbn10(i_c))
  where isbn = i_c;
  if not exists (select 1 from public.catalogue_changes
                 where isbn = i_c and kind = 'cover' and origin = 'job') then
    raise exception 'ECHEC : le changement du job n''est pas journalisé'; end if; n := n + 1;

  raise exception 'OK : % vérifications', n;
end;
$test$;
