import { useEffect, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { amazonCoverUrl, imageExists } from '../collection/lookup/amazon'
import { findBnfCover } from '../collection/lookup/bnf'
import { abebooksCoverUrl, decitreCoverUrl } from '../collection/lookup/retailers'
import { CoverImage } from '../collection/AlbumCard'
import { governanceErrorMessage, reportCover, type ReportResult } from './api'

interface Candidate {
  source: string
  url: string
}

interface Props {
  isbn: string
  title: string
  /** Couverture actuellement affichée (exclue des propositions). */
  currentCover: string | null
  onClose: () => void
  /** Appelé quand la couverture a été changée (pas pour une simple proposition en attente). */
  onChanged: () => void
}

/** Cherche la couverture de l'ISBN dans toutes les sources, sauf celle déjà affichée. */
async function findCandidates(isbn: string, current: string | null): Promise<Candidate[]> {
  const amazon = amazonCoverUrl(isbn)
  const decitre = decitreCoverUrl(isbn)
  const abebooks = abebooksCoverUrl(isbn)
  const [amazonOk, bnf, decitreOk, abebooksOk, openLibraryOk] = await Promise.all([
    amazon ? imageExists(amazon.replace('LZZZZZZZ', 'MZZZZZZZ')) : Promise.resolve(false),
    findBnfCover(isbn),
    imageExists(decitre),
    imageExists(abebooks),
    imageExists(`https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg?default=false`),
  ])
  const all: Candidate[] = []
  if (amazon && amazonOk) all.push({ source: 'Amazon', url: amazon })
  if (bnf) all.push({ source: 'BnF', url: bnf })
  if (decitreOk) all.push({ source: 'Decitre', url: decitre })
  if (abebooksOk) all.push({ source: 'AbeBooks', url: abebooks })
  if (openLibraryOk) {
    all.push({ source: 'Open Library', url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` })
  }
  return all.filter((candidate) => candidate.url !== current)
}

export default function CoverReportDialog({
  isbn,
  title,
  currentCover,
  onClose,
  onChanged,
}: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)

  useEffect(() => {
    let cancelled = false
    findCandidates(isbn, currentCover).then((found) => {
      if (!cancelled) setCandidates(found)
    })
    return () => {
      cancelled = true
    }
  }, [isbn, currentCover])

  async function choose(url: string | null) {
    setBusy(true)
    setError(null)
    try {
      const outcome = await reportCover(isbn, url)
      setResult(outcome)
      if (outcome === 'applied') onChanged()
    } catch (e) {
      setError(governanceErrorMessage(e, 'Impossible de modifier la couverture.'))
    }
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-report-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-5 shadow-lg"
      >
        <h2 id="cover-report-title" className="mb-1 text-lg font-semibold">
          Cette couverture n'est pas bonne
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          {title} : choisissez la bonne couverture. Le choix est partagé par tous les utilisateurs.
        </p>

        {result ? (
          <div className="flex flex-col gap-3">
            <FormMessage kind="success">
              {result === 'pending'
                ? 'Merci ! Votre proposition est en attente de validation.'
                : result === 'unchanged'
                  ? 'Cette couverture est déjà celle de la fiche.'
                  : 'Couverture mise à jour pour tout le monde.'}
            </FormMessage>
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {candidates === null && (
              <p role="status" className="text-sm text-slate-600">
                Recherche des couvertures disponibles…
              </p>
            )}
            {candidates?.length === 0 && (
              <p className="text-sm text-slate-600">
                Aucune autre couverture trouvée dans les sources connues.
              </p>
            )}
            {candidates && candidates.length > 0 && (
              <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {candidates.map((candidate) => (
                  <li key={candidate.url} className="flex flex-col gap-2 rounded border p-2">
                    <CoverImage
                      coverUrl={candidate.url}
                      title={`${title} (${candidate.source})`}
                      className="aspect-[2/3] w-full rounded"
                    />
                    <span className="text-xs text-slate-600">{candidate.source}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose(candidate.url)}
                      className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Choisir celle-ci
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <div className="mb-3">
                <FormMessage kind="error">{error}</FormMessage>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                disabled={busy || candidates === null || currentCover === null}
                onClick={() => choose(null)}
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
                title="Affiche le titre à la place de l'image"
              >
                Aucune ne convient : pas de couverture
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
