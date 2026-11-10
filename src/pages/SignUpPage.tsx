import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import {
  PSEUDO_MAX_LENGTH,
  validateEmail,
  validatePassword,
  validatePseudo,
} from '../auth/validation'
import AuthCard from '../components/AuthCard'
import FormMessage from '../components/FormMessage'
import SubmitButton from '../components/SubmitButton'
import TextField from '../components/TextField'

export default function SignUpPage() {
  const { user, signUp } = useAuth()
  const [pseudo, setPseudo] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const invalid = validatePseudo(pseudo) ?? validateEmail(email) ?? validatePassword(password)
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)
    const result = await signUp(email, password, pseudo)
    setBusy(false)
    if (result.error) setError(result.error)
    else setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Vérifiez vos emails"
        footer={
          <Link to="/connexion" className="text-accent-text underline">
            Retour à la connexion
          </Link>
        }
      >
        <FormMessage kind="success">
          {`Un email de confirmation a été envoyé à ${sentTo}. Cliquez sur le lien qu'il contient pour activer votre compte, puis connectez-vous.`}
        </FormMessage>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Créer un compte"
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/connexion" className="text-accent-text underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Pseudo"
          name="pseudo"
          autoComplete="nickname"
          maxLength={PSEUDO_MAX_LENGTH}
          required
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Mot de passe (8 caractères minimum)"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <SubmitButton busy={busy}>Créer mon compte</SubmitButton>
      </form>
    </AuthCard>
  )
}
