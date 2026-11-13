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
  if (change.kind === 'edition_title') {
    return `Titre : « ${change.oldValue ?? '—'} » → « ${change.newValue ?? '—'} »`
  }
  if (change.kind === 'edition_volume') {
    const show = (value: string | null) => (value ? `tome ${value}` : 'sans numéro')
    return `Numéro : ${show(change.oldValue)} → ${show(change.newValue)}`
  }
  if (change.kind === 'edition_authors') {
    const show = (value: string | null) => {
      try {
        return (JSON.parse(value ?? '[]') as string[]).join(', ') || 'aucun'
      } catch {
        return value ?? '—'
      }
    }
    return `Auteurs : ${show(change.oldValue)} → ${show(change.newValue)}`
  }
  if (change.kind === 'edition_publisher') {
    return `Éditeur : ${change.oldValue || 'inconnu'} → ${change.newValue || 'inconnu'}`
  }
  if (change.kind === 'edition_date') {
    return `Date de parution : ${change.oldValue || 'inconnue'} → ${change.newValue || 'inconnue'}`
  }
  if (change.kind === 'edition_series') {
    const detach = !change.newValue
    return detach ? 'Album détaché de sa série' : 'Album rattaché à une autre série'
  }
  if (change.kind === 'edition_isbn') {
    return `ISBN corrigé : ${change.oldValue ?? '?'} → ${change.newValue ?? '?'}`
  }
  if (change.kind === 'edition_primary') {
    return change.newValue
      ? 'Désignée comme édition principale de son tome'
      : 'Choix de l’édition principale retiré (retour au choix automatique)'
  }
  if (change.kind === 'edition_merge') {
    return `Édition ${change.oldValue ?? '?'} fusionnée dans celle-ci`
  }
  if (change.kind === 'series_merge' && change.revertsId !== null) {
    return `Fusion annulée : « ${change.oldValue ?? '?'} » rétablie (${change.newValue ?? 0} album(s) remis)`
  }
  if (change.kind === 'series_merge') {
    return `Fusion : « ${change.oldValue ?? '?'} » fusionnée dans cette série (${change.newValue ?? 0} album(s))`
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
