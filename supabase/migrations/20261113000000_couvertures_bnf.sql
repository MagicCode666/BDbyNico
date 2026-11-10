-- Les couvertures de la BnF sont acceptées dans le catalogue partagé, en plus d'Open Library et
-- d'Amazon. L'adresse doit avoir exactement la forme du service de couvertures du catalogue.

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
     and p_cover_url !~
       '^https://catalogue\.bnf\.fr/couverture\?&appName=NE&idArk=ark:/12148/cb[0-9a-z]{6,12}&couverture=1$'
  then
    raise exception 'Adresse de couverture non autorisée' using errcode = '22023';
  end if;

  update public.editions
  set cover_url = p_cover_url
  where isbn = p_isbn and cover_url is null;
end;
$$;

revoke execute on function public.set_edition_cover(text, text) from public, anon, authenticated;
grant execute on function public.set_edition_cover(text, text) to authenticated;
