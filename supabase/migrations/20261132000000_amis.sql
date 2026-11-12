-- Amis : partager sa bibliothèque avec d'autres comptes, sans annuaire.
--
-- Une amitié se crée par une demande acceptée (demande par pseudo exact) ou par un lien
-- d'invitation personnel. Chaque ami voit ma bibliothèque tant que je ne coupe pas le partage pour
-- lui (un interrupteur par personne, par défaut ouvert). Les réglages « envies » et « dédicaces »
-- du profil s'appliquent aux amis comme au lien public.
-- Aucun accès direct aux tables : tout passe par des fonctions qui ne renvoient que le pseudo des
-- amis confirmés. Un refus ne prévient pas le demandeur (sa demande reste « en attente »).

create table public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  -- le demandeur voit-il la bibliothèque du destinataire ? et inversement
  requester_shares boolean not null default true,
  addressee_shares boolean not null default true,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- Une seule ligne par paire de comptes, quel que soit le sens
create unique index friendships_pair_idx
  on public.friendships (least(requester::text, addressee::text), greatest(requester::text, addressee::text));
create index friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- Lien d'invitation personnel (régénérable)
alter table public.profiles
  add column invite_token text not null default encode(extensions.gen_random_bytes(18), 'hex') unique;

create or replace function public.regenerate_invite_token()
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
  update public.profiles set invite_token = v_token where id = auth.uid();
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecture d'une bibliothèque : une seule requête, partagée par le lien public et les amis
-- ---------------------------------------------------------------------------

create or replace function public.collection_rows(p_owner uuid)
returns table (
  pseudo text,
  isbn text,
  title text,
  series_id uuid,
  series_name text,
  series_total int,
  series_status text,
  starts_at_zero boolean,
  volume int,
  volume_from int,
  volume_to int,
  kind text,
  authors text[],
  cover_url text,
  status text,
  dedicated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.pseudo, e.isbn, e.title, s.id, s.name, s.total_volumes, s.publication_status,
         s.starts_at_zero, e.volume, e.volume_from, e.volume_to, e.kind, e.authors, e.cover_url,
         c.status, (p.share_dedications and c.dedication is not null)
  from public.profiles p
  join public.collection_items c on c.user_id = p.id
  join public.editions e on e.isbn = c.isbn
  left join public.series s on s.id = e.series_id
  where p.id = p_owner
    and e.review_status <> 'pending'
    and (c.status = 'owned' or p.share_wishes)
  order by s.name nulls last, e.volume nulls last, e.title;
$$;

create or replace function public.get_shared_collection(p_token text)
returns table (
  pseudo text,
  isbn text,
  title text,
  series_id uuid,
  series_name text,
  series_total int,
  series_status text,
  starts_at_zero boolean,
  volume int,
  volume_from int,
  volume_to int,
  kind text,
  authors text[],
  cover_url text,
  status text,
  dedicated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.profiles p
  cross join lateral public.collection_rows(p.id) r
  where p.share_token = p_token and p.share_enabled;
$$;

-- p_viewer a-t-il le droit de voir la bibliothèque de p_owner ? (amis, et partage non coupé)
create or replace function public.friend_can_view(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = p_owner and f.addressee = p_viewer and f.requester_shares)
        or (f.addressee = p_owner and f.requester = p_viewer and f.addressee_shares))
  );
$$;

create or replace function public.get_friend_collection(p_friend uuid)
returns table (
  pseudo text,
  isbn text,
  title text,
  series_id uuid,
  series_name text,
  series_total int,
  series_status text,
  starts_at_zero boolean,
  volume int,
  volume_from int,
  volume_to int,
  kind text,
  authors text[],
  cover_url text,
  status text,
  dedicated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.collection_rows(p_friend) r
  where auth.uid() is not null and public.friend_can_view(auth.uid(), p_friend);
$$;

-- ---------------------------------------------------------------------------
-- Demandes et amitiés
-- ---------------------------------------------------------------------------

-- Demande par pseudo exact. Même réponse (aucune) que le pseudo existe ou non, pour ne pas révéler
-- qui est inscrit. Si l'autre personne m'avait déjà demandé (ou avait refusé), l'amitié se conclut.
create or replace function public.send_friend_request(p_pseudo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_row public.friendships;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if (
    select count(*) from public.friendships
    where requester = v_uid and created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'Limite quotidienne de demandes atteinte' using errcode = '54000';
  end if;

  select id into v_target from public.profiles
  where pseudo_key = lower(extensions.unaccent(btrim(p_pseudo)));
  if v_target is null or v_target = v_uid then
    return;
  end if;

  select * into v_row from public.friendships
  where (requester = v_uid and addressee = v_target) or (requester = v_target and addressee = v_uid);
  if found then
    if v_row.addressee = v_uid and v_row.status in ('pending', 'declined') then
      update public.friendships set status = 'accepted', responded_at = now()
      where requester = v_row.requester and addressee = v_row.addressee;
    end if;
    return;
  end if;
  insert into public.friendships (requester, addressee) values (v_uid, v_target);
end;
$$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where requester = p_requester and addressee = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.cancel_friend_request(p_addressee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from public.friendships
  where requester = auth.uid() and addressee = p_addressee and status in ('pending', 'declined');
end;
$$;

-- Lien d'invitation : l'amitié est conclue tout de suite (celui qui l'a donné a consenti).
-- Renvoie le pseudo de la personne qui invitait.
create or replace function public.accept_friend_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner public.profiles;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  select * into v_owner from public.profiles where invite_token = p_token;
  if not found then
    raise exception 'Lien d''invitation invalide' using errcode = '22023';
  end if;
  if v_owner.id = v_uid then
    raise exception 'C''est votre propre lien d''invitation' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.friendships
    where (requester = v_uid and addressee = v_owner.id)
       or (requester = v_owner.id and addressee = v_uid)
  ) then
    update public.friendships set status = 'accepted', responded_at = now()
    where (requester = v_uid and addressee = v_owner.id)
       or (requester = v_owner.id and addressee = v_uid);
  else
    insert into public.friendships (requester, addressee, status, responded_at)
    values (v_uid, v_owner.id, 'accepted', now());
  end if;
  return v_owner.pseudo;
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from public.friendships
  where (requester = auth.uid() and addressee = p_friend)
     or (requester = p_friend and addressee = auth.uid());
end;
$$;

-- Cette personne voit-elle ma bibliothèque ? (sans toucher à l'amitié)
create or replace function public.set_friend_sharing(p_friend uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  update public.friendships
  set requester_shares = case when requester = v_uid then p_share else requester_shares end,
      addressee_shares = case when addressee = v_uid then p_share else addressee_shares end
  where status = 'accepted'
    and ((requester = v_uid and addressee = p_friend) or (addressee = v_uid and requester = p_friend));
end;
$$;

create or replace function public.list_friends()
returns table (friend_id uuid, pseudo text, since timestamptz, i_share boolean, they_share boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.pseudo, f.responded_at,
         case when f.requester = auth.uid() then f.requester_shares else f.addressee_shares end,
         case when f.requester = auth.uid() then f.addressee_shares else f.requester_shares end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  order by lower(p.pseudo);
$$;

-- Demandes reçues (en attente) et envoyées (en attente : un refus ne se voit pas)
create or replace function public.list_friend_requests()
returns table (user_id uuid, pseudo text, direction text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.pseudo, 'in', f.created_at
  from public.friendships f join public.profiles p on p.id = f.requester
  where f.addressee = auth.uid() and f.status = 'pending'
  union all
  select p.id, p.pseudo, 'out', f.created_at
  from public.friendships f join public.profiles p on p.id = f.addressee
  where f.requester = auth.uid() and f.status in ('pending', 'declined')
  order by created_at desc;
$$;

create or replace function public.count_incoming_friend_requests()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.friendships
  where addressee = auth.uid() and status = 'pending';
$$;

revoke execute on function
  public.regenerate_invite_token(),
  public.collection_rows(uuid),
  public.get_shared_collection(text),
  public.friend_can_view(uuid, uuid),
  public.get_friend_collection(uuid),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid),
  public.accept_friend_invite(text),
  public.remove_friend(uuid),
  public.set_friend_sharing(uuid, boolean),
  public.list_friends(),
  public.list_friend_requests(),
  public.count_incoming_friend_requests()
  from public, anon, authenticated;

grant execute on function public.get_shared_collection(text) to anon, authenticated;
grant execute on function
  public.regenerate_invite_token(),
  public.get_friend_collection(uuid),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid),
  public.accept_friend_invite(text),
  public.remove_friend(uuid),
  public.set_friend_sharing(uuid, boolean),
  public.list_friends(),
  public.list_friend_requests(),
  public.count_incoming_friend_requests()
  to authenticated;
