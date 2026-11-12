import { useState, type FormEvent } from 'react'

import { useAuth } from '../../auth/useAuth'
import { validatePassword } from '../../auth/validation'
import FormMessage from '../../components/FormMessage'
import PasswordField from '../../components/PasswordField'
import PasswordStrength from '../../components/PasswordStrength'
import SubmitButton from '../../components/SubmitButton'

/** Changement de mot de passe depuis le profil : l'ancien est redemandé et vérifié d'abord. */
export default function ChangePasswordSection() {
  const { user, signIn, updatePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setDone(false)
    const invalid = validatePassword(next)
    if (invalid) return setError(invalid)
    if (next !== confirm) return setError('Les deux nouveaux mots de passe sont différents.')
    if (next === current) return setError("Le nouveau mot de passe doit différer de l'actuel.")
    if (!user?.email) return setError('Compte introuvable : reconnectez-vous.')

    setBusy(true)
    setError(null)
    // Une session volée ne suffit pas à changer le mot de passe : on revérifie l'ancien
    const check = await signIn(user.email, current)
    if (check.error) {
      setBusy(false)
      return setError('Le mot de passe actuel est incorrect.')
    }
    const result = await updatePassword(next)
    setBusy(false)
    if (result.error) return setError(result.error)
    setCurrent('')
    setNext('')
    setConfirm('')
    setDone(true)
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="text-xl">Mot de passe</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <PasswordField
          label="Mot de passe actuel"
          name="current-password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <PasswordField
          label="Nouveau mot de passe (8 caractères minimum)"
          name="new-password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <PasswordStrength value={next} />
        <PasswordField
          label="Confirmer le nouveau mot de passe"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        {done && <FormMessage kind="success">Mot de passe modifié.</FormMessage>}
        <SubmitButton busy={busy}>Changer le mot de passe</SubmitButton>
      </form>
    </section>
  )
}
