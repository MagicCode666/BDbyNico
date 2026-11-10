-- Genres des séries : une liste fermée (15 genres), jusqu'à 3 par série, partagée par tous.
--
-- Seuls les modérateurs les fixent ; chaque changement est journalisé et annulable comme les autres
-- (nom, total, statut). Le journal porte la liste sous forme « aventure,western » (ordre alphabétique).

alter table public.series
  add column genres text[] not null default '{}'
    check (
      cardinality(genres) <= 3
      and genres <@ array[
        'aventure', 'science-fiction', 'fantasy', 'polar', 'historique', 'humour', 'western',
        'horreur', 'jeunesse', 'biographie', 'tranche-de-vie', 'super-heros', 'guerre',
        'musique', 'manga'
      ]::text[]
    );

comment on column public.series.genres is 'Genres (liste fermée, 3 au plus), fixés par les modérateurs';

create index series_genres_idx on public.series using gin (genres);

alter table public.catalogue_changes
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check check (
    kind in ('create', 'cover', 'edition_kind', 'series_name', 'series_total', 'series_status',
             'series_genres')
  );

create or replace function public.set_series_genres(p_series uuid, p_genres text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old text[];
  v_new text[];
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  -- Sans doublon, sans valeur vide, triés : la même liste s'écrit toujours de la même façon
  select coalesce(array_agg(distinct g order by g), '{}') into v_new
  from unnest(coalesce(p_genres, '{}')) as g
  where g is not null and g <> '';
  if cardinality(v_new) > 3 then
    raise exception 'Trois genres au plus' using errcode = '22023';
  end if;

  select genres into v_old from public.series where id = p_series for update;
  if not found then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;
  if v_new = v_old then
    return;
  end if;

  begin
    update public.series set genres = v_new where id = p_series;
  exception when check_violation then
    raise exception 'Genre inconnu' using errcode = '22023';
  end;
  insert into public.catalogue_changes (user_id, origin, kind, series_id, old_value, new_value)
  values (v_uid, 'admin', 'series_genres', p_series,
          array_to_string(v_old, ','), array_to_string(v_new, ','));
end;
$$;

revoke execute on function public.set_series_genres(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_series_genres(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation : prend aussi en charge les genres
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
