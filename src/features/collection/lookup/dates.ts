const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Convertit une date libre (« 1989 », « July 1999 », « January 11, 1989 », « 1989-03-02 »)
 * en date ISO. Sans mois ni jour, on retient le 1er janvier.
 */
export function toIsoDate(text: string | undefined): string | undefined {
  if (!text) return undefined
  const value = text.trim().toLowerCase()

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const year = value.match(/\b(\d{4})\b/)?.[1]
  if (!year) return undefined

  const monthIndex = MONTHS.findIndex((name) => value.includes(name.slice(0, 3)))
  if (monthIndex === -1) return `${year}-01-01`

  const day = value.match(/\b(\d{1,2})\b(?!\d)/)?.[1]
  return `${year}-${pad(monthIndex + 1)}-${pad(day && Number(day) <= 31 ? Number(day) : 1)}`
}
