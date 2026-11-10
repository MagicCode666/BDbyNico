-- Outils de correction des séries pour les modérateurs : renommer, fixer le total partagé et le
-- statut de publication. Chaque changement est journalisé et peut être annulé. Un total ou un statut
-- fixé à la main n'est plus modifié par le job nocturne.

alter table public.series
  add column status_source text not null default 'auto'
    check (status_source in ('auto', 'manual'));

comment on column public.series.status_source is
  'auto : statut lu à la BnF par le job ; manual : fixé par un modérateur, le job n''y touche plus';

-- Le journal peut maintenant porter sur une série : album (isbn) ou série (series_id)
alter table public.catalogue_changes
  add column series_id uuid,
  alter column isbn drop not null,
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check
    check (kind in ('create', 'cover', 'series_name', 'series_total', 'series_status')),
  add constraint catalogue_changes_target_check check (
    (kind in ('create', 'cover') and isbn is not null)
    or (kind like 'series\_%' and series_id is not null)
  );

create index catalogue_changes_series_idx on public.catalogue_changes (series_id)
  where series_id is not null;

-- ---------------------------------------------------------------------------
-- Renommer une série
-- ---------------------------------------------------------------------------

create or replace function public.rename_series(p_series uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if char_length(v_new) not between 1 and 200 then
    raise exception 'Nom de série invalide (1 à 200 caractères)' using errcode = '22023';
  end if;

  select name into v_old from public.series where id = p_series for update;
  if not found then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;
  if v_new = v_old then
    return;
  end if;
  if exists (
    select 1 from public.series
    where name_key = lower(extensions.unaccent(v_new)) and id <> p_series
  ) then
    raise exception 'Une série porte déjà ce nom' using errcode = '23505';
  end if;

  update public.series set name = v_new where id = p_series;
  insert into public.catalogue_changes (user_id, origin, kind, series_id, old_value, new_value)
  values (v_uid, 'admin', 'series_name', p_series, v_old, v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Total partagé : une valeur le fixe à la main (le job n'y touche plus), null le rend au job
-- ---------------------------------------------------------------------------

create or replace function public.set_series_total(p_series uuid, p_total int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_source text;
  v_new_total int;
  v_new_source text;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if p_total is not null and p_total not between 1 and 999 then
    raise exception 'Le total doit être compris entre 1 et 999' using errcode = '22023';
  end if;

  select total_volumes, total_source into v_total, v_source
  from public.series where id = p_series for update;
  if not found then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;

  if p_total is null then
    v_new_source := 'auto';
    v_new_total := v_total;
  else
    v_new_source := 'manual';
    v_new_total := p_total;
  end if;
  if v_new_source = v_source and v_new_total is not distinct from v_total then
    return;
  end if;

  update public.series
  set total_volumes = v_new_total, total_source = v_new_source
  where id = p_series;
  insert into public.catalogue_changes (user_id, origin, kind, series_id, old_value, new_value)
  values (
    v_uid, 'admin', 'series_total', p_series,
    v_source || ':' || coalesce(v_total::text, ''),
    v_new_source || ':' || coalesce(v_new_total::text, '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Statut de publication partagé : 'ongoing', 'finished', ou null pour le rendre au job
-- ---------------------------------------------------------------------------

create or replace function public.set_series_status(p_series uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_source text;
  v_new_status text;
  v_new_source text;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('ongoing', 'finished') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;

  select publication_status, status_source into v_status, v_source
  from public.series where id = p_series for update;
  if not found then
    raise exception 'Série introuvable' using errcode = '22023';
  end if;

  if p_status is null then
    v_new_source := 'auto';
    v_new_status := v_status;
  else
    v_new_source := 'manual';
    v_new_status := p_status;
  end if;
  if v_new_source = v_source and v_new_status is not distinct from v_status then
    return;
  end if;

  update public.series
  set publication_status = v_new_status, status_source = v_new_source
  where id = p_series;
  insert into public.catalogue_changes (user_id, origin, kind, series_id, old_value, new_value)
  values (
    v_uid, 'admin', 'series_status', p_series,
    v_source || ':' || coalesce(v_status, ''),
    v_new_source || ':' || coalesce(v_new_status, '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Recherche de séries pour l'administration
-- ---------------------------------------------------------------------------

create or replace function public.list_series_admin(p_query text default null, p_limit int default 30)
returns table (
  id uuid,
  name text,
  total_volumes int,
  total_source text,
  publication_status text,
  status_source text,
  edition_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, s.total_volumes, s.total_source, s.publication_status, s.status_source,
         (select count(*) from public.editions e where e.series_id = s.id)
  from public.series s
  where p_query is null
     or btrim(p_query) = ''
     or s.name_key like '%' || lower(extensions.unaccent(btrim(p_query))) || '%'
  order by s.name_key
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke execute on function
  public.rename_series(uuid, text),
  public.set_series_total(uuid, int),
  public.set_series_status(uuid, text),
  public.list_series_admin(text, int)
  from public, anon, authenticated;
grant execute on function
  public.rename_series(uuid, text),
  public.set_series_total(uuid, int),
  public.set_series_status(uuid, text),
  public.list_series_admin(text, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation : prend en charge les changements de série
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

-- ---------------------------------------------------------------------------
-- Journal : colonne series_id en plus (la fonction change de signature, on la recrée)
-- ---------------------------------------------------------------------------

drop function public.list_catalogue_changes(text, uuid, text, boolean, int, bigint);

create function public.list_catalogue_changes(
  p_status text default null,
  p_user uuid default null,
  p_origin text default null,
  p_hide_job boolean default false,
  p_limit int default 50,
  p_before bigint default null
)
returns table (
  id bigint,
  created_at timestamptz,
  user_id uuid,
  pseudo text,
  origin text,
  kind text,
  isbn text,
  series_id uuid,
  title text,
  series_name text,
  volume int,
  old_value text,
  new_value text,
  status text,
  reviewed_pseudo text,
  reviewed_at timestamptz,
  reverts_id bigint,
  current_cover text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  return query
  select c.id, c.created_at, c.user_id, p.pseudo, c.origin, c.kind, c.isbn,
         coalesce(e.series_id, c.series_id), e.title, s.name, e.volume, c.old_value, c.new_value, c.status,
         r.pseudo, c.reviewed_at, c.reverts_id, e.cover_url
  from public.catalogue_changes c
  left join public.profiles p on p.id = c.user_id
  left join public.profiles r on r.id = c.reviewed_by
  left join public.editions e on e.isbn = c.isbn
  left join public.series s on s.id = coalesce(e.series_id, c.series_id)
  where coalesce(c.isbn, '') not like '97899999999%'   -- albums de test (scripts/rls-check.mjs) : rien à valider
    and (p_status is null or c.status = p_status)
    and (p_user is null or c.user_id = p_user)
    and (p_origin is null or c.origin = p_origin)
    and (not p_hide_job or c.origin <> 'job')
    and (p_before is null or c.id < p_before)
  order by c.id desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke execute on function public.list_catalogue_changes(text, uuid, text, boolean, int, bigint)
  from public, anon, authenticated;
grant execute on function public.list_catalogue_changes(text, uuid, text, boolean, int, bigint)
  to authenticated;
