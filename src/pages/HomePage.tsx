import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'

const linkClass = 'rounded border border-indigo-600 px-4 py-2 font-medium text-indigo-600'

export default function HomePage() {
  const { user, loading } = useAuth()

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">BDbyNico</h1>
      <p className="text-slate-600">Gérez votre collection de bandes dessinées.</p>
      {!loading &&
        (user ? (
          <div className="flex gap-3">
            <Link to="/collection" className={linkClass}>
              Ma collection
            </Link>
            <Link to="/profil" className={linkClass}>
              Mon profil
            </Link>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link to="/connexion" className={linkClass}>
              Se connecter
            </Link>
            <Link to="/inscription" className={linkClass}>
              Créer un compte
            </Link>
          </div>
        ))}
    </main>
  )
}
