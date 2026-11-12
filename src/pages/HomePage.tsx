import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import Logo from '../components/Logo'
import PageFooter from '../components/PageFooter'
import Dashboard from '../features/home/Dashboard'

export default function HomePage() {
  const { user, loading } = useAuth()

  // Connecté : tableau de bord dans la navigation de l'application
  if (!loading && user) return <Dashboard />

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo className="h-14" linked={false} />
      <h1 className="sr-only">BDbyNico</h1>
      <p className="text-lg text-muted">Gérez votre collection de bandes dessinées.</p>
      {!loading && (
        <div className="flex gap-3">
          <Link
            to="/connexion"
            className="rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong"
          >
            Se connecter
          </Link>
          <Link
            to="/inscription"
            className="rounded border border-accent px-4 py-2 font-medium text-accent-text"
          >
            Créer un compte
          </Link>
        </div>
      )}
      <PageFooter className="mt-8" />
    </main>
  )
}
