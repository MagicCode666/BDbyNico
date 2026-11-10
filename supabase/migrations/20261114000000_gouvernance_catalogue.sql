-- Gouvernance du catalogue partagé : rôles, niveau de contribution, journal des changements,
-- annulation (revert) et validation des propositions.
--
-- Principe : chaque modification du catalogue commun est journalisée. Un utilisateur « collection
-- seule » ne modifie rien directement : ses changements sont mis « en attente » jusqu'à
-- validation par un modérateur. Les droits (rôle, niveau) ne se règlent que par SQL ou par les
-- fonctions réservées à l'administrateur, jamais depuis un compte ordinaire.

-- ---------------------------------------------------------------------------
-- Rôles et niveau de contribution
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column role text not null default 'user'
    check (role in ('user', 'moderator', 'admin')),
  add column contribution text not null default 'full'
    check (contribution in ('full', 'collection_only'));

comment on column public.profiles.role is
  'user : ordinaire ; moderator : valide et annule ; admin : moderator + gère les utilisateurs';
comment on column public.profiles.contribution is
  'full : modifie le catalogue (journalisé) ; collection_only : ses changements attendent validation';

-- Les utilisateurs ne modifient que pseudo et partage (droit déjà limité par colonnes) : ni le
-- rôle ni le niveau ne sont modifiables depuis un compte ordinaire.

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('moderator', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_moderator(), public.is_admin() from public, anon;
grant execute on function public.is_moderator(), public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Éditions : statut de validation et verrou de couverture
-- ---------------------------------------------------------------------------

alter table public.editions
  add column review_status text not null default 'approved'
    check (review_status in ('approved', 'pending')),
  add column cover_locked boolean not null default false;

comment on column public.editions.review_status is
  'pending : créée par un utilisateur « collection seule », visible de lui et des modérateurs seulement';
comment on column public.editions.cover_locked is
  'true : couverture choisie à la main, le job ne la remplace plus';

create index editions_pending_idx on public.editions (created_at) where review_status = 'pending';

-- Une édition en attente n'est visible que de son auteur et des modérateurs.
drop policy "catalogue éditions lisible" on public.editions;
create policy "catalogue éditions lisibles" on public.editions
  for select to authenticated
  using (
    review_status = 'approved'
    or created_by = (select auth.uid())
    or (select public.is_moderator())
  );

-- ---------------------------------------------------------------------------
-- Journal des changements
-- ---------------------------------------------------------------------------

create table public.catalogue_changes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- null : modification faite par le job (clé de service)
  user_id uuid references auth.users (id) on delete set null,
  origin text not null check (origin in ('user', 'import', 'job', 'admin')),
  kind text not null check (kind in ('create', 'cover')),
  -- pas de clé étrangère : le journal survit à la suppression d'une édition refusée
  isbn text not null,
  old_value text,
  new_value text,
  status text not null default 'applied'
    check (status in ('applied', 'pending', 'rejected', 'reverted')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  -- pour une ligne qui en annule une autre
  reverts_id bigint references public.catalogue_changes (id) on delete set null
);

create index catalogue_changes_created_idx on public.catalogue_changes (created_at desc, id desc);
create index catalogue_changes_user_idx on public.catalogue_changes (user_id, created_at desc);
create index catalogue_changes_isbn_idx on public.catalogue_changes (isbn);
create index catalogue_changes_pending_idx on public.catalogue_changes (id) where status = 'pending';

alter table public.catalogue_changes enable row level security;

-- Chacun lit ses propres lignes (ses propositions), les modérateurs lisent tout.
create policy "journal: lecture des siennes ou modérateur" on public.catalogue_changes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));

revoke all on public.catalogue_changes from anon;
revoke insert, update, delete on public.catalogue_changes from authenticated;

-- ---------------------------------------------------------------------------
-- Journalisation automatique : création d'une édition et remplacement d'une couverture.
-- Les fonctions ci-dessous écrivent elles-mêmes leur ligne et coupent ce déclencheur
-- (réglage local à la transaction `bdbynico.skip_log`).
-- Les créations par import ou par le job ne sont pas journalisées une à une (trop de bruit) :
-- elles restent traçables par `editions.created_by` et `editions.created_at`.
-- ---------------------------------------------------------------------------

create or replace function public.log_edition_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_origin text := case when (select auth.uid()) is null then 'job' else 'user' end;
begin
  if coalesce(current_setting('bdbynico.skip_log', true), '') = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.source, '') in ('import', 'bnf') then
      return new;
    end if;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, new_value, status)
    values (
      coalesce(new.created_by, v_uid), v_origin, 'create', new.isbn, new.title,
      case when new.review_status = 'pending' then 'pending' else 'applied' end
    );
  else
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, v_origin, 'cover', new.isbn, old.cover_url, new.cover_url);
  end if;
  return new;
end;
$$;

create trigger editions_log_insert
  after insert on public.editions
  for each row execute function public.log_edition_changes();

create trigger editions_log_cover
  after update of cover_url on public.editions
  for each row
  when (old.cover_url is not null and new.cover_url is distinct from old.cover_url)
  execute function public.log_edition_changes();

revoke execute on function public.log_edition_changes() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Adresses de couverture autorisées (Open Library, Amazon ou BnF, construites à partir de l'ISBN)
-- ---------------------------------------------------------------------------

create or replace function public.is_allowed_cover_url(p_isbn text, p_cover_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_isbn10 text := public.isbn13_to_isbn10(p_isbn);
begin
  return p_cover_url = format('https://covers.openlibrary.org/b/isbn/%s-L.jpg', p_isbn)
    or (
      v_isbn10 is not null
      and p_cover_url =
        format('https://images-na.ssl-images-amazon.com/images/P/%s.01.LZZZZZZZ.jpg', v_isbn10)
    )
    or p_cover_url ~
      '^https://catalogue\.bnf\.fr/couverture\?&appName=NE&idArk=ark:/12148/cb[0-9a-z]{6,12}&couverture=1$';
end;
$$;

revoke execute on function public.is_allowed_cover_url(text, text) from public, anon, authenticated;

-- Renseigne automatiquement la couverture d'une édition qui n'en a pas (jamais écrasée, jamais
-- si elle a été verrouillée par un choix manuel).
create or replace function public.set_edition_cover(p_isbn text, p_cover_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if not public.is_allowed_cover_url(p_isbn, p_cover_url) then
    raise exception 'Adresse de couverture non autorisée' using errcode = '22023';
  end if;

  update public.editions
  set cover_url = p_cover_url
  where isbn = p_isbn
    and cover_url is null
    and not cover_locked
    and (review_status = 'approved' or created_by = auth.uid());
end;
$$;

revoke execute on function public.set_edition_cover(text, text) from public, anon, authenticated;
grant execute on function public.set_edition_cover(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ajout d'une édition : un utilisateur « collection seule » crée une édition en attente
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
  v_status text := 'approved';
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if not public.is_valid_isbn13(v_isbn) then
    raise exception 'ISBN-13 invalide' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where isbn = v_isbn;
  if found then
    if v_edition.review_status = 'pending'
       and v_edition.created_by is distinct from v_uid
       and not public.is_moderator() then
      raise exception 'Cet album est en attente de validation' using errcode = '55000';
    end if;
    return v_edition;
  end if;

  -- Limite quotidienne contre les abus
  if (
    select count(*) from public.editions
    where created_by = v_uid and created_at > now() - interval '1 day'
  ) >= 500 then
    raise exception 'Limite quotidienne d''ajouts atteinte' using errcode = '54000';
  end if;

  if exists (
    select 1 from public.profiles where id = v_uid and contribution = 'collection_only'
  ) then
    v_status := 'pending';
  end if;

  if nullif(btrim(p_series_name), '') is not null then
    insert into public.series (name)
    values (btrim(p_series_name))
    on conflict (name_key) do update set name = public.series.name
    returning id into v_series_id;
  end if;

  insert into public.editions (
    isbn, title, series_id, volume, authors, publisher,
    published_on, cover_url, source, created_by, review_status
  )
  values (
    v_isbn, btrim(p_title), v_series_id, p_volume,
    coalesce(p_authors, '{}'), p_publisher,
    p_published_on, p_cover_url, p_source, v_uid, v_status
  )
  on conflict (isbn) do nothing;

  select * into v_edition from public.editions where isbn = v_isbn;
  return v_edition;
end;
$$;

-- Création d'éditions en masse (import) : mêmes règles, en attente pour « collection seule ».
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
      isbn, title, series_id, volume, authors, publisher, published_on,
      source, created_by, review_status
    )
    values (
      v_isbn, v_title, v_series_id, v_volume, v_authors,
      nullif(left(btrim(coalesce(v_row ->> 'publisher', '')), 200), ''),
      v_date, 'import', v_uid, v_status
    )
    on conflict (isbn) do nothing;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing, 'invalid', v_invalid);
end;
$$;

-- Les droits d'exécution sont conservés par « create or replace » ; on les réaffirme.
revoke execute on function public.add_edition(text, text, text, int, text[], text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.add_edition(text, text, text, int, text[], text, date, text, text)
  to authenticated;
revoke execute on function public.import_editions(jsonb) from public, anon, authenticated;
grant execute on function public.import_editions(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Signalement d'une mauvaise couverture : choix partagé par tous.
--   - seul un possesseur de l'album (ou un modérateur) peut le faire ;
--   - l'adresse doit venir d'une source connue ; null = « aucune couverture » ;
--   - utilisateur « collection seule » : la proposition est mise en attente ;
--   - le choix verrouille la couverture (le job ne la remplace plus).
-- Renvoie 'applied', 'pending' ou 'unchanged'.
-- ---------------------------------------------------------------------------

create or replace function public.report_cover(p_isbn text, p_cover_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
  v_moderator boolean;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  v_moderator := public.is_moderator();

  select * into v_edition from public.editions where isbn = p_isbn;
  if not found
     or (v_edition.review_status = 'pending'
         and v_edition.created_by is distinct from v_uid
         and not v_moderator) then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;

  if not v_moderator and not exists (
    select 1 from public.collection_items where user_id = v_uid and isbn = p_isbn
  ) then
    raise exception 'Seuls les possesseurs de cet album peuvent signaler sa couverture'
      using errcode = '42501';
  end if;

  if p_cover_url is not null and not public.is_allowed_cover_url(p_isbn, p_cover_url) then
    raise exception 'Adresse de couverture non autorisée' using errcode = '22023';
  end if;

  if p_cover_url is not distinct from v_edition.cover_url then
    return 'unchanged';
  end if;

  -- Plafond quotidien de signalements
  if not v_moderator and (
    select count(*) from public.catalogue_changes
    where user_id = v_uid and kind = 'cover' and origin = 'user'
      and created_at > now() - interval '1 day'
  ) >= 30 then
    raise exception 'Limite quotidienne de signalements atteinte' using errcode = '54000';
  end if;

  if not v_moderator and exists (
    select 1 from public.profiles where id = v_uid and contribution = 'collection_only'
  ) then
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value, status)
    values (v_uid, 'user', 'cover', p_isbn, v_edition.cover_url, p_cover_url, 'pending');
    return 'pending';
  end if;

  perform set_config('bdbynico.skip_log', '1', true);
  update public.editions
  set cover_url = p_cover_url, cover_locked = true
  where isbn = p_isbn;
  perform set_config('bdbynico.skip_log', '0', true);

  insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
  values (
    v_uid, case when v_moderator then 'admin' else 'user' end, 'cover', p_isbn,
    v_edition.cover_url, p_cover_url
  );
  return 'applied';
end;
$$;

revoke execute on function public.report_cover(text, text) from public, anon, authenticated;
grant execute on function public.report_cover(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Validation ou refus d'une proposition en attente (modérateurs)
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

revoke execute on function public.review_change(bigint, boolean) from public, anon, authenticated;
grant execute on function public.review_change(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation d'un changement appliqué (modérateurs)
--   - couverture : rétablit l'ancienne valeur, à condition qu'elle n'ait pas changé depuis ;
--     la couverture est ensuite verrouillée pour que le job ne la remplace plus ;
--   - création : supprime l'édition, sauf si d'autres utilisateurs la possèdent.
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
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'applied' then
    raise exception 'Changement introuvable ou non annulable' using errcode = '22023';
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
-- Consultation du journal (modérateurs) : lignes enrichies du pseudo et de l'album
-- ---------------------------------------------------------------------------

create or replace function public.list_catalogue_changes(
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
         e.title, s.name, e.volume, c.old_value, c.new_value, c.status,
         r.pseudo, c.reviewed_at, c.reverts_id, e.cover_url
  from public.catalogue_changes c
  left join public.profiles p on p.id = c.user_id
  left join public.profiles r on r.id = c.reviewed_by
  left join public.editions e on e.isbn = c.isbn
  left join public.series s on s.id = e.series_id
  where (p_status is null or c.status = p_status)
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

-- ---------------------------------------------------------------------------
-- Gestion des utilisateurs (administrateur) : liste et niveau de contribution
-- ---------------------------------------------------------------------------

create or replace function public.list_users_admin()
returns table (
  id uuid,
  pseudo text,
  role text,
  contribution text,
  created_at timestamptz,
  collection_count bigint,
  change_count bigint,
  pending_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;

  return query
  select p.id, p.pseudo, p.role, p.contribution, p.created_at,
         (select count(*) from public.collection_items c where c.user_id = p.id),
         (select count(*) from public.catalogue_changes ch where ch.user_id = p.id),
         (select count(*) from public.catalogue_changes ch
            where ch.user_id = p.id and ch.status = 'pending')
  from public.profiles p
  order by p.created_at;
end;
$$;

create or replace function public.set_contribution_level(p_user uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  if p_level not in ('full', 'collection_only') then
    raise exception 'Niveau invalide' using errcode = '22023';
  end if;
  update public.profiles set contribution = p_level where id = p_user;
  if not found then
    raise exception 'Utilisateur introuvable' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.list_users_admin(), public.set_contribution_level(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_users_admin(), public.set_contribution_level(uuid, text)
  to authenticated;
