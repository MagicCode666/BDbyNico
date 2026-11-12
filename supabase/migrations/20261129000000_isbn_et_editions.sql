-- Correction d'un ISBN et fusion de deux éditions d'un même album (modérateurs et administrateur).
--
-- correct_isbn : l'ISBN saisi avec une faute est remplacé partout (collections, envies, journal).
--   Les informations venues de l'ancien ISBN (couverture, fiche BnF) sont effacées pour être
--   recherchées de nouveau avec le bon ISBN.
-- merge_editions : quand le « bon » ISBN existe déjà (doublon), on fusionne : les collections
--   passent sur l'édition conservée, l'autre est supprimée.
-- Ces deux changements sont journalisés mais ne s'annulent pas (on les refait à la main).

alter table public.catalogue_changes
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check check (
    kind in ('create', 'cover', 'edition_kind', 'edition_title', 'edition_volume',
             'edition_authors', 'edition_publisher', 'edition_date', 'edition_series',
             'edition_isbn', 'edition_merge',
             'series_name', 'series_total', 'series_status', 'series_genres', 'series_merge')
  );

-- Les collections suivent l'ISBN quand il change
alter table public.collection_items
  drop constraint collection_items_isbn_fkey,
  add constraint collection_items_isbn_fkey
    foreign key (isbn) references public.editions (isbn) on update cascade;

-- ---------------------------------------------------------------------------
-- Corriger l'ISBN d'une édition. Renvoie le nouvel ISBN.
-- ---------------------------------------------------------------------------

create or replace function public.correct_isbn(p_old text, p_new text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new text := regexp_replace(coalesce(p_new, ''), '[^0-9]', '', 'g');
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if not public.is_valid_isbn13(v_new) then
    raise exception 'ISBN invalide : 13 chiffres avec une clé de contrôle correcte'
      using errcode = '22023';
  end if;
  if v_new = p_old then
    return p_old;
  end if;
  perform 1 from public.editions where isbn = p_old for update;
  if not found then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;
  if exists (select 1 from public.editions where isbn = v_new) then
    raise exception 'Cet ISBN existe déjà dans le catalogue' using errcode = '23505';
  end if;

  perform set_config('bdbynico.skip_log', '1', true);
  -- Les informations tirées de l'ancien ISBN ne valent plus : elles seront cherchées de nouveau
  update public.editions
  set isbn = v_new,
      cover_url = null, cover_locked = false,
      summary = null, pages = null, format_cm = null, public_price = null, language = null,
      details_checked_at = null
  where isbn = p_old;
  perform set_config('bdbynico.skip_log', '0', true);

  update public.catalogue_changes set isbn = v_new where isbn = p_old;
  insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
  values (v_uid, 'admin', 'edition_isbn', v_new, p_old, v_new);
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fusionner deux éditions : p_from est absorbée par p_into. Les champs vides de p_into sont
-- complétés par ceux de p_from (jamais écrasés). Renvoie le nombre d'entrées de collection reprises.
-- ---------------------------------------------------------------------------

create or replace function public.merge_editions(p_from text, p_into text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from public.editions;
  v_item record;
  v_count int := 0;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'Choisissez deux albums différents' using errcode = '22023';
  end if;
  select * into v_from from public.editions where isbn = p_from for update;
  if not found or not exists (select 1 from public.editions where isbn = p_into) then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;

  update public.editions e
  set series_id = coalesce(e.series_id, v_from.series_id),
      volume = case when e.series_id is null then coalesce(e.volume, v_from.volume) else e.volume end,
      authors = case when cardinality(e.authors) = 0 then v_from.authors else e.authors end,
      publisher = coalesce(e.publisher, v_from.publisher),
      published_on = coalesce(e.published_on, v_from.published_on),
      summary = coalesce(e.summary, v_from.summary),
      pages = coalesce(e.pages, v_from.pages),
      format_cm = coalesce(e.format_cm, v_from.format_cm),
      public_price = coalesce(e.public_price, v_from.public_price),
      language = coalesce(e.language, v_from.language)
  where e.isbn = p_into;

  for v_item in select id, user_id, status from public.collection_items where isbn = p_from loop
    if exists (
      select 1 from public.collection_items where user_id = v_item.user_id and isbn = p_into
    ) then
      -- Déjà présent sous l'autre ISBN : on garde cette entrée, « possédé » l'emporte sur « envie »
      if v_item.status = 'owned' then
        update public.collection_items set status = 'owned'
        where user_id = v_item.user_id and isbn = p_into;
      end if;
      delete from public.collection_items where id = v_item.id;
    else
      update public.collection_items set isbn = p_into where id = v_item.id;
    end if;
    v_count := v_count + 1;
  end loop;

  delete from public.editions where isbn = p_from;
  -- Le journal de p_from reste tel quel : annuler sa création échouera (l'album n'existe plus)
  insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
  values (v_uid, 'admin', 'edition_merge', p_into, p_from, p_into);
  return v_count;
end;
$$;

revoke execute on function
  public.correct_isbn(text, text),
  public.merge_editions(text, text)
  from public, anon, authenticated;
grant execute on function
  public.correct_isbn(text, text),
  public.merge_editions(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation : ces deux changements ne s'annulent pas (voir en-tête)
-- ---------------------------------------------------------------------------

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

  if v_change.kind in ('series_merge', 'edition_isbn', 'edition_merge') then
    raise exception 'Ce changement ne s''annule pas : corrigez-le à la main'
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
