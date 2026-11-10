import type { Change } from './api'
import { genreLabel } from '../series/genres'

const STATUS_WORDS: Record<string, string> = { ongoing: 'en cours', finished: 'terminée' }
const SOURCE_WORDS: Record<string, string> = { manual: 'fixé à la main', auto: 'automatique' }

const KIND_WORDS: Record<string, string> = {
  album: 'album ordinaire',
  integral: 'intégrale',
  special: 'hors-série',
}

/** « integral:1-3 » → « intégrale (tomes 1 à 3) » ; « album: » → « album ordinaire ». */
function describeKindValue(value: string | null): string {
  if (value === null) return '—'
  const [kind, range = ''] = value.split(':')
  const word = KIND_WORDS[kind] ?? kind
  if (kind !== 'integral') return word
  const [from, to] = range.split('-')
  if (!from || !to) return `${word} (série complète)`
  return from === to ? `${word} (tome ${from})` : `${word} (tomes ${from} à ${to})`
}

/** « manual:9 » → « 9 (fixé à la main) » ; « auto: » → « inconnu (automatique) ». */
function describeValue(kind: Change['kind'], value: string | null): string {
  if (value === null) return '—'
  if (kind === 'series_name') return `« ${value} »`
  const [source, content = ''] = value.split(':')
  const shown =
    kind === 'series_status' ? (STATUS_WORDS[content] ?? 'inconnu') : content || 'inconnu'
  return `${shown} (${SOURCE_WORDS[source] ?? source})`
}

/** Phrase lisible pour un changement de série (nom, total, statut) ou de type d'album ; null sinon. */
export function describeChange(change: Change): string | null {
  if (change.kind === 'edition_kind') {
    return `Type : ${describeKindValue(change.oldValue)} → ${describeKindValue(change.newValue)}`
  }
  if (change.kind === 'series_genres') {
    const show = (value: string | null) =>
      value ? value.split(',').map(genreLabel).join(', ') : 'aucun'
    return `Genres : ${show(change.oldValue)} → ${show(change.newValue)}`
  }
  const label = {
    series_name: 'Nom',
    series_total: 'Total',
    series_status: 'Statut',
  } as Record<string, string>
  if (!(change.kind in label)) return null
  return `${label[change.kind]} : ${describeValue(change.kind, change.oldValue)} → ${describeValue(change.kind, change.newValue)}`
}
