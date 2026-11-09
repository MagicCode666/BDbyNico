-- Import de collection : champs de collectionneur (dédicace, édition originale) et création
-- d'éditions en masse dans le catalogue partagé.

-- ---------------------------------------------------------------------------
-- Dédicace et édition originale (propres à chaque exemplaire de l'utilisateur)
-- ---------------------------------------------------------------------------

alter table public.collection_items
  add column dedication text check (dedication in ('signature', 'drawing')),
  add column dedication_by text check (dedication_by is null or char_length(dedication_by) <= 100),
  add column first_edition boolean not null default false;

comment on column public.collection_items.dedication is
  'null : aucune ; signature : simple autographe ; drawing : dédicace avec dessin personnalisé';
comment on column public.collection_items.dedication_by is
  'Auteur ou artiste de la dédicace';

-- ---------------------------------------------------------------------------
-- Plafond quotidien de créations dans le catalogue partagé : 500, commun à l'ajout manuel et à
-- l'import (le catalogue est partagé : on limite les abus).
-- ---------------------------------------------------------------------------

create or replace function public.add_edition(
  p_isbn text,
  p_title text,
  p_series_name text default null,
  p_volume int default null,
  p_authors text[] default '{}',
  p_publisher text default null,
  p_published_on date default null,
  p_cover_url text default null,
  p_source text default null
)
returns public.editions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_isbn text := regexp_replace(coalesce(p_isbn, ''), '[^0-9]', '', 'g');
  v_series_id uuid;
  v_edition public.editions;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if not public.is_valid_isbn13(v_isbn) then
    raise exception 'ISBN-13 invalide' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where isbn = v_isbn;
  if found then
    return v_edition;
  end if;

  -- Limite quotidienne contre les abus
  if (
    select count(*) from public.editions
    where created_by = v_uid and created_at > now() - interval '1 day'
  ) >= 500 then
    raise exception 'Limite quotidienne d''ajouts atteinte' using errcode = '54000';
  end if;

  if nullif(btrim(p_series_name), '') is not null then
    insert into public.series (name)
    values (btrim(p_series_name))
    on conflict (name_key) do update set name = public.series.name
    returning id into v_series_id;
  end if;

  insert into public.editions (
    isbn, title, series_id, volume, authors, publisher,
    published_on, cover_url, source, created_by
  )
  values (
    v_isbn, btrim(p_title), v_series_id, p_volume,
    coalesce(p_authors, '{}'), p_publisher,
    p_published_on, p_cover_url, p_source, v_uid
  )
  on conflict (isbn) do nothing;

  select * into v_edition from public.editions where isbn = v_isbn;
  return v_edition;
end;
$$;

-- ---------------------------------------------------------------------------
-- Création d'éditions en masse (import). Une ligne :
--   { isbn, title, series, volume, authors[], publisher, published_on }
-- Les éditions déjà présentes sont conservées telles quelles. Tout ou rien : si le plafond
-- quotidien serait dépassé, rien n'est créé.
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

    if exists (select 1 from public.editions where isbn = v_isbn) then
      v_existing := v_existing + 1;
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

    -- Tome : entier de 1 à 999, sinon ignoré
    v_volume := null;
    if (v_row ->> 'volume') ~ '^[0-9]{1,3}$' and (v_row ->> 'volume')::int between 1 and 999 then
      v_volume := (v_row ->> 'volume')::int;
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
      isbn, title, series_id, volume, authors, publisher, published_on, source, created_by
    )
    values (
      v_isbn, v_title, v_series_id, v_volume, v_authors,
      nullif(left(btrim(coalesce(v_row ->> 'publisher', '')), 200), ''),
      v_date, 'import', v_uid
    )
    on conflict (isbn) do nothing;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing, 'invalid', v_invalid);
end;
$$;

revoke execute on function public.import_editions(jsonb) from public, anon, authenticated;
grant execute on function public.import_editions(jsonb) to authenticated;
