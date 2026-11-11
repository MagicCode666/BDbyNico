-- Corrections du catalogue partagé par les modérateurs et l'administrateur : titre, numéro de tome,
-- auteurs, éditeur, date de parution, rattachement à une série, fusion de séries.
-- Tout est journalisé et annulable (sauf une fusion de séries, qui se défait à la main).
-- Réservé aux modérateurs : les autres utilisateurs proposeront plus tard une correction.

alter table public.catalogue_changes
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check check (
    kind in ('create', 'cover', 'edition_kind', 'edition_title', 'edition_volume',
             'edition_authors', 'edition_publisher', 'edition_date', 'edition_series',
             'series_name', 'series_total', 'series_status', 'series_genres', 'series_merge')
  ),
  drop constraint catalogue_changes_target_check,
  add constraint catalogue_changes_target_check check (
    ((kind in ('create', 'cover') or kind like 'edition\_%') and isbn is not null)
    or (kind like 'series\_%' and series_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Corriger les informations d'un album
-- p_changes : objet JSON dont seules les clés présentes sont modifiées
--   title, volume (null : sans numéro), authors (tableau), publisher, published_on
-- Renvoie le nombre de champs réellement modifiés.
-- ---------------------------------------------------------------------------

create or replace function public.correct_edition(p_isbn text, p_changes jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
  v_key text;
  v_title text;
  v_volume int;
  v_authors text[];
  v_publisher text;
  v_date date;
  v_count int := 0;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'Corrections invalides' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('title', 'volume', 'authors', 'publisher', 'published_on') then
      raise exception 'Champ inconnu : %', v_key using errcode = '22023';
    end if;
  end loop;

  select * into v_edition from public.editions where isbn = p_isbn for update;
  if not found then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;

  if p_changes ? 'title' then
    v_title := btrim(p_changes ->> 'title');
    if v_title is null or char_length(v_title) not between 1 and 300 then
      raise exception 'Le titre doit faire entre 1 et 300 caractères' using errcode = '22023';
    end if;
    if v_title is distinct from v_edition.title then
      update public.editions set title = v_title where isbn = p_isbn;
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      values (v_uid, 'admin', 'edition_title', p_isbn, v_edition.title, v_title);
      v_count := v_count + 1;
    end if;
  end if;

  if p_changes ? 'volume' then
    v_volume := (p_changes ->> 'volume')::int;
    if v_volume is not null and v_volume not between 0 and 999 then
      raise exception 'Le numéro de tome doit être compris entre 0 et 999' using errcode = '22023';
    end if;
    if v_volume is distinct from v_edition.volume then
      update public.editions set volume = v_volume where isbn = p_isbn;
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      values (v_uid, 'admin', 'edition_volume', p_isbn,
              coalesce(v_edition.volume::text, ''), coalesce(v_volume::text, ''));
      v_count := v_count + 1;
    end if;
  end if;

  if p_changes ? 'authors' then
    if jsonb_typeof(p_changes -> 'authors') is distinct from 'array' then
      raise exception 'Les auteurs doivent former une liste' using errcode = '22023';
    end if;
    select coalesce(array_agg(btrim(a)) filter (where btrim(a) <> ''), '{}')
      into v_authors from jsonb_array_elements_text(p_changes -> 'authors') as t(a);
    if cardinality(v_authors) > 20 or exists (
      select 1 from unnest(v_authors) a where char_length(a) > 100
    ) then
      raise exception 'Trop d''auteurs, ou un nom trop long' using errcode = '22023';
    end if;
    if v_authors is distinct from v_edition.authors then
      update public.editions set authors = v_authors where isbn = p_isbn;
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      values (v_uid, 'admin', 'edition_authors', p_isbn,
              to_json(v_edition.authors)::text, to_json(v_authors)::text);
      v_count := v_count + 1;
    end if;
  end if;

  if p_changes ? 'publisher' then
    v_publisher := nullif(btrim(p_changes ->> 'publisher'), '');
    if char_length(v_publisher) > 200 then
      raise exception 'Éditeur trop long' using errcode = '22023';
    end if;
    if v_publisher is distinct from v_edition.publisher then
      update public.editions set publisher = v_publisher where isbn = p_isbn;
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      values (v_uid, 'admin', 'edition_publisher', p_isbn,
              coalesce(v_edition.publisher, ''), coalesce(v_publisher, ''));
      v_count := v_count + 1;
    end if;
  end if;

  if p_changes ? 'published_on' then
    v_date := nullif(btrim(p_changes ->> 'published_on'), '')::date;
    if v_date is distinct from v_edition.published_on then
      update public.editions set published_on = v_date where isbn = p_isbn;
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      values (v_uid, 'admin', 'edition_date', p_isbn,
              coalesce(v_edition.published_on::text, ''), coalesce(v_date::text, ''));
      v_count := v_count + 1;
    end if;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rattacher un album à une série (null : le détacher, son numéro de tome est alors effacé)
-- ---------------------------------------------------------------------------

create or replace function public.set_edition_series(p_isbn text, p_series uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  select * into v_edition from public.editions where isbn = p_isbn for update;
  if not found then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;
  if p_series is not null and not exists (select 1 from public.series where id = p_series) then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;
  if p_series is not distinct from v_edition.series_id then
    return;
  end if;

  update public.editions set series_id = p_series where isbn = p_isbn;
  insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
  values (v_uid, 'admin', 'edition_series', p_isbn,
          coalesce(v_edition.series_id::text, ''), coalesce(p_series::text, ''));

  if p_series is null and v_edition.volume is not null then
    update public.editions set volume = null where isbn = p_isbn;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, 'admin', 'edition_volume', p_isbn, v_edition.volume::text, '');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fusionner deux séries : tous les albums de p_from passent dans p_into, p_from est supprimée.
-- Les réglages personnels de p_from (tomes exclus, total personnel) sont perdus.
-- Renvoie le nombre d'albums déplacés.
-- ---------------------------------------------------------------------------

create or replace function public.merge_series(p_from uuid, p_into uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from_name text;
  v_count int := 0;
  v_isbn text;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'Choisissez deux séries différentes' using errcode = '22023';
  end if;
  select name into v_from_name from public.series where id = p_from for update;
  if not found or not exists (select 1 from public.series where id = p_into) then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;

  for v_isbn in select isbn from public.editions where series_id = p_from order by isbn loop
    update public.editions set series_id = p_into where isbn = v_isbn;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, 'admin', 'edition_series', v_isbn, p_from::text, p_into::text);
    v_count := v_count + 1;
  end loop;

  insert into public.catalogue_changes (user_id, origin, kind, series_id, old_value, new_value)
  values (v_uid, 'admin', 'series_merge', p_into, v_from_name, v_count::text);
  delete from public.series where id = p_from;
  return v_count;
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
  v_s_genres text[];
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'applied' then
    raise exception 'Changement introuvable ou non annulable' using errcode = '22023';
  end if;

  if v_change.kind = 'series_merge' then
    raise exception 'Une fusion ne s''annule pas : déplacez les albums à la main'
      using errcode = '55000';
  end if;

  -- Changements de série (nom, total, statut)
  if v_change.kind like 'series\_%' then
    select name, total_volumes, total_source, publication_status, status_source, genres
      into v_s_name, v_s_total, v_s_tsrc, v_s_status, v_s_ssrc, v_s_genres
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
    elsif v_change.kind = 'series_genres' then
      if array_to_string(v_s_genres, ',') is distinct from v_change.new_value then
        raise exception 'Les genres ont changé depuis : annulation impossible' using errcode = '55000';
      end if;
      update public.series
      set genres = coalesce(string_to_array(nullif(v_change.old_value, ''), ','), '{}')
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
  elsif v_change.kind = 'edition_title' then
    if v_edition.title is distinct from v_change.new_value then
      raise exception 'Le titre a changé depuis : annulation impossible' using errcode = '55000';
    end if;
    update public.editions set title = v_change.old_value where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_title', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_volume' then
    if coalesce(v_edition.volume::text, '') is distinct from coalesce(v_change.new_value, '') then
      raise exception 'Le numéro de tome a changé depuis : annulation impossible'
        using errcode = '55000';
    end if;
    update public.editions set volume = nullif(v_change.old_value, '')::int where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_volume', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_authors' then
    if to_json(v_edition.authors)::text is distinct from v_change.new_value then
      raise exception 'Les auteurs ont changé depuis : annulation impossible' using errcode = '55000';
    end if;
    update public.editions
    set authors = coalesce(array(select jsonb_array_elements_text(v_change.old_value::jsonb)), '{}')
    where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_authors', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_publisher' then
    if coalesce(v_edition.publisher, '') is distinct from coalesce(v_change.new_value, '') then
      raise exception 'L''éditeur a changé depuis : annulation impossible' using errcode = '55000';
    end if;
    update public.editions set publisher = nullif(v_change.old_value, '') where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_publisher', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_date' then
    if coalesce(v_edition.published_on::text, '') is distinct from coalesce(v_change.new_value, '') then
      raise exception 'La date a changé depuis : annulation impossible' using errcode = '55000';
    end if;
    update public.editions set published_on = nullif(v_change.old_value, '')::date where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_date', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  elsif v_change.kind = 'edition_series' then
    if coalesce(v_edition.series_id::text, '') is distinct from coalesce(v_change.new_value, '') then
      raise exception 'La série a changé depuis : annulation impossible' using errcode = '55000';
    end if;
    if nullif(v_change.old_value, '') is not null and not exists (
      select 1 from public.series where id = v_change.old_value::uuid
    ) then
      raise exception 'La série d''origine n''existe plus' using errcode = '22023';
    end if;
    update public.editions set series_id = nullif(v_change.old_value, '')::uuid
    where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_series', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
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

revoke execute on function public.revert_change(bigint) from public, anon, authenticated;
grant execute on function public.revert_change(bigint) to authenticated;

revoke execute on function
  public.correct_edition(text, jsonb),
  public.set_edition_series(text, uuid),
  public.merge_series(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.correct_edition(text, jsonb),
  public.set_edition_series(text, uuid),
  public.merge_series(uuid, uuid)
  to authenticated;
