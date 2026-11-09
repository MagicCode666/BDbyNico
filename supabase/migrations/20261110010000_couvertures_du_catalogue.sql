-- Couvertures du catalogue partagé : les utilisateurs ne peuvent pas modifier une édition, mais
-- peuvent renseigner sa couverture quand elle est vide, avec une adresse imposée.

-- ISBN-10 équivalent d'un ISBN-13 commençant par 978 (null sinon)
create or replace function public.isbn13_to_isbn10(p_isbn text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  body text;
  total int := 0;
  i int;
  check_digit int;
begin
  if p_isbn !~ '^978[0-9]{10}$' then
    return null;
  end if;
  body := substr(p_isbn, 4, 9);
  for i in 1..9 loop
    total := total + substr(body, i, 1)::int * (11 - i);
  end loop;
  check_digit := (11 - total % 11) % 11;
  return body || case when check_digit = 10 then 'X' else check_digit::text end;
end;
$$;

-- Renseigne la couverture d'une édition, seulement si elle est vide et si l'adresse est celle
-- d'une source connue construite à partir de l'ISBN (Open Library ou Amazon).
create or replace function public.set_edition_cover(p_isbn text, p_cover_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_isbn10 text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  v_isbn10 := public.isbn13_to_isbn10(p_isbn);
  if p_cover_url is distinct from format('https://covers.openlibrary.org/b/isbn/%s-L.jpg', p_isbn)
     and (
       v_isbn10 is null
       or p_cover_url is distinct from
         format('https://images-na.ssl-images-amazon.com/images/P/%s.01.LZZZZZZZ.jpg', v_isbn10)
     )
  then
    raise exception 'Adresse de couverture non autorisée' using errcode = '22023';
  end if;

  update public.editions
  set cover_url = p_cover_url
  where isbn = p_isbn and cover_url is null;
end;
$$;

revoke execute on function
  public.isbn13_to_isbn10(text),
  public.set_edition_cover(text, text)
  from public, anon, authenticated;

grant execute on function public.set_edition_cover(text, text) to authenticated;
