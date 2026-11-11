import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import PageLayout from '../../components/PageLayout'
import SubmitButton from '../../components/SubmitButton'
import TextField from '../../components/TextField'
import { normalizeIsbn } from '../../lib/isbn'
import { setEditionKind } from '../governance/api'
import { addAlbum, AlreadyInCollectionError } from './api'
import { KIND_LABELS, toAlbumKind, type AlbumKind } from './kinds'
import { findAlbumInfo, type LookupSource } from './lookup'
import BarcodeScanner from './scan/BarcodeScanner'
import { STATUS_LABELS, type Status } from './types'

const optional = (value: string) => value.trim() || undefined

type Lookup =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; source: LookupSource }
  | { kind: 'notfound' }
  | { kind: 'failed' }

const SOURCE_LABELS: Record<LookupSource, string> = {
  catalogue: 'le catalogue partagé',
  bnf: 'la BnF',
  openlibrary: 'Open Library',
  'bnf+openlibrary': 'la BnF et Open Library',
}

export default function AddAlbumPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Arrivée depuis la page d'une série (tome manquant) : série et tome sont préremplis
  const [searchParams] = useSearchParams()
  const prefillSeries = searchParams.get('serie') ?? ''
  const prefillVolume = /^\d+$/.test(searchParams.get('tome') ?? '')
    ? (searchParams.get('tome') ?? '')
    : ''
  const [isbn, setIsbn] = useState('')
  const [title, setTitle] = useState('')
  const [seriesName, setSeriesName] = useState(prefillSeries)
  const [volume, setVolume] = useState(prefillVolume)
  const [authors, setAuthors] = useState('')
  const [publisher, setPublisher] = useState('')
  const [publishedOn, setPublishedOn] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  // « catalogue » : référencer l'album sans l'ajouter à sa collection ni à ses envies
  const [status, setStatus] = useState<Status | 'catalogue'>(
    searchParams.get('statut') === 'catalogue' ? 'catalogue' : 'owned',
  )
  // Intégrale ou hors-série : deviné par la recherche, que l'on confirme ici
  const [kind, setKind] = useState<AlbumKind>('album')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [source, setSource] = useState<LookupSource | null>(null)
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' })
  const [coverBroken, setCoverBroken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  // Dernier ISBN recherché : permet d'ignorer les réponses arrivées en retard
  const lastLookup = useRef<string | null>(null)

  async function runLookup(normalizedIsbn: string) {
    if (lastLookup.current === normalizedIsbn) return
    lastLookup.current = normalizedIsbn
    setLookup({ kind: 'searching' })
    try {
      const result = await findAlbumInfo(normalizedIsbn)
      if (lastLookup.current !== normalizedIsbn) return
      if (!result) {
        setSource(null)
        setLookup({ kind: 'notfound' })
        return
      }
      const { info } = result
      setTitle(info.title ?? '')
      setSeriesName(info.seriesName ?? prefillSeries)
      setVolume(info.volume?.toString() ?? prefillVolume)
      setAuthors(info.authors.join(', '))
      setPublisher(info.publisher ?? '')
      setPublishedOn(info.publishedOn ?? '')
      setCoverUrl(info.coverUrl ?? '')
      setKind(toAlbumKind(info.kind))
      setRangeFrom(info.volumeFrom?.toString() ?? '')
      setRangeTo(info.volumeTo?.toString() ?? '')
      setCoverBroken(false)
      setSource(result.source)
      setLookup({ kind: 'found', source: result.source })
    } catch {
      if (lastLookup.current !== normalizedIsbn) return
      lastLookup.current = null // permet de réessayer
      setLookup({ kind: 'failed' })
    }
  }

  function onIsbnChange(value: string) {
    setIsbn(value)
    setError(null)
    const cleaned = value.replace(/[\s-]/g, '')
    const normalized = normalizeIsbn(value)
    // Recherche automatique dès qu'un ISBN-13 complet et valide est saisi
    // (un ISBN-10 passe par le bouton ou la sortie du champ, pour ne pas confondre avec un début d'ISBN-13)
    if (normalized && cleaned.length === 13) void runLookup(normalized)
  }

  function onScanned(scannedIsbn: string) {
    setScanning(false)
    setIsbn(scannedIsbn)
    setError(null)
    void runLookup(scannedIsbn)
  }

  function onSearchClick() {
    const normalized = normalizeIsbn(isbn)
    if (!normalized) return setError('ISBN invalide (10 ou 13 chiffres, clé de contrôle comprise).')
    setError(null)
    void runLookup(normalized)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const normalizedIsbn = normalizeIsbn(isbn)
    if (!normalizedIsbn)
      return setError('ISBN invalide (10 ou 13 chiffres, clé de contrôle comprise).')
    if (!title.trim()) return setError('Le titre est obligatoire.')
    const volumeNumber = volume.trim() === '' ? undefined : Number(volume)
    if (volumeNumber !== undefined && (!Number.isInteger(volumeNumber) || volumeNumber < 0)) {
      return setError('Le numéro de tome doit être un entier positif.')
    }
    if (coverUrl.trim() && !/^https?:\/\//.test(coverUrl.trim())) {
      return setError("L'adresse de la couverture doit commencer par http:// ou https://.")
    }

    // Plage de tomes d'une intégrale : les deux numéros, ou aucun (toute la série)
    let fromNumber: number | null = null
    let toNumber: number | null = null
    if (kind === 'integral' && (rangeFrom.trim() !== '' || rangeTo.trim() !== '')) {
      fromNumber = Number(rangeFrom)
      toNumber = Number(rangeTo)
      if (
        rangeFrom.trim() === '' ||
        rangeTo.trim() === '' ||
        !Number.isInteger(fromNumber) ||
        !Number.isInteger(toNumber) ||
        fromNumber < 0 ||
        toNumber > 999 ||
        fromNumber > toNumber
      ) {
        return setError(
          'Indiquez le premier et le dernier tome repris (le premier ne dépasse pas le dernier), ou laissez les deux vides.',
        )
      }
    }

    setBusy(true)
    setError(null)
    try {
      await addAlbum(user.id, {
        isbn: normalizedIsbn,
        title: title.trim(),
        seriesName: optional(seriesName),
        volume: volumeNumber,
        authors: authors
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        publisher: optional(publisher),
        publishedOn: optional(publishedOn),
        coverUrl: optional(coverUrl),
        status: status === 'catalogue' ? null : status,
        source: source ?? 'manual',
      })
      // Le type se règle une fois l'album ajouté (réservé aux possesseurs) ; un échec n'empêche pas
      // l'ajout : il se corrige depuis la fiche de l'album
      if (kind !== 'album') {
        await setEditionKind(normalizedIsbn, kind, fromNumber, toNumber).catch(() => undefined)
      }
      navigate(`/collection/${normalizedIsbn}`, { replace: true })
    } catch (e) {
      setError(e instanceof AlreadyInCollectionError ? e.message : "Impossible d'ajouter l'album.")
      setBusy(false)
    }
  }

  const showCover = /^https?:\/\//.test(coverUrl.trim()) && !coverBroken

  return (
    <PageLayout title="Ajouter un album">
      <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="ISBN *"
              name="isbn"
              inputMode="numeric"
              placeholder="978-2-…"
              value={isbn}
              onChange={(e) => onIsbnChange(e.target.value)}
              onBlur={() => {
                const normalized = normalizeIsbn(isbn)
                if (normalized) void runLookup(normalized)
              }}
            />
          </div>
          <IconButton
            icon="search"
            size="lg"
            label="Rechercher"
            disabled={lookup.kind === 'searching'}
            onClick={onSearchClick}
          />
          <IconButton
            icon="scan"
            size="lg"
            label="Scanner un code-barres"
            pressed={scanning}
            onClick={() => setScanning((on) => !on)}
          />
        </div>
        {scanning && <BarcodeScanner onDetect={onScanned} onClose={() => setScanning(false)} />}
        {lookup.kind === 'searching' && <p className="text-sm text-muted">Recherche…</p>}
        {lookup.kind === 'found' && (
          <FormMessage kind="success">
            {`Informations trouvées dans ${SOURCE_LABELS[lookup.source]}. Vérifiez-les et corrigez-les si besoin.`}
          </FormMessage>
        )}
        {lookup.kind === 'notfound' && (
          <FormMessage kind="error">
            Aucune information trouvée pour cet ISBN. Saisissez-les à la main.
          </FormMessage>
        )}
        {lookup.kind === 'failed' && (
          <FormMessage kind="error">
            Recherche impossible pour le moment (réseau ?). Réessayez ou saisissez les informations
            à la main.
          </FormMessage>
        )}

        {showCover && (
          <img
            src={coverUrl.trim()}
            alt="Aperçu de la couverture"
            referrerPolicy="no-referrer"
            onError={() => setCoverBroken(true)}
            className="h-48 w-32 rounded bg-raised object-cover"
          />
        )}

        <TextField
          label="Titre *"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <TextField
            label="Série"
            name="series"
            value={seriesName}
            onChange={(e) => setSeriesName(e.target.value)}
          />
          <TextField
            label="Tome"
            name="volume"
            type="number"
            min={0}
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
          />
        </div>
        <TextField
          label="Auteurs (séparés par des virgules)"
          name="authors"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Éditeur"
            name="publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
          />
          <TextField
            label="Date de parution"
            name="publishedOn"
            type="date"
            value={publishedOn}
            onChange={(e) => setPublishedOn(e.target.value)}
          />
        </div>
        <TextField
          label="Adresse de la couverture (URL)"
          name="coverUrl"
          type="url"
          placeholder="https://…"
          value={coverUrl}
          onChange={(e) => {
            setCoverUrl(e.target.value)
            setCoverBroken(false)
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="album-kind" className="text-sm font-medium">
            Type d'album
          </label>
          <select
            id="album-kind"
            value={kind}
            onChange={(e) => setKind(toAlbumKind(e.target.value))}
            className="rounded border border-line-strong px-3 py-2"
          >
            {(Object.keys(KIND_LABELS) as AlbumKind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
          {kind === 'integral' && (
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                label="Premier tome repris"
                name="range-from"
                inputMode="numeric"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
              <TextField
                label="Dernier tome repris"
                name="range-to"
                inputMode="numeric"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
              />
              <p className="w-full text-xs text-muted">
                Laissez les deux vides pour une intégrale de toute la série. Une intégrale est un
                objet distinct des tomes qu'elle reprend.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Statut
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | 'catalogue')}
            className="rounded border border-line-strong px-3 py-2"
          >
            {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
            <option value="catalogue">Catalogue seulement (ni possédé, ni en envie)</option>
          </select>
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <SubmitButton busy={busy}>
          {status === 'catalogue' ? 'Enregistrer dans le catalogue' : 'Ajouter'}
        </SubmitButton>
      </form>
    </PageLayout>
  )
}
