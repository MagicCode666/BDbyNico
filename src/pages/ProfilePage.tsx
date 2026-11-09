import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { PSEUDO_MAX_LENGTH, validatePseudo } from '../auth/validation'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'
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

  async function onSignOut() {
    await signOut()
    navigate('/connexion', { replace: true })
  }

  return (
    <AuthCard
      title="Mon profil"
      footer={
        <Link to="/" className="text-indigo-600 underline">
          Retour à l'accueil
        </Link>
      }
    >
      <p className="text-center text-sm text-slate-600">{user?.email}</p>
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
        className="rounded border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
      >
        Se déconnecter
      </button>
    </AuthCard>
  )
}
