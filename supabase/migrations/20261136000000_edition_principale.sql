-- Édition principale d'un tome.
--
-- Un même numéro de tome peut avoir plusieurs éditions (rééditions, anciennes éditions, ISBN
-- différents). Jusqu'ici l'application affichait celle qui tombait en premier. Un modérateur peut
-- désormais désigner l'édition « principale » : c'est elle qui représente le tome dans la grille de
-- la série, la recherche et les tomes manquants. Les autres éditions restent visibles sur la fiche
-- de l'album. Sans choix, l'application garde sa règle actuelle (première édition, de préférence
-- avec couverture) : un tome qui n'a qu'une édition n'a donc rien à régler.
--
-- Le choix est journalisé (kind « edition_primary ») et annulable.

alter table public.editions add column is_primary boolean not null default false;

comment on column public.editions.is_primary is
  'Édition principale de son tome (une seule par série et par numéro, tomes ordinaires seulement)';

-- Une seule édition principale par tome
create unique index editions_one_primary_per_volume
  on public.editions (series_id, volume)
  where is_primary;

alter table public.editions
  add constraint editions_primary_check check (
    not is_primary or (kind = 'album' and series_id is not null and volume is not null)
  );

-- Une édition qui change de série, de numéro ou de type perd son statut de principale : le choix
-- n'a de sens que pour un tome précis (il se refait sur le nouveau numéro).
create or replace function public.editions_reset_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_primary and (
    new.series_id is distinct from old.series_id
    or new.volume is distinct from old.volume
    or new.kind is distinct from old.kind
  ) then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

create trigger editions_reset_primary
  before update of series_id, volume, kind on public.editions
  for each row execute function public.editions_reset_primary();

revoke execute on function public.editions_reset_primary() from public, anon, authenticated;

alter table public.catalogue_changes
  drop constraint catalogue_changes_kind_check,
  add constraint catalogue_changes_kind_check check (
    kind in ('create', 'cover', 'edition_kind', 'edition_title', 'edition_volume',
             'edition_authors', 'edition_publisher', 'edition_date', 'edition_series',
             'edition_isbn', 'edition_merge', 'edition_primary',
             'series_name', 'series_total', 'series_status', 'series_genres', 'series_merge')
  );

-- ---------------------------------------------------------------------------
-- Désigner (ou retirer) l'édition principale d'un tome. Réservé aux modérateurs.
--   p_primary = true : cette édition devient la principale de son tome (la précédente est
--                      remplacée) ;
--   p_primary = false : plus d'édition principale pour ce tome (retour à la règle automatique).
-- Journal : isbn = l'édition concernée ; old_value = ISBN de l'ancienne principale (vide si aucune) ;
--           new_value = ISBN de la nouvelle principale (vide quand on retire le choix).
-- Renvoie 'applied' ou 'unchanged'.
-- ---------------------------------------------------------------------------

create or replace function public.set_primary_edition(p_isbn text, p_primary boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
  v_previous text;
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_edition from public.editions where isbn = p_isbn for update;
  if not found then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;
  if v_edition.kind <> 'album' or v_edition.series_id is null or v_edition.volume is null then
    raise exception 'Seul un tome numéroté d''une série peut avoir une édition principale'
      using errcode = '22023';
  end if;

  select isbn into v_previous
  from public.editions
  where series_id = v_edition.series_id and volume = v_edition.volume and is_primary;

  if p_primary then
    if v_edition.is_primary then
      return 'unchanged';
    end if;
    update public.editions set is_primary = false
    where series_id = v_edition.series_id and volume = v_edition.volume and is_primary;
    update public.editions set is_primary = true where isbn = p_isbn;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, 'admin', 'edition_primary', p_isbn, coalesce(v_previous, ''), p_isbn);
  else
    if v_previous is null then
      return 'unchanged';
    end if;
    update public.editions set is_primary = false
    where series_id = v_edition.series_id and volume = v_edition.volume and is_primary;
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, 'admin', 'edition_primary', v_previous, v_previous, '');
  end if;
  return 'applied';
end;
$$;

revoke execute on function public.set_primary_edition(text, boolean) from public, anon, authenticated;
grant execute on function public.set_primary_edition(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation. La fonction revert_change existante (qui gère tous les autres types de changement)
-- devient `revert_change_core`, interne ; revert_change traite « edition_primary » et confie le
-- reste à la fonction interne. À reprendre si une migration future redéfinit revert_change.
-- ---------------------------------------------------------------------------

alter function public.revert_change(bigint) rename to revert_change_core;
revoke execute on function public.revert_change_core(bigint) from public, anon, authenticated;

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
begin
  if v_uid is null or not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;

  select * into v_change from public.catalogue_changes where id = p_id for update;
  if not found or v_change.status <> 'applied' then
    raise exception 'Changement introuvable ou non annulable' using errcode = '22023';
  end if;

  if v_change.kind <> 'edition_primary' then
    perform public.revert_change_core(p_id);
    return;
  end if;

  select * into v_edition from public.editions where isbn = v_change.isbn for update;
  if not found then
    raise exception 'L''album n''existe plus' using errcode = '22023';
  end if;

  if v_change.new_value <> '' then
    -- Choix d'une principale : on la retire, et on rend sa place à l'ancienne si elle existe encore
    if not v_edition.is_primary then
      raise exception 'L''édition principale a changé depuis : annulation impossible'
        using errcode = '55000';
    end if;
    update public.editions set is_primary = false where isbn = v_change.isbn;
    if v_change.old_value <> '' then
      update public.editions set is_primary = true
      where isbn = v_change.old_value
        and series_id = v_edition.series_id and volume = v_edition.volume and kind = 'album';
    end if;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_primary', v_change.isbn, v_change.new_value, v_change.old_value, p_id);
  else
    -- Retrait du choix : on rétablit l'ancienne principale si le tome n'en a pas reçu une autre
    if exists (
      select 1 from public.editions
      where series_id = v_edition.series_id and volume = v_edition.volume and is_primary
    ) then
      raise exception 'L''édition principale a changé depuis : annulation impossible'
        using errcode = '55000';
    end if;
    update public.editions set is_primary = true where isbn = v_change.isbn;
    insert into public.catalogue_changes
      (user_id, origin, kind, isbn, old_value, new_value, reverts_id)
    values (v_uid, 'admin', 'edition_primary', v_change.isbn, '', v_change.isbn, p_id);
  end if;

  update public.catalogue_changes
  set status = 'reverted', reviewed_by = v_uid, reviewed_at = now()
  where id = p_id;
end;
$$;

revoke execute on function public.revert_change(bigint) from public, anon, authenticated;
grant execute on function public.revert_change(bigint) to authenticated;
