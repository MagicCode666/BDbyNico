import { listCollection } from '../collection/api'
import { downloadText } from './download'
import { entriesToCsv, exportFileName } from './exportCsv'

/** Télécharge la collection de l'utilisateur en CSV. Renvoie le nombre d'albums exportés. */
export async function exportCollection(): Promise<number> {
  const entries = await listCollection()
  downloadText(exportFileName(), entriesToCsv(entries))
  return entries.length
}
