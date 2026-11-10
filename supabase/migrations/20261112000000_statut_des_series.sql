-- Statut de publication des séries (en cours / terminée).
-- Le statut partagé est écrit par le job (d'après la BnF) ou à la main par l'administrateur.
-- Chaque utilisateur peut le corriger pour lui-même : ce choix prime sur le statut partagé.

alter table public.series
  add column publication_status text
    check (publication_status in ('ongoing', 'finished'));

comment on column public.series.publication_status is
  'ongoing : en cours ; finished : terminée (plus de tome à paraître) ; null : inconnu';

alter table public.user_series_settings
  add column status_override text
    check (status_override in ('ongoing', 'finished'));

comment on column public.user_series_settings.status_override is
  'Statut choisi par l''utilisateur pour cette série (prioritaire sur series.publication_status)';
