-- Recherche globale : séries, albums et auteurs du catalogue, en une seule requête.
--
-- Tolérante aux accents et à la casse ; tous les mots saisis doivent se retrouver (dans le titre,
-- le nom de la série ou les auteurs) ; un ISBN complet trouve l'album exact. Elle s'exécute avec
-- les droits de l'appelant : les albums en attente d'un autre utilisateur restent invisibles, et le
-- statut « possédé / envie » ne renvoie que les albums de sa propre collection.

create extension if not exists pg_trgm with schema extensions;

-- Texte comparable : minuscules, sans accents. unaccent() est marquée « stable » par PostgreSQL
-- alors que son dictionnaire ne change pas : on la déclare immuable pour pouvoir l'indexer.
create or replace function public.norm_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent(p_text));
$$;

create index series_name_trgm_idx on public.series using gin (name_key extensions.gin_trgm_ops);
create index editions_title_trgm_idx
  on public.editions using gin (public.norm_text(title) extensions.gin_trgm_ops);

create or replace function public.search_catalogue(p_query text, p_limit int default 8)
returns table (
  kind text,
  ref text,
  label text,
  detail text,
  cover_url text,
  series_id uuid,
  isbn text,
  my_status text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text := public.norm_text(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9Xx]', '', 'g');
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 30);
  v_pats text[];
begin
  if char_length(v_text) < 2 then
    return;
  end if;
  -- Motifs LIKE : « % » et « _ » saisis par l'utilisateur sont des caractères ordinaires, pas des
  -- jokers (sinon « %% » ferait remonter tout le catalogue)
  v_pats := array(
    select '%' || replace(replace(replace(w, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
    from unnest(regexp_split_to_array(v_text, '\s+')) as w
    where w <> ''
  );

  -- Séries
  return query
  select 'serie'::text, s.id::text, s.name,
         format(
           '%s album(s) · %s possédé(s)',
           (select count(*) from public.editions e where e.series_id = s.id),
           (select count(*) from public.collection_items c
              join public.editions e on e.isbn = c.isbn
              where e.series_id = s.id and c.status = 'owned')
         ),
         (select e.cover_url from public.editions e
            where e.series_id = s.id and e.cover_url is not null
            order by e.volume nulls last limit 1),
         s.id, null::text, null::text
  from public.series s
  where s.name_key like all (v_pats)
  order by (s.name_key like v_text || '%') desc, extensions.similarity(s.name_key, v_text) desc,
           s.name_key
  limit v_limit;

  -- Albums (titre, série et auteurs ensemble ; ou ISBN exact)
  return query
  select 'album'::text, e.isbn, e.title,
         concat_ws(' · ', s.name || case when e.volume is not null then ' T' || e.volume end,
                   nullif(array_to_string(e.authors, ', '), '')),
         e.cover_url, e.series_id, e.isbn,
         (select c.status from public.collection_items c where c.isbn = e.isbn limit 1)
  from public.editions e
  left join public.series s on s.id = e.series_id
  where (char_length(v_digits) >= 10 and e.isbn = v_digits)
     or public.norm_text(concat_ws(' ', e.title, s.name, array_to_string(e.authors, ' ')))
        like all (v_pats)
  order by (e.isbn = v_digits) desc,
           exists (select 1 from public.collection_items c where c.isbn = e.isbn) desc,
           (public.norm_text(e.title) like v_text || '%') desc,
           s.name nulls last, e.volume nulls last, e.title
  limit v_limit;

  -- Auteurs
  return query
  select 'auteur'::text, a.name, a.name, format('%s album(s)', count(*)),
         null::text, null::uuid, null::text, null::text
  from (
    select unnest(e.authors) as name from public.editions e
  ) a
  where public.norm_text(a.name) like all (v_pats)
  group by a.name
  order by count(*) desc, a.name
  limit v_limit;
end;
$$;

revoke execute on function public.norm_text(text), public.search_catalogue(text, int)
  from public, anon, authenticated;
grant execute on function public.norm_text(text), public.search_catalogue(text, int)
  to authenticated;
