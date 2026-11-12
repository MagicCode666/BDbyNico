import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import PasswordField from '../components/PasswordField'
import TextField from '../components/TextField'

export default function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string; accountDeleted?: boolean } | null
  const from = state?.from ?? '/'
  const accountDeleted = state?.accountDeleted === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await signIn(email, password)
    setBusy(false)
    if (result.error) setError(result.error)
    else navigate(from, { replace: true })
  }

  return (
    <AuthCard
      title="Connexion"
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="text-accent-text underline">
            Créer un compte
          </Link>
        </>
      }
    >
      {accountDeleted && (
        <FormMessage kind="success">
          Votre compte et vos données ont été supprimés. À bientôt !
        </FormMessage>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Mot de passe"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <SubmitButton busy={busy}>Se connecter</SubmitButton>
      </form>
      <p className="text-center text-sm">
        <Link to="/mot-de-passe-oublie" className="text-accent-text underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </AuthCard>
  )
}
