-- Intégrales, coffrets et hors-séries : un album n'est pas toujours un tome de la série.
--
-- Une intégrale est un objet distinct des tomes qu'elle reprend : elle n'occupe aucune case de la
-- grille des tomes et ne compte pas comme leur possession. Elle peut couvrir une plage de tomes
-- (« tomes 1 à 3 », intégrales partielles) ou toute la série (plage vide). Chacun exclut pour lui
-- les tomes unitaires qu'il ne veut pas posséder (réglage personnel déjà existant).
--
-- Le type se règle par import (champ « Type » de Bubble), à la saisie, ou sur la fiche de l'album
-- par un possesseur : changement partagé, journalisé et annulable (en attente pour un utilisateur
-- « collection seule »).

alter table public.editions
  add column kind text not null default 'album'
    check (kind in ('album', 'integral', 'special')),
  add column volume_from int check (volume_from between 0 and 999),
  add column volume_to int check (volume_to between 0 and 999),
  add constraint editions_range_check check (
    (volume_from is null and volume_to is null)
    or (kind = 'integral' and volume_from is not null and volume_to is not null
        and volume_from <= volume_to)
  );

comment on column public.editions.kind is
  'album : tome ordinaire ; integral : recueil de plusieurs tomes ; special : hors-série';
comment on column public.editions.volume_from is
  'Intégrale : premier tome repris (null avec volume_to : toute la série)';

-- Le journal accepte les changements de type d'album
alter table public.catalogue_changes
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check
    check (kind in ('create', 'cover', 'edition_kind', 'series_name', 'series_total', 'series_status')),
  drop constraint catalogue_changes_target_check,
  add constraint catalogue_changes_target_check check (
    (kind in ('create', 'cover', 'edition_kind') and isbn is not null)
    or (kind like 'series\_%' and series_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Changer le type d'un album (et la plage de tomes d'une intégrale)
--   - seul un possesseur de l'album (ou un modérateur) peut le faire ;
--   - utilisateur « collection seule » : la proposition est mise en attente ;
--   - valeur journalisée sous la forme « type:de-à » (ex. « integral:1-3 », « album: »).
-- Renvoie 'applied', 'pending' ou 'unchanged'.
-- ---------------------------------------------------------------------------

create or replace function public.set_edition_kind(
  p_isbn text,
  p_kind text,
  p_from int default null,
  p_to int default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
  v_moderator boolean;
  v_from int := p_from;
  v_to int := p_to;
  v_old text;
  v_new text;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  v_moderator := public.is_moderator();

  if p_kind not in ('album', 'integral', 'special') then
    raise exception 'Type d''album invalide' using errcode = '22023';
  end if;
  if p_kind <> 'integral' then
    v_from := null;
    v_to := null;
  elsif (v_from is null) <> (v_to is null)
        or v_from not between 0 and 999 or v_to not between 0 and 999
        or v_from > v_to then
    raise exception 'Plage de tomes invalide' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where isbn = p_isbn;
  if not found
     or (v_edition.review_status = 'pending'
         and v_edition.created_by is distinct from v_uid
         and not v_moderator) then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;

  if not v_moderator
     and v_edition.created_by is distinct from v_uid
     and not exists (
       select 1 from public.collection_items where user_id = v_uid and isbn = p_isbn
     ) then
    raise exception 'Seuls les possesseurs de cet album peuvent changer son type'
      using errcode = '42501';
  end if;

  v_old := v_edition.kind || ':' || coalesce(v_edition.volume_from::text || '-' || v_edition.volume_to::text, '');
  v_new := p_kind || ':' || coalesce(v_from::text || '-' || v_to::text, '');
  if v_old = v_new then
    return 'unchanged';
  end if;

  -- Plafond quotidien de changements proposés (couvertures et types confondus)
  if not v_moderator and (
    select count(*) from public.catalogue_changes
    where user_id = v_uid and kind in ('cover', 'edition_kind') and origin = 'user'
      and created_at > now() - interval '1 day'
  ) >= 60 then
    raise exception 'Limite quotidienne de signalements atteinte' using errcode = '54000';
  end if;

  -- Un album en attente créé par son auteur se modifie directement : personne d'autre ne le voit
  if not v_moderator
     and v_edition.review_status = 'approved'
     and exists (select 1 from public.profiles where id = v_uid and contribution = 'collection_only') then
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value, status)
    values (v_uid, 'user', 'edition_kind', p_isbn, v_old, v_new, 'pending');
    return 'pending';
  end if;

  update public.editions
  set kind = p_kind, volume_from = v_from, volume_to = v_to
  where isbn = p_isbn;

  if v_edition.review_status = 'approved' then
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, case when v_moderator then 'admin' else 'user' end, 'edition_kind', p_isbn, v_old, v_new);
  end if;
  return 'applied';
end;
$$;

revoke execute on function public.set_edition_kind(text, text, int, int) from public, anon, authenticated;
grant execute on function public.set_edition_kind(text, text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Validation et annulation : prennent en charge les changements de type
-- ---------------------------------------------------------------------------

create or replace function public.review_change(p_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_change public.catalogue_changes;
  v_edition public.editions;
  v_series uuid;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'pending' then
    raise exception 'Proposition introuvable ou déjà traitée' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where isbn = v_change.isbn;

  perform set_config('bdbynico.skip_log', '1', true);

  if v_change.kind = 'create' then
    if not p_accept then
      if v_edition.isbn is not null and exists (
        select 1 from public.collection_items
        where isbn = v_change.isbn and user_id is distinct from v_change.user_id
      ) then
        raise exception 'D''autres utilisateurs possèdent cet album : refus impossible'
          using errcode = '55000';
      end if;
      if v_edition.isbn is not null then
        delete from public.collection_items where isbn = v_change.isbn;
        delete from public.editions where isbn = v_change.isbn;
        v_series := v_edition.series_id;
        if v_series is not null and not exists (
          select 1 from public.editions where series_id = v_series
        ) then
          delete from public.series where id = v_series;
        end if;
      end if;
    elsif v_edition.isbn is not null then
      update public.editions set review_status = 'approved' where isbn = v_change.isbn;
    end if;
  elsif v_change.kind = 'edition_kind' then
    if p_accept and v_edition.isbn is not null then
      update public.editions
      set kind = split_part(v_change.new_value, ':', 1),
          volume_from = nullif(split_part(split_part(v_change.new_value, ':', 2), '-', 1), '')::int,
          volume_to = nullif(split_part(split_part(v_change.new_value, ':', 2), '-', 2), '')::int
      where isbn = v_change.isbn;
      -- ancienne valeur réelle au moment de la validation (pour pouvoir annuler proprement)
      update public.catalogue_changes
      set old_value = v_edition.kind || ':' || coalesce(v_edition.volume_from::text || '-' || v_edition.volume_to::text, '')
      where id = p_id;
    end if;
  else
    if p_accept and v_edition.isbn is not null then
      update public.editions
      set cover_url = v_change.new_value, cover_locked = true
      where isbn = v_change.isbn;
      -- ancienne valeur réelle au moment de la validation (pour pouvoir annuler proprement)
      update public.catalogue_changes set old_value = v_edition.cover_url where id = p_id;
    end if;
  end if;

  perform set_config('bdbynico.skip_log', '0', true);

  update public.catalogue_changes
  set status = case
        when p_accept and (v_edition.isbn is not null or v_change.kind = 'create') then 'applied'
        else 'rejected'
      end,
      reviewed_by = v_uid,
      reviewed_at = now()
  where id = p_id;
end;
$$;

create or replace function public.revert_change(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_change public.catalogue_changes;
  v_edition public.editions;
  v_series uuid;
  v_s_name text;
  v_s_total int;
  v_s_tsrc text;
  v_s_status text;
  v_s_ssrc text;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'applied' then
    raise exception 'Changement introuvable ou non annulable' using errcode = '22023';
  end if;

  -- Changements de série (nom, total, statut)
  if v_change.kind like 'series\_%' then
    select name, total_volumes, total_source, publication_status, status_source
      into v_s_name, v_s_total, v_s_tsrc, v_s_status, v_s_ssrc
    from public.series where id = v_change.series_id for update;
    if not found then
      raise exception 'La série n''existe plus' using errcode = '22023';
    end if;

    if v_change.kind = 'series_name' then
      if v_s_name is distinct from v_change.new_value then
        raise exception 'Le nom a changé depuis : annulation impossible' using errcode = '55000';
      end if;
      if exists (
        select 1 from public.series
        where name_key = lower(extensions.unaccent(btrim(v_change.old_value)))
          and id <> v_change.series_id
      ) then
        raise exception 'Une série porte déjà ce nom' using errcode = '23505';
      end if;
      update public.series set name = v_change.old_value where id = v_change.series_id;
    elsif v_change.kind = 'series_total' then
      if (v_s_tsrc || ':' || coalesce(v_s_total::text, '')) is distinct from v_change.new_value then
        raise exception 'Le total a changé depuis : annulation impossible' using errcode = '55000';
      end if;
      update public.series
      set total_source = split_part(v_change.old_value, ':', 1),
          total_volumes = nullif(split_part(v_change.old_value, ':', 2), '')::int
      where id = v_change.series_id;
    else
      if (v_s_ssrc || ':' || coalesce(v_s_status, '')) is distinct from v_change.new_value then
        raise exception 'Le statut a changé depuis : annulation impossible' using errcode = '55000';
      end if;
      update public.series
      set status_source = split_part(v_change.old_value, ':', 1),
          publication_status = nullif(split_part(v_change.old_value, ':', 2), '')
      where id = v_change.series_id;
    end if;

    insert into public.catalogue_changes
      (user_id, origin, kind, series_id, old_value, new_value, reverts_id)
    values (v_uid, 'admin', v_change.kind, v_change.series_id,
            v_change.new_value, v_change.old_value, p_id);
    update public.catalogue_changes
    set status = 'reverted', reviewed_by = v_uid, reviewed_at = now()
    where id = p_id;
    return;
  end if;

  select * into v_edition from public.editions where isbn = v_change.isbn;
  if not found then
    raise exception 'L''album n''existe plus' using errcode = '22023';
  end if;

  perform set_config('bdbynico.skip_log', '1', true);

  if v_change.kind = 'cover' then
    if v_edition.cover_url is distinct from v_change.new_value then
      raise exception 'La couverture a changé depuis : annulation impossible'
        using errcode = '55000';
    end if;
    update public.editions
    set cover_url = v_change.old_value, cover_locked = true
    where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'cover', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_kind' then
    if (v_edition.kind || ':' || coalesce(v_edition.volume_from::text || '-' || v_edition.volume_to::text, ''))
       is distinct from v_change.new_value then
      raise exception 'Le type a changé depuis : annulation impossible' using errcode = '55000';
    end if;
    update public.editions
    set kind = split_part(v_change.old_value, ':', 1),
        volume_from = nullif(split_part(split_part(v_change.old_value, ':', 2), '-', 1), '')::int,
        volume_to = nullif(split_part(split_part(v_change.old_value, ':', 2), '-', 2), '')::int
    where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_kind', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  else
    if exists (
      select 1 from public.collection_items
      where isbn = v_change.isbn and user_id is distinct from v_change.user_id
    ) then
      raise exception 'D''autres utilisateurs possèdent cet album : annulation impossible'
        using errcode = '55000';
    end if;
    delete from public.collection_items where isbn = v_change.isbn;
    delete from public.editions where isbn = v_change.isbn;
    v_series := v_edition.series_id;
    if v_series is not null and not exists (
      select 1 from public.editions where series_id = v_series
    ) then
      delete from public.series where id = v_series;
    end if;
  end if;

  perform set_config('bdbynico.skip_log', '0', true);

  update public.catalogue_changes
  set status = 'reverted', reviewed_by = v_uid, reviewed_at = now()
  where id = p_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- Import en masse : lit le type et la plage de tomes (colonnes « kind », « volume_from »,
-- « volume_to » de chaque ligne)
-- ---------------------------------------------------------------------------

create or replace function public.import_editions(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_isbn text;
  v_title text;
  v_series_id uuid;
  v_volume int;
  v_date date;
  v_authors text[];
  v_recent int;
  v_new int;
  v_created int := 0;
  v_existing int := 0;
  v_invalid int := 0;
  v_status text := 'approved';
  v_kind text;
  v_from int;
  v_to int;
  v_found public.editions;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Données d''import invalides' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Trop de lignes dans un même envoi (500 maximum)' using errcode = '54000';
  end if;

  if exists (
    select 1 from public.profiles where id = v_uid and contribution = 'collection_only'
  ) then
    v_status := 'pending';
  end if;

  -- Plafond quotidien : on compte d'abord les éditions réellement nouvelles
  select count(*) into v_recent
  from public.editions
  where created_by = v_uid and created_at > now() - interval '1 day';

  select count(distinct s.isbn) into v_new
  from (
    select regexp_replace(coalesce(r ->> 'isbn', ''), '[^0-9]', '', 'g') as isbn
    from jsonb_array_elements(p_rows) as r
  ) as s
  where public.is_valid_isbn13(s.isbn)
    and not exists (select 1 from public.editions e where e.isbn = s.isbn);

  if v_recent + v_new > 500 then
    raise exception 'Limite quotidienne d''ajouts atteinte' using errcode = '54000';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_isbn := regexp_replace(coalesce(v_row ->> 'isbn', ''), '[^0-9]', '', 'g');
    v_title := left(btrim(coalesce(v_row ->> 'title', '')), 300);

    if not public.is_valid_isbn13(v_isbn) or v_title = '' then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    select * into v_found from public.editions where isbn = v_isbn;
    if found then
      -- une édition en attente d'un autre utilisateur n'est pas utilisable
      if v_found.review_status = 'pending'
         and v_found.created_by is distinct from v_uid
         and not public.is_moderator() then
        v_invalid := v_invalid + 1;
      else
        v_existing := v_existing + 1;
      end if;
      continue;
    end if;

    -- Série (créée si besoin, retrouvée sans tenir compte de la casse ni des accents)
    v_series_id := null;
    if nullif(btrim(coalesce(v_row ->> 'series', '')), '') is not null then
      insert into public.series (name)
      values (left(btrim(v_row ->> 'series'), 200))
      on conflict (name_key) do update set name = public.series.name
      returning id into v_series_id;
    end if;

    -- Tome : entier de 0 (prologue) à 999, sinon ignoré
    v_volume := null;
    if (v_row ->> 'volume') ~ '^[0-9]{1,3}$' and (v_row ->> 'volume')::int between 0 and 999 then
      v_volume := (v_row ->> 'volume')::int;
    end if;

    -- Type : intégrale ou hors-série (sinon album ordinaire) ; plage de tomes d'une intégrale
    v_kind := case when (v_row ->> 'kind') in ('integral', 'special') then v_row ->> 'kind' else 'album' end;
    v_from := null;
    v_to := null;
    if v_kind = 'integral'
       and (v_row ->> 'volume_from') ~ '^[0-9]{1,3}$' and (v_row ->> 'volume_to') ~ '^[0-9]{1,3}$'
       and (v_row ->> 'volume_from')::int <= (v_row ->> 'volume_to')::int then
      v_from := (v_row ->> 'volume_from')::int;
      v_to := (v_row ->> 'volume_to')::int;
    end if;

    -- Date : AAAA-MM-JJ valide, sinon ignorée
    v_date := null;
    begin
      if (v_row ->> 'published_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_date := (v_row ->> 'published_on')::date;
      end if;
    exception when others then
      v_date := null;
    end;

    -- Auteurs : 20 maximum, 100 caractères chacun
    v_authors := '{}';
    if jsonb_typeof(v_row -> 'authors') = 'array' then
      select coalesce(array_agg(left(btrim(a), 100)), '{}') into v_authors
      from (
        select a from jsonb_array_elements_text(v_row -> 'authors') as a
        where btrim(a) <> ''
        limit 20
      ) as t;
    end if;

    insert into public.editions (
      isbn, title, series_id, volume, authors, publisher, published_on,
      source, created_by, review_status, kind, volume_from, volume_to
    )
    values (
      v_isbn, v_title, v_series_id, v_volume, v_authors,
      nullif(left(btrim(coalesce(v_row ->> 'publisher', '')), 200), ''),
      v_date, 'import', v_uid, v_status, v_kind, v_from, v_to
    )
    on conflict (isbn) do nothing;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing, 'invalid', v_invalid);
end;
$$;


revoke execute on function public.review_change(bigint, boolean) from public, anon, authenticated;
grant execute on function public.review_change(bigint, boolean) to authenticated;
revoke execute on function public.revert_change(bigint) from public, anon, authenticated;
grant execute on function public.revert_change(bigint) to authenticated;
revoke execute on function public.import_editions(jsonb) from public, anon, authenticated;
grant execute on function public.import_editions(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Correction des données déjà importées
-- ---------------------------------------------------------------------------

-- La Trilogie du Mal : intégrale des tomes 1 à 3 (et non « tome 0 »)
update public.editions
set kind = 'integral', volume = null, volume_from = 1, volume_to = 3
where isbn = '9782822225632';

-- Intégrales complètes signalées par Bubble (« Type : intégrale complète »)
update public.editions set kind = 'integral' where isbn in ('9782756024189', '9782869673847') and kind = 'album';
update public.editions set kind = 'integral', volume = null where isbn = '9782723460194' and kind = 'album';

-- Hors-série signalé par Bubble (« Type : hors série »)
update public.editions set kind = 'special', volume = null where isbn = '9782864972129' and kind = 'album';
