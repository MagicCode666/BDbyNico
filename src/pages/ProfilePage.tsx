import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { PSEUDO_MAX_LENGTH, validatePseudo } from '../auth/validation'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'
import ClearCollectionDialog from '../features/collection/ClearCollectionDialog'
import { exportCollection } from '../features/export/exportCollection'
import { countPending } from '../features/governance/api'
import { useAccess } from '../features/governance/useAccess'
import { supabase } from '../lib/supabase'

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
    <AuthCard
      title="Mon profil"
      footer={
        <Link to="/" className="text-accent-text underline">
          Retour à l'accueil
        </Link>
      }
    >
      <p className="text-center text-sm text-muted">{user?.email}</p>
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

      {isModerator && (
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h2 className="font-semibold">Administration</h2>
          <Link
            to="/admin"
            className="rounded border border-line-strong px-4 py-2 text-center font-medium hover:bg-raised"
          >
            Catalogue : propositions et journal
            {pendingCount > 0 && ` (${pendingCount} à valider)`}
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className="font-semibold">Mes données</h2>
        <p className="text-sm text-muted">
          Téléchargez votre collection (CSV). Ce fichier peut être réimporté dans BDbyNico.
        </p>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded border border-line-strong px-4 py-2 font-medium hover:bg-raised disabled:opacity-50"
        >
          {exporting ? 'Export en cours…' : 'Exporter ma collection'}
        </button>
        {exportMessage && <FormMessage kind="success">{exportMessage}</FormMessage>}
      </section>

      <section className="flex flex-col gap-2 rounded border border-danger p-3">
        <h2 className="font-semibold text-danger-text">Zone dangereuse</h2>
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

      {clearing && userId && (
        <ClearCollectionDialog
          userId={userId}
          onCancel={() => setClearing(false)}
          onDone={() => navigate('/collection', { replace: true })}
        />
      )}
    </AuthCard>
  )
}
