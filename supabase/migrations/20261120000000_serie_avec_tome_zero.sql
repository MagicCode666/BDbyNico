-- Tome 0 (prologue) : quand le catalogue connaît un tome 0 d'une série, il compte dans la série pour
-- tous les utilisateurs (« 10 tomes » pour les tomes 0 à 9), même pour ceux qui ne le possèdent pas.
-- Chacun peut l'exclure de sa liste comme n'importe quel tome (réglage personnel existant).
--
-- La page Collection ne charge que les albums de l'utilisateur : elle ne peut pas deviner qu'une
-- série a un tome 0. On le mémorise donc sur la série, tenu à jour par un déclencheur.

alter table public.series
  add column starts_at_zero boolean not null default false;

comment on column public.series.starts_at_zero is
  'true : le catalogue connaît un tome 0 (album, approuvé) de cette série';

create or replace function public.refresh_series_zero(p_series uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.series s
  set starts_at_zero = z.has
  from (
    select exists (
      select 1 from public.editions e
      where e.series_id = p_series
        and e.volume = 0
        and e.kind = 'album'
        and e.review_status = 'approved'
    ) as has
  ) z
  where s.id = p_series
    and s.starts_at_zero is distinct from z.has;
$$;

create or replace function public.editions_refresh_series_zero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.series_id is not null then
    perform public.refresh_series_zero(old.series_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.series_id is not null then
    perform public.refresh_series_zero(new.series_id);
  end if;
  return null;
end;
$$;

create trigger editions_series_zero
  after insert or delete or update of volume, series_id, kind, review_status
  on public.editions
  for each row execute function public.editions_refresh_series_zero();

revoke execute on function
  public.refresh_series_zero(uuid),
  public.editions_refresh_series_zero()
  from public, anon, authenticated;

-- Séries qui ont déjà un tome 0 (par exemple « Le Crépuscule des Dieux »)
update public.series s
set starts_at_zero = true
where exists (
  select 1 from public.editions e
  where e.series_id = s.id and e.volume = 0 and e.kind = 'album' and e.review_status = 'approved'
);
