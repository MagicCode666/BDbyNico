import type { Change } from './api'

const STATUS_WORDS: Record<string, string> = { ongoing: 'en cours', finished: 'terminée' }
const SOURCE_WORDS: Record<string, string> = { manual: 'fixé à la main', auto: 'automatique' }

/** « manual:9 » → « 9 (fixé à la main) » ; « auto: » → « inconnu (automatique) ». */
function describeValue(kind: Change['kind'], value: string | null): string {
  if (value === null) return '—'
  if (kind === 'series_name') return `« ${value} »`
  const [source, content = ''] = value.split(':')
  const shown =
    kind === 'series_status' ? (STATUS_WORDS[content] ?? 'inconnu') : content || 'inconnu'
  return `${shown} (${SOURCE_WORDS[source] ?? source})`
}

/** Phrase lisible pour un changement de série (nom, total ou statut) ; null pour un album. */
export function describeSeriesChange(change: Change): string | null {
  const label = {
    series_name: 'Nom',
    series_total: 'Total',
    series_status: 'Statut',
  } as Record<string, string>
  if (!(change.kind in label)) return null
  return `${label[change.kind]} : ${describeValue(change.kind, change.oldValue)} → ${describeValue(change.kind, change.newValue)}`
}
