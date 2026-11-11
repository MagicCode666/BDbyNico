import { useState } from 'react'

import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import {
  correctEdition,
  governanceErrorMessage,
  setEditionSeries,
  type EditionCorrections,
} from '../governance/api'
import SeriesPicker from '../governance/SeriesPicker'
import type { Edition } from './types'

const FIELD =
  'rounded border border-line-strong bg-surface px-3 py-2 focus:border-accent focus:outline-none'

/**
 * Correction des informations d'un album (modérateurs) : titre, numéro de tome, auteurs, éditeur,
 * date de parution et série. Chaque changement est partagé, journalisé et annulable.
 */
export default function EditionCorrector({
  edition,
  onChanged,
}: {
  edition: Edition
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(edition.title)
  const [volume, setVolume] = useState(edition.volume?.toString() ?? '')
  const [authors, setAuthors] = useState(edition.authors.join('\n'))
  const [publisher, setPublisher] = useState(edition.publisher ?? '')
  const [publishedOn, setPublishedOn] = useState(edition.publishedOn ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [choosingSeries, setChoosingSeries] = useState(false)

  async function run(action: () => Promise<unknown>, failure: string, success: string) {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await action()
      setDone(success)
      onChanged()
    } catch (caught) {
      setError(governanceErrorMessage(caught, failure))
    }
    setBusy(false)
  }

  function save() {
    const changes: EditionCorrections = {}
    if (title.trim() !== edition.title) changes.title = title.trim()
    const volumeNumber = volume.trim() === '' ? null : Number(volume)
    if (volumeNumber !== null && !Number.isInteger(volumeNumber)) {
      setError('Le numéro de tome doit être un nombre entier.')
      return
    }
    if (volumeNumber !== edition.volume) changes.volume = volumeNumber
    const authorList = authors
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
    if (authorList.join('\n') !== edition.authors.join('\n')) changes.authors = authorList
    if (publisher.trim() !== (edition.publisher ?? '')) changes.publisher = publisher.trim() || null
    if (publishedOn !== (edition.publishedOn ?? '')) changes.publishedOn = publishedOn || null
    if (Object.keys(changes).length === 0) {
      setDone('Aucun changement.')
      return
    }
    void run(
      () => correctEdition(edition.isbn, changes),
      'Impossible d’enregistrer les corrections.',
      'Corrections enregistrées.',
    )
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <IconButton
          icon="edit"
          label="Corriger les informations de l’album"
          onClick={() => setOpen(true)}
        />
        <span className="text-sm text-muted">Corriger les informations (modérateur)</span>
      </div>
    )
  }

  return (
    <section
      className="flex flex-col gap-4 rounded border border-accent p-4"
      aria-labelledby="correction-titre"
    >
      <h3 id="correction-titre" className="font-display text-lg font-bold">
        Corriger l’album
      </h3>
      <p className="text-sm text-muted">
        Ces informations sont partagées par tous les utilisateurs. Chaque changement est journalisé
        et peut être annulé depuis l’administration.
      </p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Titre
        <input
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex max-w-40 flex-col gap-1 text-sm font-medium">
        Numéro de tome
        <input
          value={volume}
          inputMode="numeric"
          placeholder="Aucun"
          onChange={(e) => setVolume(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Auteurs (un par ligne)
        <textarea
          rows={3}
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          className={FIELD}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
          Éditeur
          <input
            value={publisher}
            maxLength={200}
            onChange={(e) => setPublisher(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date de parution
          <input
            type="date"
            value={publishedOn}
            onChange={(e) => setPublishedOn(e.target.value)}
            className={FIELD}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          icon="check"
          variant="primary"
          size="lg"
          label="Enregistrer les corrections"
          disabled={busy}
          onClick={save}
        />
        <IconButton icon="close" size="lg" label="Fermer" onClick={() => setOpen(false)} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <p className="text-sm">
          <span className="text-muted">Série : </span>
          <strong>{edition.series?.name ?? 'aucune'}</strong>
        </p>
        <div className="flex items-center gap-2">
          {edition.series && (
            <IconButton
              icon="close"
              variant="danger"
              label="Retirer l’album de sa série"
              disabled={busy}
              onClick={() =>
                run(
                  () => setEditionSeries(edition.isbn, null),
                  'Impossible de retirer l’album de sa série.',
                  'Album retiré de sa série.',
                )
              }
            />
          )}
          <IconButton
            icon="search"
            label="Rattacher à une autre série"
            pressed={choosingSeries}
            onClick={() => setChoosingSeries((on) => !on)}
          />
        </div>
        {choosingSeries && (
          <SeriesPicker
            excludeId={edition.series?.id}
            label="Rattacher à la série"
            onPick={(series) => {
              setChoosingSeries(false)
              void run(
                () => setEditionSeries(edition.isbn, series.id),
                'Impossible de rattacher l’album à cette série.',
                `Album rattaché à « ${series.name} ».`,
              )
            }}
          />
        )}
      </div>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {done && !error && <FormMessage kind="success">{done}</FormMessage>}
    </section>
  )
}
