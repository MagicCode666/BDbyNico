-- Changer le type d'un album est réservé à ses possesseurs (et aux modérateurs). La première
-- version laissait aussi faire le créateur de l'édition, même sans la posséder : un utilisateur
-- qui avait créé un album par import sans le garder dans sa collection pouvait changer son type.

create or replace function public.set_edition_kind(
  p_isbn text,
  p_kind text,
  p_from int default null,
  p_to int default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_edition public.editions;
  v_moderator boolean;
  v_from int := p_from;
  v_to int := p_to;
  v_old text;
  v_new text;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  v_moderator := public.is_moderator();

  if p_kind not in ('album', 'integral', 'special') then
    raise exception 'Type d''album invalide' using errcode = '22023';
  end if;
  if p_kind <> 'integral' then
    v_from := null;
    v_to := null;
  elsif (v_from is null) <> (v_to is null)
        or v_from not between 0 and 999 or v_to not between 0 and 999
        or v_from > v_to then
    raise exception 'Plage de tomes invalide' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where isbn = p_isbn;
  if not found
     or (v_edition.review_status = 'pending'
         and v_edition.created_by is distinct from v_uid
         and not v_moderator) then
    raise exception 'Album introuvable' using errcode = '22023';
  end if;

  if not v_moderator
     and not exists (
       select 1 from public.collection_items where user_id = v_uid and isbn = p_isbn
     ) then
    raise exception 'Seuls les possesseurs de cet album peuvent changer son type'
      using errcode = '42501';
  end if;

  v_old := v_edition.kind || ':' || coalesce(v_edition.volume_from::text || '-' || v_edition.volume_to::text, '');
  v_new := p_kind || ':' || coalesce(v_from::text || '-' || v_to::text, '');
  if v_old = v_new then
    return 'unchanged';
  end if;

  -- Plafond quotidien de changements proposés (couvertures et types confondus)
  if not v_moderator and (
    select count(*) from public.catalogue_changes
    where user_id = v_uid and kind in ('cover', 'edition_kind') and origin = 'user'
      and created_at > now() - interval '1 day'
  ) >= 60 then
    raise exception 'Limite quotidienne de signalements atteinte' using errcode = '54000';
  end if;

  -- Un album en attente créé par son auteur se modifie directement : personne d'autre ne le voit
  if not v_moderator
     and v_edition.review_status = 'approved'
     and exists (select 1 from public.profiles where id = v_uid and contribution = 'collection_only') then
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value, status)
    values (v_uid, 'user', 'edition_kind', p_isbn, v_old, v_new, 'pending');
    return 'pending';
  end if;

  update public.editions
  set kind = p_kind, volume_from = v_from, volume_to = v_to
  where isbn = p_isbn;

  if v_edition.review_status = 'approved' then
    insert into public.catalogue_changes (user_id, origin, kind, isbn, old_value, new_value)
    values (v_uid, case when v_moderator then 'admin' else 'user' end, 'edition_kind', p_isbn, v_old, v_new);
  end if;
  return 'applied';
end;
$$;

revoke execute on function public.set_edition_kind(text, text, int, int) from public, anon, authenticated;
grant execute on function public.set_edition_kind(text, text, int, int) to authenticated;
