-- Test des genres de séries (migration 20261124).
-- S'arrête TOUJOURS par une exception (annulation) : « OK : n vérifications » ou « ECHEC : ... ».

create function pg_temp._t_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

do $test$
declare
  u_mod uuid := gen_random_uuid();
  u_usr uuid := gen_random_uuid();
  s uuid;
  n int := 0;
  g text[];
  c int;
  ch bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (u_mod, 'mod@test.invalid', 'authenticated', 'authenticated'),
    (u_usr, 'usr@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = u_mod;
  insert into public.series (name) values ('Série de genres') returning id into s;

  -- 1. Un modérateur fixe des genres, triés, et le journal les retient
  perform pg_temp._t_as(u_mod);
  perform public.set_series_genres(s, array['western', 'aventure', 'western']);
  reset role;
  select genres into g from public.series where id = s;
  if g is distinct from array['aventure', 'western'] then
    raise exception 'ECHEC : genres inattendus (%)', g;
  end if;
  n := n + 1;
  select id into ch from public.catalogue_changes
    where series_id = s and kind = 'series_genres' and old_value = '' and new_value = 'aventure,western';
  if ch is null then raise exception 'ECHEC : changement non journalisé'; end if;
  n := n + 1;

  -- 2. Quatre genres : refusé ; genre inconnu : refusé
  begin
    perform pg_temp._t_as(u_mod);
    perform public.set_series_genres(s, array['aventure', 'western', 'polar', 'humour']);
    reset role;
    raise exception 'ECHEC : quatre genres acceptés';
  exception when invalid_parameter_value then
    reset role;
    n := n + 1;
  end;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.set_series_genres(s, array['bidon']);
    reset role;
    raise exception 'ECHEC : genre inconnu accepté';
  exception when invalid_parameter_value then
    reset role;
    n := n + 1;
  end;

  -- 3. Un utilisateur ordinaire ne peut rien changer
  begin
    perform pg_temp._t_as(u_usr);
    perform public.set_series_genres(s, array['polar']);
    reset role;
    raise exception 'ECHEC : un utilisateur ordinaire a changé les genres';
  exception when insufficient_privilege then
    reset role;
    n := n + 1;
  end;

  -- 4. Rien ne change, rien n'est journalisé
  perform pg_temp._t_as(u_mod);
  perform public.set_series_genres(s, array['western', 'aventure']);
  reset role;
  select count(*) into c from public.catalogue_changes where series_id = s and kind = 'series_genres';
  if c <> 1 then raise exception 'ECHEC : un changement nul a été journalisé (%)', c; end if;
  n := n + 1;

  -- 5. Annulation refusée si les genres ont changé depuis, acceptée sinon
  perform pg_temp._t_as(u_mod);
  perform public.set_series_genres(s, array['polar']);
  reset role;
  begin
    perform pg_temp._t_as(u_mod);
    perform public.revert_change(ch);
    reset role;
    raise exception 'ECHEC : annulation acceptée malgré un changement postérieur';
  exception when object_not_in_prerequisite_state then
    reset role;
    n := n + 1;
  end;
  select id into ch from public.catalogue_changes
    where series_id = s and kind = 'series_genres' and new_value = 'polar';
  perform pg_temp._t_as(u_mod);
  perform public.revert_change(ch);
  reset role;
  select genres into g from public.series where id = s;
  if g is distinct from array['aventure', 'western'] then
    raise exception 'ECHEC : annulation sans effet (%)', g;
  end if;
  n := n + 1;

  -- 6. Un anonyme ne peut pas appeler la fonction
  begin
    perform set_config('role', 'anon', true);
    perform public.set_series_genres(s, array['polar']);
    reset role;
    raise exception 'ECHEC : un anonyme a pu changer les genres';
  exception when insufficient_privilege then
    reset role;
    n := n + 1;
  end;

  raise exception 'OK : % vérifications', n;
end;
$test$;
