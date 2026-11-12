-- Suppression de compte : le contrôle du dernier administrateur devient sûr en cas d'appels
-- simultanés. Sans verrou, deux administrateurs qui suppriment leur compte au même instant se
-- voyaient chacun présent et passaient tous les deux. On verrouille les lignes des administrateurs
-- avant de compter : le second attend la fin du premier, puis se voit seul et est refusé.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    perform 1 from public.profiles where role = 'admin' order by id for update;
    if not exists (select 1 from public.profiles where role = 'admin' and id <> auth.uid()) then
      raise exception 'Dernier administrateur' using errcode = 'P0001';
    end if;
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
