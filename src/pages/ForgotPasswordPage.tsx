import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { validateEmail } from '../auth/validation'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const invalid = validateEmail(email)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)
    const result = await requestPasswordReset(email)
    setBusy(false)
    if (result.error) setError(result.error)
    else setSent(true)
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      footer={
        <Link to="/connexion" className="text-accent-text underline">
          Retour à la connexion
        </Link>
      }
    >
      {sent ? (
        <FormMessage kind="success">
          {
            "Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé."
          }
        </FormMessage>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <SubmitButton busy={busy}>Envoyer le lien</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
