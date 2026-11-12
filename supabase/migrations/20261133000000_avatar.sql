-- Avatar personnalisé : une petite image carrée, redimensionnée dans le navigateur avant l'envoi
-- (128 × 128, WebP ou JPEG, quelques Ko), stockée telle quelle dans le profil sous forme d'adresse
-- « data: ». La base impose le format et une taille maximale (30 000 caractères, environ 22 Ko)
-- pour qu'elle ne puisse pas grossir. Visible de soi et de ses amis seulement (via list_friends et
-- list_friend_requests), jamais dans le lien public.

alter table public.profiles
  add column avatar text check (
    avatar is null
    or (
      char_length(avatar) <= 30000
      and avatar ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$'
    )
  );

grant update (pseudo, share_enabled, share_wishes, share_dedications, avatar)
  on public.profiles to authenticated;

-- Les listes d'amis et de demandes portent maintenant l'avatar
drop function public.list_friends();
create function public.list_friends()
returns table (
  friend_id uuid,
  pseudo text,
  since timestamptz,
  i_share boolean,
  they_share boolean,
  avatar text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.pseudo, f.responded_at,
         case when f.requester = auth.uid() then f.requester_shares else f.addressee_shares end,
         case when f.requester = auth.uid() then f.addressee_shares else f.requester_shares end,
         p.avatar
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  order by lower(p.pseudo);
$$;

drop function public.list_friend_requests();
create function public.list_friend_requests()
returns table (user_id uuid, pseudo text, direction text, created_at timestamptz, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.pseudo, 'in', f.created_at, p.avatar
  from public.friendships f join public.profiles p on p.id = f.requester
  where f.addressee = auth.uid() and f.status = 'pending'
  union all
  select p.id, p.pseudo, 'out', f.created_at, p.avatar
  from public.friendships f join public.profiles p on p.id = f.addressee
  where f.requester = auth.uid() and f.status in ('pending', 'declined')
  order by created_at desc;
$$;

revoke execute on function public.list_friends(), public.list_friend_requests()
  from public, anon, authenticated;
grant execute on function public.list_friends(), public.list_friend_requests() to authenticated;
