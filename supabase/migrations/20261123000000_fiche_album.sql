-- Fiche album : résumé, pagination, format, prix public et langue, tels que la BnF les donne.
--
-- Ces champs descriptifs sont renseignés par le job nocturne (clé de service) et, au fil de l'eau,
-- par l'application quand un utilisateur ouvre un album qu'elle ne connaît pas encore en détail.
-- Dans les deux cas on ne fait que COMPLÉTER : une valeur déjà présente n'est jamais écrasée
-- (« fill only »), ce qui évite tout vandalisme sur le catalogue commun et le besoin de journal.

alter table public.editions
  add column summary text check (char_length(summary) <= 4000),
  add column pages int check (pages between 1 and 9999),
  add column format_cm int check (format_cm between 1 and 99),
  add column public_price numeric(6, 2) check (public_price >= 0),
  add column language text check (language ~ '^[a-z]{3}$'),
  add column details_checked_at timestamptz;

comment on column public.editions.summary is 'Résumé de la notice BnF (zone 330)';
comment on column public.editions.pages is 'Nombre de pages (zone 215 $a)';
comment on column public.editions.format_cm is 'Hauteur en centimètres (zone 215 $d)';
comment on column public.editions.public_price is 'Prix public en euros (zone 010 $d)';
comment on column public.editions.language is 'Code de langue ISO 639-2 (zone 101)';
comment on column public.editions.details_checked_at is
  'Dernière interrogation de la BnF pour ces champs, même sans résultat (évite de la relancer sans cesse)';

create index editions_details_unchecked_idx on public.editions (created_at)
  where details_checked_at is null;

create or replace function public.fill_edition_details(
  p_isbn text,
  p_summary text default null,
  p_pages int default null,
  p_format_cm int default null,
  p_public_price numeric default null,
  p_language text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  -- Valeurs hors limites : ignorées plutôt que de faire échouer la fiche
  update public.editions e
  set summary = coalesce(e.summary, nullif(left(btrim(p_summary), 4000), '')),
      pages = coalesce(e.pages, case when p_pages between 1 and 9999 then p_pages end),
      format_cm = coalesce(e.format_cm, case when p_format_cm between 1 and 99 then p_format_cm end),
      public_price = coalesce(
        e.public_price,
        case when p_public_price >= 0 and p_public_price < 10000 then p_public_price end
      ),
      language = coalesce(e.language, case when p_language ~ '^[a-z]{3}$' then p_language end),
      details_checked_at = now()
  where e.isbn = p_isbn
    -- une édition en attente n'est modifiable que par son auteur ou un modérateur
    and (e.review_status = 'approved' or e.created_by = auth.uid() or public.is_moderator());
end;
$$;

revoke execute on function public.fill_edition_details(text, text, int, int, numeric, text)
  from public, anon;
grant execute on function public.fill_edition_details(text, text, int, int, numeric, text)
  to authenticated;
