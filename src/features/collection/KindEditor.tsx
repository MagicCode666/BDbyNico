import { useState } from 'react'

import FormMessage from '../../components/FormMessage'
import { governanceErrorMessage, setEditionKind, type ReportResult } from '../governance/api'
import { KIND_LABELS, rangeLabel, toAlbumKind, type AlbumKind } from './kinds'
import type { Edition } from './types'

interface Props {
  edition: Edition
  /** Appelé quand le type a été changé (pas pour une simple proposition en attente). */
  onChanged: () => void
}

/**
 * Type de l'album : tome ordinaire, intégrale (avec les tomes qu'elle reprend) ou hors-série.
 * Le changement est partagé par tous les utilisateurs, journalisé et annulable par un modérateur.
 */
export default function KindEditor({ edition, onChanged }: Props) {
  const [kind, setKind] = useState<AlbumKind>(toAlbumKind(edition.kind))
  const [from, setFrom] = useState(edition.volumeFrom?.toString() ?? '')
  const [to, setTo] = useState(edition.volumeTo?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)

  async function save() {
    setError(null)
    setResult(null)
    let rangeFrom: number | null = null
    let rangeTo: number | null = null
    if (kind === 'integral' && (from.trim() !== '' || to.trim() !== '')) {
      rangeFrom = Number(from)
      rangeTo = Number(to)
      const valid =
        from.trim() !== '' &&
        to.trim() !== '' &&
        Number.isInteger(rangeFrom) &&
        Number.isInteger(rangeTo) &&
        rangeFrom >= 0 &&
        rangeTo <= 999 &&
        rangeFrom <= rangeTo
      if (!valid) {
        return setError(
          'Indiquez le premier et le dernier tome repris (le premier ne dépasse pas le dernier), ou laissez les deux vides.',
        )
      }
    }
    setBusy(true)
    try {
      const outcome = await setEditionKind(edition.isbn, kind, rangeFrom, rangeTo)
      setResult(outcome)
      if (outcome === 'applied') onChanged()
    } catch (e) {
      setError(governanceErrorMessage(e, 'Impossible de modifier le type de cet album.'))
    }
    setBusy(false)
  }

  const current = toAlbumKind(edition.kind)
  return (
    <section className="flex max-w-lg flex-col gap-2 rounded border border-line p-3">
      <h3 className="text-sm font-semibold">Type d'album</h3>
      <p className="text-xs text-muted">
        {current === 'integral'
          ? `Intégrale · ${rangeLabel(edition.volumeFrom, edition.volumeTo)}. C'est un objet distinct des tomes qu'elle reprend.`
          : current === 'special'
            ? 'Hors-série : il ne compte pas parmi les tomes de la série.'
            : "Tome ordinaire de la série. Indiquez s'il s'agit d'une intégrale, d'un coffret ou d'un hors-série."}{' '}
        Ce réglage est partagé par tous les utilisateurs.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(toAlbumKind(e.target.value))}
            className="rounded border border-line-strong px-2 py-1"
          >
            {(Object.keys(KIND_LABELS) as AlbumKind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'integral' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Premier tome repris
              <input
                type="number"
                min={0}
                max={999}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-24 rounded border border-line-strong px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Dernier tome repris
              <input
                type="number"
                min={0}
                max={999}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-24 rounded border border-line-strong px-2 py-1"
              />
            </label>
          </>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded border border-line-strong px-3 py-1 text-sm font-medium hover:border-accent disabled:opacity-50"
        >
          Enregistrer le type
        </button>
      </div>
      {kind === 'integral' && (
        <p className="text-xs text-muted">
          Laissez les deux numéros vides pour une intégrale de toute la série.
        </p>
      )}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {result && (
        <FormMessage kind="success">
          {result === 'pending'
            ? 'Merci ! Votre proposition est en attente de validation.'
            : result === 'unchanged'
              ? 'Le type est déjà celui-ci.'
              : 'Type enregistré pour tout le monde.'}
        </FormMessage>
      )}
    </section>
  )
}
