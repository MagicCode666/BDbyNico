-- Étape 5 : totaux de séries calculés par un job, réglages personnels par série.
-- Le total partagé (series.total_volumes) n'est écrit que par le job (clé service_role) ou à la
-- main par l'administrateur : aucun droit d'écriture pour les utilisateurs.

alter table public.series
  add column total_source text not null default 'auto'
    check (total_source in ('auto', 'manual')),
  add column total_checked_at timestamptz;

comment on column public.series.total_source is
  'auto : calculé par le job ; manual : fixé à la main, le job n''y touche plus';
comment on column public.series.total_checked_at is
  'Dernière vérification du total par le job (null = jamais vérifié)';

-- ---------------------------------------------------------------------------
-- Réglages personnels par série : tomes ignorés et total personnel
-- ---------------------------------------------------------------------------

create table public.user_series_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  -- tomes que l'utilisateur exclut de sa liste de tomes manquants
  ignored_volumes int[] not null default '{}'
    check (cardinality(ignored_volumes) <= 300),
  -- total personnel, prioritaire sur le total partagé
  total_override int check (total_override is null or total_override between 1 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create index user_series_settings_series_id_idx on public.user_series_settings (series_id);

create trigger user_series_settings_updated_at
  before update on public.user_series_settings
  for each row execute function public.set_updated_at();

alter table public.user_series_settings enable row level security;

create policy "réglages: lecture des siens" on public.user_series_settings
  for select to authenticated using (user_id = (select auth.uid()));

create policy "réglages: ajout aux siens" on public.user_series_settings
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "réglages: modification des siens" on public.user_series_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "réglages: suppression des siens" on public.user_series_settings
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_series_settings from anon;
