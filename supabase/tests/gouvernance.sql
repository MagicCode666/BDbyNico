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
  s_a uuid;
  s_b uuid;
  ch bigint;
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

  -- 8d. Adresses de couverture autorisées : Decitre et AbeBooks, pour le bon ISBN seulement
  if not public.is_allowed_cover_url(i_c, format('https://products-images.di-static.com/image/x/%s-475x500-1.jpg', i_c))
     or not public.is_allowed_cover_url(i_c, format('https://pictures.abebooks.com/isbn/%s-fr-300.jpg', i_c)) then
    raise exception 'ECHEC : une adresse de libraire valide est refusée'; end if;
  n := n + 1;
  if public.is_allowed_cover_url(i_c, format('https://products-images.di-static.com/image/x/%s-475x500-1.jpg', i_r))
     or public.is_allowed_cover_url(i_c, format('https://pictures.abebooks.com/isbn/%s-fr-300.jpg', i_r))
     or public.is_allowed_cover_url(i_c, format('https://exemple.invalid/isbn/%s-fr-300.jpg', i_c)) then
    raise exception 'ECHEC : une adresse de libraire pour un autre ISBN ou un autre site est acceptée'; end if;
  n := n + 1;

  -- 8e. Outils de série pour les modérateurs : droits, renommage, total, statut, annulation ---------
  select series_id into s_a from public.editions where isbn = i_c;
  perform pg_temp._t_as(ctr);
  perform public.add_edition(pg_temp._t_isbn('978990000005'), 'Album série B', 'Série B gouvernance', 1);
  reset role;
  select series_id into s_b from public.editions where isbn = pg_temp._t_isbn('978990000005');

  -- un utilisateur ordinaire ne peut rien faire sur les séries
  foreach v in array array['rename', 'total', 'status', 'list'] loop
    begin
      perform pg_temp._t_as(ctr);
      if v = 'rename' then perform public.rename_series(s_a, 'Pirate');
      elsif v = 'total' then perform public.set_series_total(s_a, 99);
      elsif v = 'status' then perform public.set_series_status(s_a, 'finished');
      else perform * from public.list_series_admin('serie'); end if;
      reset role;
      raise exception 'ECHEC : un utilisateur ordinaire a pu appeler % sur les séries', v;
    exception when insufficient_privilege then
      reset role; n := n + 1;
    end;
  end loop;

  -- renommage : nom nettoyé, journalisé, collision refusée
  perform pg_temp._t_as(mdr);
  perform public.rename_series(s_a, '  Nom corrigé par modérateur ');
  reset role;
  if (select name from public.series where id = s_a) <> 'Nom corrigé par modérateur' then
    raise exception 'ECHEC : la série n''a pas été renommée'; end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where series_id = s_a and kind = 'series_name' and status = 'applied' and user_id = mdr;
  if ch is null then raise exception 'ECHEC : le renommage n''est pas journalisé'; end if;
  n := n + 1;
  begin
    perform pg_temp._t_as(mdr);
    perform public.rename_series(s_b, 'NOM CORRIGE PAR MODERATEUR');
    reset role;
    raise exception 'ECHEC : un nom déjà pris (casse et accents ignorés) a été accepté';
  exception when unique_violation then
    reset role; n := n + 1;
  end;

  -- annulation du renommage
  perform pg_temp._t_as(mdr);
  perform public.revert_change(ch);
  reset role;
  if (select name from public.series where id = s_a) <> 'Série test gouvernance' then
    raise exception 'ECHEC : l''annulation du renommage n''a pas rétabli le nom'; end if;
  n := n + 1;
  if not exists (select 1 from public.catalogue_changes where reverts_id = ch and kind = 'series_name') then
    raise exception 'ECHEC : l''annulation du renommage n''est pas journalisée'; end if;
  n := n + 1;

  -- total partagé : valeur manuelle puis retour au job
  perform pg_temp._t_as(mdr);
  perform public.set_series_total(s_a, 9);
  reset role;
  if (select total_volumes || ':' || total_source from public.series where id = s_a) <> '9:manual' then
    raise exception 'ECHEC : le total manuel n''est pas enregistré'; end if;
  n := n + 1;
  begin
    perform pg_temp._t_as(mdr);
    perform public.set_series_total(s_a, 1000);
    reset role;
    raise exception 'ECHEC : un total de 1000 a été accepté';
  exception when invalid_parameter_value then
    reset role; n := n + 1;
  end;
  perform pg_temp._t_as(mdr);
  perform public.set_series_total(s_a, null);
  reset role;
  if (select total_volumes || ':' || total_source from public.series where id = s_a) <> '9:auto' then
    raise exception 'ECHEC : le retour au job a modifié le total ou la source'; end if;
  n := n + 1;

  -- statut partagé : fixé à la main, rendu au job, annulations dans l'ordre
  perform pg_temp._t_as(mdr);
  perform public.set_series_status(s_a, 'finished');
  reset role;
  if (select publication_status || ':' || status_source from public.series where id = s_a) <> 'finished:manual' then
    raise exception 'ECHEC : le statut manuel n''est pas enregistré'; end if;
  n := n + 1;
  begin
    perform pg_temp._t_as(mdr);
    perform public.set_series_status(s_a, 'invalide');
    reset role;
    raise exception 'ECHEC : un statut invalide a été accepté';
  exception when invalid_parameter_value then
    reset role; n := n + 1;
  end;
  perform pg_temp._t_as(mdr);
  perform public.set_series_status(s_a, null);
  reset role;
  if (select publication_status || ':' || status_source from public.series where id = s_a) <> 'finished:auto' then
    raise exception 'ECHEC : le retour au job a modifié le statut ou la source'; end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where series_id = s_a and kind = 'series_status' and status = 'applied'
      and new_value = 'auto:finished';
  perform pg_temp._t_as(mdr);
  perform public.revert_change(ch);
  reset role;
  if (select publication_status || ':' || status_source from public.series where id = s_a) <> 'finished:manual' then
    raise exception 'ECHEC : l''annulation n''a pas rétabli le statut manuel'; end if;
  n := n + 1;
  -- le total a été modifié par un autre changement : l'annulation d'un changement périmé est refusée
  select id into ch from public.catalogue_changes
    where series_id = s_a and kind = 'series_total' and new_value = 'manual:9';
  begin
    perform pg_temp._t_as(mdr);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : annulation acceptée alors que le total avait changé depuis';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;

  -- journal et recherche de séries pour l'administration
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_catalogue_changes(p_status => 'applied')
    where kind like 'series\_%' and series_id is not null and series_name is not null;
  reset role;
  if c < 3 then raise exception 'ECHEC : le journal n''affiche pas les changements de série'; end if;
  n := n + 1;
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_series_admin('serie b GOUVERNANCE');
  reset role;
  if c <> 1 then raise exception 'ECHEC : la recherche de séries (casse et accents ignorés) est fausse (%)', c; end if;
  n := n + 1;

  -- 8f. Intégrales et hors-séries : type d'album et plage de tomes ---------------------------------
  -- un non-possesseur est refusé
  begin
    perform pg_temp._t_as(oth);
    perform public.set_edition_kind(i_c, 'integral', 1, 3);
    reset role;
    raise exception 'ECHEC : un non-possesseur a pu changer le type d''un album';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  -- type inconnu, plage inversée ou incomplète : refusés
  foreach v in array array['kind', 'inverted', 'half'] loop
    begin
      perform pg_temp._t_as(ctr);
      if v = 'kind' then perform public.set_edition_kind(i_c, 'coffret', null, null);
      elsif v = 'inverted' then perform public.set_edition_kind(i_c, 'integral', 3, 1);
      else perform public.set_edition_kind(i_c, 'integral', 2, null); end if;
      reset role;
      raise exception 'ECHEC : une valeur invalide (%) a été acceptée', v;
    exception when invalid_parameter_value then
      reset role; n := n + 1;
    end;
  end loop;

  -- un possesseur déclare une intégrale des tomes 1 à 3 : appliqué, journalisé
  perform pg_temp._t_as(ctr);
  v := public.set_edition_kind(i_c, 'integral', 1, 3);
  reset role;
  if v <> 'applied' then raise exception 'ECHEC : le type de l''album n''a pas été appliqué (%)', v; end if;
  n := n + 1;
  if (select kind || ':' || volume_from || '-' || volume_to from public.editions where isbn = i_c) <> 'integral:1-3' then
    raise exception 'ECHEC : type ou plage non enregistrés'; end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = i_c and kind = 'edition_kind' and status = 'applied'
      and old_value = 'album:' and new_value = 'integral:1-3';
  if ch is null then raise exception 'ECHEC : le changement de type n''est pas journalisé'; end if;
  n := n + 1;
  perform pg_temp._t_as(ctr);
  v := public.set_edition_kind(i_c, 'integral', 1, 3);
  reset role;
  if v <> 'unchanged' then raise exception 'ECHEC : un changement identique devrait être « unchanged » (%)', v; end if;
  n := n + 1;

  -- une plage sur un album ordinaire est ignorée ; la contrainte protège aussi les écritures directes
  perform pg_temp._t_as(ctr);
  perform public.set_edition_kind(i_c, 'special', 1, 3);
  reset role;
  if (select kind || ':' || coalesce(volume_from::text, 'null') from public.editions where isbn = i_c) <> 'special:null' then
    raise exception 'ECHEC : la plage d''un hors-série n''a pas été ignorée'; end if;
  n := n + 1;
  begin
    update public.editions set kind = 'album', volume_from = 1, volume_to = 2 where isbn = i_c;
    raise exception 'ECHEC : une plage sur un album ordinaire a été acceptée par la contrainte';
  exception when check_violation then
    n := n + 1;
  end;
  perform pg_temp._t_as(ctr);
  perform public.set_edition_kind(i_c, 'integral', 1, 3);
  reset role;

  -- annulation : refusée si le type a changé depuis, sinon rétablit l'ancienne valeur
  select id into ch from public.catalogue_changes
    where isbn = i_c and kind = 'edition_kind' and status = 'applied'
      and old_value = 'integral:1-3' and new_value = 'special:';
  begin
    perform pg_temp._t_as(mdr);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : annulation acceptée alors que le type avait changé depuis';
  exception when others then
    reset role;
    if sqlerrm like 'ECHEC%' then raise; end if;
    n := n + 1;
  end;
  select id into ch from public.catalogue_changes
    where isbn = i_c and kind = 'edition_kind' and status = 'applied' and new_value = 'integral:1-3'
    order by id desc limit 1;
  perform pg_temp._t_as(mdr);
  perform public.revert_change(ch);
  reset role;
  if (select kind from public.editions where isbn = i_c) <> 'special' then
    raise exception 'ECHEC : l''annulation n''a pas rétabli le type précédent'; end if;
  n := n + 1;
  perform pg_temp._t_as(ctr);
  perform public.set_edition_kind(i_c, 'album', null, null);
  reset role;

  -- « collection seule » : la proposition de type attend la validation
  perform pg_temp._t_as(rst);
  v := public.set_edition_kind(i_r, 'integral', 1, 2);
  reset role;
  if v <> 'pending' then raise exception 'ECHEC : le type proposé aurait dû être en attente (%)', v; end if;
  n := n + 1;
  if (select kind from public.editions where isbn = i_r) <> 'album' then
    raise exception 'ECHEC : une proposition de type en attente a modifié le catalogue'; end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = i_r and kind = 'edition_kind' and status = 'pending';
  perform pg_temp._t_as(mdr);
  perform public.review_change(ch, true);
  reset role;
  if (select kind || ':' || volume_from || '-' || volume_to from public.editions where isbn = i_r) <> 'integral:1-2' then
    raise exception 'ECHEC : la validation n''a pas appliqué le type'; end if;
  n := n + 1;
  perform pg_temp._t_as(mdr);
  perform public.revert_change(ch);
  reset role;
  if (select kind from public.editions where isbn = i_r) <> 'album' then
    raise exception 'ECHEC : l''annulation du type validé n''a pas rétabli l''album'; end if;
  n := n + 1;
  -- refus d'une proposition : le catalogue ne bouge pas
  perform pg_temp._t_as(rst);
  perform public.set_edition_kind(i_r, 'special', null, null);
  reset role;
  select id into ch from public.catalogue_changes
    where isbn = i_r and kind = 'edition_kind' and status = 'pending';
  perform pg_temp._t_as(mdr);
  perform public.review_change(ch, false);
  reset role;
  if (select kind from public.editions where isbn = i_r) <> 'album'
     or (select status from public.catalogue_changes where id = ch) <> 'rejected' then
    raise exception 'ECHEC : le refus d''un type proposé est incorrect'; end if;
  n := n + 1;

  -- le journal d'administration affiche les changements de type
  perform pg_temp._t_as(mdr);
  select count(*) into c from public.list_catalogue_changes(p_status => 'applied') where kind = 'edition_kind';
  reset role;
  if c < 1 then raise exception 'ECHEC : le journal n''affiche pas les changements de type'; end if;
  n := n + 1;

  -- import : type et plage lus, valeurs invalides ramenées à un album ordinaire ou sans plage
  perform pg_temp._t_as(ctr);
  perform public.import_editions(jsonb_build_array(
    jsonb_build_object('isbn', pg_temp._t_isbn('978990000006'), 'title', 'Intégrale 1-3', 'kind', 'integral',
                       'volume_from', '1', 'volume_to', '3'),
    jsonb_build_object('isbn', pg_temp._t_isbn('978990000007'), 'title', 'Intégrale mal formée', 'kind', 'integral',
                       'volume_from', '3', 'volume_to', '1'),
    jsonb_build_object('isbn', pg_temp._t_isbn('978990000008'), 'title', 'Hors-série', 'kind', 'special'),
    jsonb_build_object('isbn', pg_temp._t_isbn('978990000009'), 'title', 'Type inconnu', 'kind', 'coffret')));
  reset role;
  if (select kind || ':' || volume_from || '-' || volume_to from public.editions where isbn = pg_temp._t_isbn('978990000006')) <> 'integral:1-3'
     or (select kind || ':' || coalesce(volume_from::text, 'null') from public.editions where isbn = pg_temp._t_isbn('978990000007')) <> 'integral:null'
     or (select kind from public.editions where isbn = pg_temp._t_isbn('978990000008')) <> 'special'
     or (select kind from public.editions where isbn = pg_temp._t_isbn('978990000009')) <> 'album' then
    raise exception 'ECHEC : l''import ne lit pas correctement le type et la plage'; end if;
  n := n + 1;

  -- 8f-bis. Le créateur d'un album qui ne le possède pas n'a aucun droit de plus qu'un autre ----------
  -- (ctr a créé cet album par import sans l'ajouter à sa collection)
  begin
    perform pg_temp._t_as(ctr);
    perform public.set_edition_kind(pg_temp._t_isbn('978990000006'), 'album', null, null);
    reset role;
    raise exception 'ECHEC : le créateur non possesseur a pu changer le type d''un album';
  exception when insufficient_privilege then
    reset role; n := n + 1;
  end;
  -- dès qu'il le possède, il le peut
  perform pg_temp._t_as(ctr);
  insert into public.collection_items (user_id, isbn, status)
    values (ctr, pg_temp._t_isbn('978990000006'), 'owned');
  v := public.set_edition_kind(pg_temp._t_isbn('978990000006'), 'album', null, null);
  reset role;
  if v <> 'applied' then
    raise exception 'ECHEC : le possesseur n''a pas pu changer le type (%)', v; end if;
  n := n + 1;
  delete from public.collection_items where isbn = pg_temp._t_isbn('978990000006');

  -- 8g. Tome 0 : la série le mémorise tant que le catalogue en connaît un (album approuvé) ----------
  if not (select starts_at_zero from public.series where name = 'Série tome zéro') then
    raise exception 'ECHEC : une série avec un tome 0 n''est pas marquée'; end if;
  n := n + 1;
  if (select starts_at_zero from public.series where id = s_a) then
    raise exception 'ECHEC : une série sans tome 0 est marquée'; end if;
  n := n + 1;

  -- un tome 0 en attente (utilisateur « collection seule ») ne compte pas avant validation
  perform pg_temp._t_as(rst);
  perform public.add_edition(pg_temp._t_isbn('978990000010'), 'Prologue en attente', 'Série zéro en attente', 0);
  reset role;
  if (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : un tome 0 en attente compte déjà dans la série'; end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where isbn = pg_temp._t_isbn('978990000010') and kind = 'create' and status = 'pending';
  perform pg_temp._t_as(mdr);
  perform public.review_change(ch, true);
  reset role;
  if not (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : la validation du tome 0 ne marque pas la série'; end if;
  n := n + 1;

  -- une intégrale, ou un tome 0 qui change de numéro, ne compte plus
  update public.editions set kind = 'integral' where isbn = pg_temp._t_isbn('978990000010');
  if (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : une intégrale compte comme tome 0'; end if;
  n := n + 1;
  update public.editions set kind = 'album', volume = 1 where isbn = pg_temp._t_isbn('978990000010');
  if (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : un tome renuméroté compte encore comme tome 0'; end if;
  n := n + 1;
  update public.editions set volume = 0 where isbn = pg_temp._t_isbn('978990000010');
  if not (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : le retour au tome 0 ne marque pas la série'; end if;
  n := n + 1;
  delete from public.collection_items where isbn = pg_temp._t_isbn('978990000010');
  delete from public.editions where isbn = pg_temp._t_isbn('978990000010');
  if (select starts_at_zero from public.series where name = 'Série zéro en attente') then
    raise exception 'ECHEC : la suppression du tome 0 ne démarque pas la série'; end if;
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
