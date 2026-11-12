import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import {
  governanceErrorMessage,
  mergeSeries,
  renameSeries,
  type AdminSeries,
} from '../governance/api'
import SeriesPicker from '../governance/SeriesPicker'

/**
 * Correction d'une série (modérateurs) : renommer, ou fusionner dans une autre série quand deux
 * séries désignent la même œuvre. Le renommage est journalisé et annulable ; une fusion ne l'est
 * pas (elle déplace tous les albums et supprime la série).
 */
export default function SeriesCorrector({
  seriesId,
  name,
  albumCount,
  onChanged,
}: {
  seriesId: string
  name: string
  albumCount: number
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [value, setValue] = useState(name)
  const [target, setTarget] = useState<AdminSeries | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function rename() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await renameSeries(seriesId, value.trim())
      setDone('Série renommée.')
      onChanged()
    } catch (caught) {
      setError(governanceErrorMessage(caught, 'Impossible de renommer la série.'))
    }
    setBusy(false)
  }

  async function merge() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await mergeSeries(seriesId, target.id)
      navigate(`/series/${target.id}`)
    } catch (caught) {
      setError(governanceErrorMessage(caught, 'Impossible de fusionner les séries.'))
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-4" aria-labelledby="serie-correction">
      <h2 id="serie-correction" className="text-sm font-semibold">
        Corriger la série (modérateur)
      </h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Nom de la série</span>
          <input
            value={value}
            maxLength={200}
            onChange={(event) => setValue(event.target.value)}
            className="rounded border border-line-strong bg-surface px-3 py-2"
          />
        </label>
        <IconButton
          icon="check"
          variant="primary"
          size="lg"
          label="Renommer la série"
          disabled={busy || value.trim() === '' || value.trim() === name}
          onClick={rename}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <p className="text-sm text-muted">
          Deux séries pour la même œuvre ? Fusionnez celle-ci ({albumCount} album
          {albumCount > 1 ? 's' : ''}) dans l’autre : ses albums y sont déplacés et elle disparaît.
        </p>
        {!target ? (
          <>
            <div>
              <IconButton
                icon="search"
                label="Choisir la série à conserver"
                pressed={choosing}
                onClick={() => setChoosing((on) => !on)}
              />
            </div>
            {choosing && (
              <SeriesPicker
                excludeId={seriesId}
                label="Série à conserver"
                onPick={(series) => {
                  setTarget(series)
                  setChoosing(false)
                }}
              />
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Fusionner « {name} » dans <strong>« {target.name} »</strong> ? Vous pourrez l’annuler
              depuis l’administration.
            </span>
            <IconButton
              icon="check"
              variant="danger"
              label="Oui, fusionner"
              disabled={busy}
              onClick={merge}
            />
            <IconButton icon="close" label="Annuler" onClick={() => setTarget(null)} />
          </div>
        )}
      </div>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {done && !error && <FormMessage kind="success">{done}</FormMessage>}
    </section>
  )
}
