-- Partage de collection : réglages de visibilité et vue publique enrichie.
-- Le lien (jeton de 144 bits) et l'interrupteur share_enabled existent déjà ; on ajoute :
--   share_wishes      les envies sont visibles (par défaut oui)
--   share_dedications les dédicaces sont signalées (par défaut non)
-- Jamais publics : prix, état, notes, dates d'achat, nom du dédicaceur, albums en attente de validation.

alter table public.profiles
  add column share_wishes boolean not null default true,
  add column share_dedications boolean not null default false;

grant update (pseudo, share_enabled, share_wishes, share_dedications)
  on public.profiles to authenticated;

drop function public.get_shared_collection(text);

create function public.get_shared_collection(p_token text)
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
  read boolean,
  dedicated boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.pseudo, e.isbn, e.title, s.id, s.name, s.total_volumes, s.publication_status,
         s.starts_at_zero, e.volume, e.volume_from, e.volume_to, e.kind, e.authors, e.cover_url,
         c.status, c.read, (p.share_dedications and c.dedication is not null)
  from public.profiles p
  join public.collection_items c on c.user_id = p.id
  join public.editions e on e.isbn = c.isbn
  left join public.series s on s.id = e.series_id
  where p.share_token = p_token
    and p.share_enabled
    and e.review_status <> 'pending'
    and (c.status = 'owned' or p.share_wishes)
  order by s.name nulls last, e.volume nulls last, e.title;
$$;

revoke execute on function public.get_shared_collection(text) from public, anon, authenticated;
grant execute on function public.get_shared_collection(text) to anon, authenticated;
