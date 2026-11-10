-- Couvertures de deux libraires (Decitre, AbeBooks), indexées par ISBN-13 : elles complètent
-- Amazon (dont l'adresse suppose un ISBN-10, absent des ISBN en 979) et la BnF.
-- L'adresse doit avoir exactement la forme attendue pour l'ISBN de l'album.

create or replace function public.is_allowed_cover_url(p_isbn text, p_cover_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_isbn10 text := public.isbn13_to_isbn10(p_isbn);
begin
  return p_cover_url = format('https://covers.openlibrary.org/b/isbn/%s-L.jpg', p_isbn)
    or (
      v_isbn10 is not null
      and p_cover_url =
        format('https://images-na.ssl-images-amazon.com/images/P/%s.01.LZZZZZZZ.jpg', v_isbn10)
    )
    or p_cover_url = format('https://products-images.di-static.com/image/x/%s-475x500-1.jpg', p_isbn)
    or p_cover_url = format('https://pictures.abebooks.com/isbn/%s-fr-300.jpg', p_isbn)
    or p_cover_url ~
      '^https://catalogue\.bnf\.fr/couverture\?&appName=NE&idArk=ark:/12148/cb[0-9a-z]{6,12}&couverture=1$';
end;
$$;
