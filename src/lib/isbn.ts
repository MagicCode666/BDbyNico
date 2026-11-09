function isbn13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10
}

export function isValidIsbn13(isbn: string): boolean {
  return /^\d{13}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12])
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false
  const sum = [...isbn].reduce((s, c, i) => s + (c === 'X' ? 10 : Number(c)) * (10 - i), 0)
  return sum % 11 === 0
}

/**
 * Normalise une saisie (tirets, espaces tolérés) en ISBN-13.
 * Accepte un ISBN-10 (converti) ou un ISBN-13. Renvoie null si la saisie est invalide.
 */
export function normalizeIsbn(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase()
  if (cleaned.length === 13) return isValidIsbn13(cleaned) ? cleaned : null
  if (cleaned.length === 10 && isValidIsbn10(cleaned)) {
    const first12 = `978${cleaned.slice(0, 9)}`
    return `${first12}${isbn13CheckDigit(first12)}`
  }
  return null
}

/** ISBN-13 lu sur un code-barres EAN-13 de livre (préfixe 978/979), ou null pour tout autre code. */
export function isbnFromBarcode(text: string): string | null {
  const digits = text.trim()
  return /^97[89]\d{10}$/.test(digits) && isValidIsbn13(digits) ? digits : null
}

/** ISBN-10 équivalent d'un ISBN-13 commençant par 978 (null sinon). */
export function isbn13To10(isbn13: string): string | null {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith('978')) return null
  const body = isbn13.slice(3, 12)
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (10 - i), 0)
  const check = (11 - (sum % 11)) % 11
  return `${body}${check === 10 ? 'X' : check}`
}

/** Affichage lisible : 978-2-07-061275-8 n'est pas calculable sans table de groupes, on espace simplement. */
export function formatIsbn(isbn: string): string {
  return isbn.length === 13 ? `${isbn.slice(0, 3)} ${isbn.slice(3)}` : isbn
}
