-- Pseudo unique : préalable au partage entre comptes (on retrouve quelqu'un par son pseudo).
--
-- Unicité sans tenir compte de la casse ni des accents (« Nico » et « nico » sont le même pseudo),
-- comme pour les noms de séries. Forme : 3 à 30 caractères, sans < > & " @ / \ ni caractère de
-- contrôle. Les pseudos existants restent tels quels tant qu'on ne les modifie pas.
-- À l'inscription, un pseudo déjà pris ou invalide ne fait jamais échouer la création du compte :
-- on le corrige (suffixe -2, -3…) et la personne peut le changer ensuite.

alter table public.profiles add column pseudo_key text;

update public.profiles set pseudo_key = lower(extensions.unaccent(btrim(pseudo)));

alter table public.profiles alter column pseudo_key set not null;
create unique index profiles_pseudo_key_idx on public.profiles (pseudo_key);

-- Forme d'un pseudo (sans la casse : ni l'unicité, ni la longueur minimale des anciens comptes)
create or replace function public.is_valid_pseudo(p_pseudo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_pseudo is not null
    and char_length(p_pseudo) between 3 and 30
    and p_pseudo = btrim(p_pseudo)
    and p_pseudo !~ '[<>&"@/]'
    and strpos(p_pseudo, chr(92)) = 0
    and p_pseudo !~ '[[:cntrl:]]'
    and p_pseudo !~ '\s{2,}';
$$;

create or replace function public.profiles_check_pseudo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.pseudo is not distinct from old.pseudo then
    return new;
  end if;
  new.pseudo := btrim(new.pseudo);
  if not public.is_valid_pseudo(new.pseudo) then
    raise exception 'Pseudo invalide : 3 à 30 caractères, sans < > & " @ / \'
      using errcode = '22023';
  end if;
  new.pseudo_key := lower(extensions.unaccent(new.pseudo));
  return new;
end;
$$;

create trigger profiles_pseudo
  before insert or update of pseudo on public.profiles
  for each row execute function public.profiles_check_pseudo();

-- Inscription : le profil est créé avec un pseudo valide et libre, quoi qu'il arrive
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_pseudo text;
  v_n int := 1;
begin
  v_base := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'pseudo'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'lecteur'
  );
  v_base := btrim(regexp_replace(
    regexp_replace(replace(v_base, chr(92), ''), '[<>&"@/]|[[:cntrl:]]', '', 'g'),
    '\s+', ' ', 'g'));
  v_base := btrim(left(v_base, 30));
  if char_length(v_base) < 3 then
    v_base := 'lecteur';
  end if;
  v_pseudo := v_base;
  while exists (
    select 1 from public.profiles where pseudo_key = lower(extensions.unaccent(v_pseudo))
  ) loop
    v_n := v_n + 1;
    v_pseudo := btrim(left(v_base, 30 - char_length(v_n::text) - 1)) || '-' || v_n;
  end loop;

  insert into public.profiles (id, pseudo) values (new.id, v_pseudo);
  return new;
end;
$$;

-- Ce pseudo est-il valide et libre ? (pour l'inscription et le changement de pseudo ; le compte
-- connecté n'est pas en conflit avec lui-même)
create or replace function public.pseudo_available(p_pseudo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_valid_pseudo(btrim(p_pseudo))
    and not exists (
      select 1 from public.profiles
      where pseudo_key = lower(extensions.unaccent(btrim(p_pseudo)))
        and id is distinct from auth.uid()
    );
$$;

revoke execute on function
  public.is_valid_pseudo(text),
  public.profiles_check_pseudo(),
  public.pseudo_available(text)
  from public, anon, authenticated;
grant execute on function public.pseudo_available(text) to anon, authenticated;
