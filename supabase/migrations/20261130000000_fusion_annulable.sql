-- Une fusion de séries peut être annulée.
--
-- Au moment de fusionner, on garde dans le journal (colonne `snapshot`) de quoi la défaire : la
-- série absorbée (identifiant, nom, total, statut, genres), la liste de ses albums et les réglages
-- personnels des utilisateurs (tomes ignorés, total personnel). Annuler recrée la série avec son
-- identifiant d'origine et lui rend ceux de ses albums qui sont encore dans la série de destination.
-- Les fusions déjà faites sont rattrapées autant que le journal le permet : sans total, statut ni
-- réglages personnels (ils n'étaient pas conservés).

alter table public.catalogue_changes add column snapshot jsonb;

create or replace function public.merge_series(p_from uuid, p_into uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from public.series;
  v_count int := 0;
  v_isbn text;
  v_isbns text[] := '{}';
  v_settings jsonb;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'Choisissez deux séries différentes' using errcode = '22023';
  end if;
  select * into v_from from public.series where id = p_from for update;
  if not found or not exists (select 1 from public.series where id = p_into) then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_settings
  from public.user_series_settings s where s.series_id = p_from;

  for v_isbn in select isbn from public.editions where series_id = p_from order by isbn loop
    update public.editions set series_id = p_into where isbn = v_isbn;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, 'admin', 'edition_series', v_isbn, p_from::text, p_into::text);
    v_isbns := v_isbns || v_isbn;
    v_count := v_count + 1;
  end loop;

  insert into public.catalogue_changes
    (user_id, origin, kind, series_id, old_value, new_value, snapshot)
  values (
    v_uid, 'admin', 'series_merge', p_into, v_from.name, v_count::text,
    jsonb_build_object(
      'from_id', p_from,
      'series', to_jsonb(v_from),
      'isbns', to_jsonb(v_isbns),
      'settings', v_settings
    )
  );
  delete from public.series where id = p_from;
  return v_count;
end;
$$;

-- Rattrapage des fusions déjà faites : série, nom et albums retrouvés grâce aux lignes de journal
-- écrites dans la même transaction (même horodatage)
update public.catalogue_changes m
set snapshot = jsonb_build_object(
  'from_id', f.from_id,
  'series', jsonb_build_object('id', f.from_id, 'name', m.old_value),
  'isbns', to_jsonb(f.isbns),
  'settings', '[]'::jsonb
)
from (
  select m2.id, (array_agg(distinct e.old_value))[1]::uuid as from_id, array_agg(e.isbn) as isbns
  from public.catalogue_changes m2
  join public.catalogue_changes e
    on e.kind = 'edition_series'
   and e.created_at = m2.created_at
   and e.new_value = m2.series_id::text
   and e.old_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  where m2.kind = 'series_merge' and m2.snapshot is null and m2.reverts_id is null
  group by m2.id
  having count(distinct e.old_value) = 1
) f
where m.id = f.id;

-- Une fusion dont la série d'origine existe de nouveau est déjà défaite (corrigée à la main)
update public.catalogue_changes m
set status = 'reverted'
where m.kind = 'series_merge' and m.status = 'applied' and m.reverts_id is null
  and m.snapshot is not null
  and exists (select 1 from public.series s where s.id = (m.snapshot ->> 'from_id')::uuid);

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
  v_snap jsonb;
  v_from uuid;
  v_into uuid;
  v_moved int;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'applied' then
    raise exception 'Changement introuvable ou non annulable' using errcode = '22023';
  end if;

  if v_change.kind in ('edition_isbn', 'edition_merge') then
    raise exception 'Ce changement ne s''annule pas : corrigez-le à la main'
      using errcode = '55000';
  end if;

  -- Fusion de séries : on recrée la série absorbée et on lui rend ses albums
  if v_change.kind = 'series_merge' then
    v_snap := v_change.snapshot;
    if v_change.reverts_id is not null or v_snap is null then
      raise exception 'Cette fusion ne peut pas être annulée (trop ancienne)'
        using errcode = '55000';
    end if;
    v_from := (v_snap ->> 'from_id')::uuid;
    v_into := v_change.series_id;
    if exists (select 1 from public.series where id = v_from) then
      raise exception 'La série d''origine existe déjà' using errcode = '55000';
    end if;
    if not exists (select 1 from public.series where id = v_into) then
      raise exception 'La série de destination n''existe plus' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.series
      where name_key = lower(extensions.unaccent(btrim(v_snap #>> '{series,name}')))
    ) then
      raise exception 'Une série porte déjà ce nom' using errcode = '23505';
    end if;

    insert into public.series
      (id, name, total_volumes, total_source, total_checked_at, publication_status,
       status_source, starts_at_zero, genres)
    values (
      v_from,
      v_snap #>> '{series,name}',
      (v_snap #>> '{series,total_volumes}')::int,
      coalesce(v_snap #>> '{series,total_source}', 'auto'),
      (v_snap #>> '{series,total_checked_at}')::timestamptz,
      v_snap #>> '{series,publication_status}',
      coalesce(v_snap #>> '{series,status_source}', 'auto'),
      coalesce((v_snap #>> '{series,starts_at_zero}')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(v_snap #> '{series,genres}')), '{}')
    );

    -- Les albums encore dans la série de destination retournent dans la série d'origine
    update public.catalogue_changes
    set status = 'reverted', reviewed_by = v_uid, reviewed_at = now()
    where kind = 'edition_series' and status = 'applied'
      and old_value = v_from::text and new_value = v_into::text
      and isbn in (select jsonb_array_elements_text(v_snap -> 'isbns'));
    with upd as (
      update public.editions
      set series_id = v_from
      where series_id = v_into and isbn in (select jsonb_array_elements_text(v_snap -> 'isbns'))
      returning isbn
    ), ins as (
      insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
      select v_uid, 'admin', 'edition_series', isbn, v_into::text, v_from::text from upd
      returning 1
    )
    select count(*) into v_moved from ins;

    -- Réglages personnels de la série (tomes ignorés, total personnel, statut choisi)
    insert into public.user_series_settings
    select * from jsonb_populate_recordset(null::public.user_series_settings, v_snap -> 'settings') s
    where exists (select 1 from auth.users u where u.id = s.user_id);

    insert into public.catalogue_changes
      (user_id, origin, kind, series_id, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'series_merge', v_from, v_snap #>> '{series,name}', v_moved::text, p_id);
    update public.catalogue_changes
    set status = 'reverted', reviewed_by = v_uid, reviewed_at = now()
    where id = p_id;
    return;
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
revoke execute on function public.merge_series(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_series(uuid, uuid) to authenticated;
