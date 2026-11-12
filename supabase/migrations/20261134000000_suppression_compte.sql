-- Suppression de compte : la fonction existait déjà (cascade sur le profil, la collection, les
-- réglages de séries et les amitiés ; les ajouts au catalogue et le journal gardent leur contenu
-- mais perdent leur auteur). On ajoute une protection : le dernier administrateur ne peut pas
-- supprimer son compte, sinon plus personne ne pourrait modérer le catalogue.
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
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
     and not exists (select 1 from public.profiles where role = 'admin' and id <> auth.uid()) then
    raise exception 'Dernier administrateur' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
