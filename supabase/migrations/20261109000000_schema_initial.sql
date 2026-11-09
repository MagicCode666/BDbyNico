-- BDbyNico : schéma initial
-- Catalogue partagé (series, editions) + données privées (profiles, collection_items)

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Valide un ISBN-13 (13 chiffres + clé de contrôle)
create or replace function public.is_valid_isbn13(p_isbn text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  total int := 0;
  i int;
begin
  if p_isbn is null or p_isbn !~ '^[0-9]{13}$' then
    return false;
  end if;
  for i in 1..12 loop
    total := total + substr(p_isbn, i, 1)::int * (case when i % 2 = 1 then 1 else 3 end);
  end loop;
  return (10 - total % 10) % 10 = substr(p_isbn, 13, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue partagé
-- ---------------------------------------------------------------------------

create table public.series (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  -- nom normalisé (minuscules, sans accents) pour l'unicité
  name_key text not null unique,
  total_volumes int check (total_volumes is null or total_volumes > 0),
  created_at timestamptz not null default now()
);

create or replace function public.series_set_name_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.name_key := lower(extensions.unaccent(new.name));
  return new;
end;
$$;

create trigger series_name_key
  before insert or update of name on public.series
  for each row execute function public.series_set_name_key();

create table public.editions (
  isbn text primary key check (public.is_valid_isbn13(isbn)),
  title text not null check (char_length(title) between 1 and 300),
  series_id uuid references public.series (id) on delete set null,
  volume int check (volume is null or volume >= 0),
  authors text[] not null default '{}',
  publisher text,
  published_on date,
  cover_url text check (cover_url is null or cover_url ~ '^https?://'),
  source text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index editions_series_id_idx on public.editions (series_id);
create index editions_created_by_idx on public.editions (created_by, created_at);

-- ---------------------------------------------------------------------------
-- Données privées
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 50),
  share_enabled boolean not null default false,
  -- jeton de partage : 18 octets aléatoires = 144 bits
  share_token text not null unique
    default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  isbn text not null references public.editions (isbn),
  status text not null check (status in ('owned', 'wanted')),
  read boolean not null default false,
  price numeric(8, 2) check (price is null or price >= 0),
  condition text check (condition is null or char_length(condition) <= 50),
  notes text check (notes is null or char_length(notes) <= 2000),
  acquired_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, isbn)
);

create index collection_items_isbn_idx on public.collection_items (isbn);

create trigger collection_items_updated_at
  before update on public.collection_items
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, pseudo)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'pseudo'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'lecteur'
      ),
      50
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sécurité (RLS)
-- ---------------------------------------------------------------------------

alter table public.series enable row level security;
alter table public.editions enable row level security;
alter table public.profiles enable row level security;
alter table public.collection_items enable row level security;

-- Catalogue : lecture seule pour les utilisateurs connectés.
-- Les ajouts passent uniquement par add_edition().
create policy "catalogue séries lisible" on public.series
  for select to authenticated using (true);

create policy "catalogue éditions lisible" on public.editions
  for select to authenticated using (true);

-- Profil : chacun lit et modifie le sien (jamais le jeton directement)
create policy "profil: lecture du sien" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profil: modification du sien" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (pseudo, share_enabled) on public.profiles to authenticated;

-- Collection : strictement privée
create policy "collection: lecture de la sienne" on public.collection_items
  for select to authenticated using (user_id = (select auth.uid()));

create policy "collection: ajout à la sienne" on public.collection_items
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "collection: modification de la sienne" on public.collection_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "collection: suppression de la sienne" on public.collection_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- Aucun accès direct pour les anonymes
revoke all on public.series, public.editions, public.profiles, public.collection_items
  from anon;
revoke insert, update, delete on public.series, public.editions from authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions exposées
-- ---------------------------------------------------------------------------

-- Ajoute (ou retrouve) une édition dans le catalogue partagé.
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
  ) >= 200 then
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

-- Vue publique d'une collection partagée (seule fonction ouverte aux anonymes).
create or replace function public.get_shared_collection(p_token text)
returns table (
  pseudo text,
  isbn text,
  title text,
  series_name text,
  volume int,
  authors text[],
  cover_url text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.pseudo, e.isbn, e.title, s.name, e.volume, e.authors, e.cover_url, c.status
  from public.profiles p
  join public.collection_items c on c.user_id = p.id
  join public.editions e on e.isbn = c.isbn
  left join public.series s on s.id = e.series_id
  where p.share_token = p_token
    and p.share_enabled
  order by s.name nulls last, e.volume nulls last, e.title;
$$;

-- Génère un nouveau jeton de partage (invalide l'ancien lien).
create or replace function public.regenerate_share_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  update public.profiles set share_token = v_token where id = auth.uid();
  return v_token;
end;
$$;

-- Supprime le compte de l'utilisateur et toutes ses données privées (cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Droits d'exécution : fermé par défaut, ouvert au cas par cas
revoke execute on function
  public.add_edition(text, text, text, int, text[], text, date, text, text),
  public.get_shared_collection(text),
  public.regenerate_share_token(),
  public.delete_my_account(),
  public.handle_new_user(),
  public.series_set_name_key(),
  public.set_updated_at()
  from public, anon, authenticated;

grant execute on function
  public.add_edition(text, text, text, int, text[], text, date, text, text),
  public.regenerate_share_token(),
  public.delete_my_account()
  to authenticated;

grant execute on function public.get_shared_collection(text) to anon, authenticated;
