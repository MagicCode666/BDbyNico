-- Le journal d'administration n'affiche plus les lignes des albums de test de scripts/rls-check.mjs
-- (ISBN 97899999999…) : elles n'appellent aucune action et s'ajoutent à chaque exécution du contrôle.

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
  where c.isbn not like '97899999999%'   -- albums de test (scripts/rls-check.mjs) : rien à valider
    and (p_status is null or c.status = p_status)
    and (p_user is null or c.user_id = p_user)
    and (p_origin is null or c.origin = p_origin)
    and (not p_hide_job or c.origin <> 'job')
    and (p_before is null or c.id < p_before)
  order by c.id desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;
