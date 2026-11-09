import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { validatePassword } from '../auth/validation'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'

export default function ResetPasswordPage() {
  const { user, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="p-6 text-center text-slate-600">Chargement…</p>

  if (!user) {
    return (
      <AuthCard
        title="Lien invalide"
        footer={
          <Link to="/mot-de-passe-oublie" className="text-indigo-600 underline">
            Demander un nouveau lien
          </Link>
        }
      >
        <FormMessage kind="error">
          Ce lien de réinitialisation est invalide ou a expiré.
        </FormMessage>
      </AuthCard>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const invalid = validatePassword(password)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)
    const result = await updatePassword(password)
    setBusy(false)
    if (result.error) setError(result.error)
    else navigate('/', { replace: true })
  }

  return (
    <AuthCard title="Nouveau mot de passe">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Nouveau mot de passe (8 caractères minimum)"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <SubmitButton busy={busy}>Enregistrer</SubmitButton>
      </form>
    </AuthCard>
  )
}
