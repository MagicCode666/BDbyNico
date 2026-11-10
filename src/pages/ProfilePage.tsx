import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { PSEUDO_MAX_LENGTH, validatePseudo } from '../auth/validation'
import FormMessage from '../components/FormMessage'
import PageLayout from '../components/PageLayout'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'
import ClearCollectionDialog from '../features/collection/ClearCollectionDialog'
import { exportCollection } from '../features/export/exportCollection'
import { countPending } from '../features/governance/api'
import { useAccess } from '../features/governance/useAccess'
import { supabase } from '../lib/supabase'
import { THEME_LABELS, toPreference, type ThemePreference } from '../theme/theme'
import { useTheme } from '../theme/useTheme'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = user?.id
  const [pseudo, setPseudo] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const { access } = useAccess()
  const { preference, setPreference } = useTheme()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', userId)
      .single()
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) setError('Impossible de charger le profil.')
        else setPseudo(data.pseudo)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!userId) return
    const invalid = validatePseudo(pseudo)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ pseudo: pseudo.trim() })
      .eq('id', userId)
    setBusy(false)
    if (updateError) setError("Impossible d'enregistrer le pseudo.")
    else setSaved(true)
  }

  async function onExport() {
    setExporting(true)
    setExportMessage(null)
    try {
      const count = await exportCollection()
      setExportMessage(`${count} album${count > 1 ? 's' : ''} exporté${count > 1 ? 's' : ''}.`)
    } catch {
      setError("Impossible d'exporter la collection.")
    }
    setExporting(false)
  }

  // Propositions à valider (modérateurs seulement)
  const isModerator = access.isModerator
  useEffect(() => {
    if (!isModerator) return
    let cancelled = false
    countPending()
      .then((count) => !cancelled && setPendingCount(count))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isModerator])

  async function onSignOut() {
    await signOut()
    navigate('/connexion', { replace: true })
  }

  return (
    <PageLayout title="Mon profil">
      <div className="flex max-w-2xl flex-col gap-5">
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-xl">Mon compte</h2>
          <p className="text-sm text-muted">{user?.email}</p>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <TextField
              label="Pseudo"
              name="pseudo"
              maxLength={PSEUDO_MAX_LENGTH}
              disabled={!loaded}
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
            />
            {error && <FormMessage kind="error">{error}</FormMessage>}
            {saved && <FormMessage kind="success">Pseudo enregistré.</FormMessage>}
            <SubmitButton busy={busy}>Enregistrer</SubmitButton>
          </form>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded border border-line-strong px-4 py-2 font-medium hover:bg-raised"
          >
            Se déconnecter
          </button>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-xl">Apparence</h2>
          <label htmlFor="theme" className="text-sm font-medium">
            Thème
          </label>
          <select
            id="theme"
            value={preference}
            onChange={(e) => setPreference(toPreference(e.target.value))}
            className="rounded border border-line-strong px-3 py-2 focus:border-accent focus:outline-none"
          >
            {(Object.keys(THEME_LABELS) as ThemePreference[]).map((value) => (
              <option key={value} value={value}>
                {THEME_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted">
            « Automatique » suit le réglage de votre appareil (mode sombre ou clair).
          </p>
        </section>

        {isModerator && (
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-xl">Administration</h2>
            <Link
              to="/admin"
              className="rounded border border-line-strong px-4 py-2 text-center font-medium hover:bg-raised"
            >
              Catalogue : propositions et journal
              {pendingCount > 0 && ` (${pendingCount} à valider)`}
            </Link>
          </section>
        )}

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-xl">Mes données</h2>
          <p className="text-sm text-muted">
            Téléchargez votre collection (CSV). Ce fichier peut être réimporté dans BDbyNico.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="rounded border border-line-strong px-4 py-2 font-medium hover:bg-raised disabled:opacity-50"
            >
              {exporting ? 'Export en cours…' : 'Exporter ma collection'}
            </button>
            <Link
              to="/collection/importer"
              className="rounded border border-line-strong px-4 py-2 font-medium hover:bg-raised"
            >
              Importer une collection
            </Link>
          </div>
          {exportMessage && <FormMessage kind="success">{exportMessage}</FormMessage>}
        </section>

        <section className="flex flex-col gap-3 rounded border border-danger bg-danger-soft p-5">
          <h2 className="text-xl text-danger-text">Zone dangereuse</h2>
          <p className="text-sm text-muted">
            Retirer tous les albums de votre collection. Votre compte n'est pas supprimé.
          </p>
          <button
            type="button"
            onClick={() => setClearing(true)}
            className="rounded border border-danger px-4 py-2 font-medium text-danger-text hover:bg-danger-soft"
          >
            Vider ma collection…
          </button>
        </section>
      </div>

      {clearing && userId && (
        <ClearCollectionDialog
          userId={userId}
          onCancel={() => setClearing(false)}
          onDone={() => navigate('/collection', { replace: true })}
        />
      )}
    </PageLayout>
  )
}
