import { useEffect } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'

import RequireAuth from './auth/RequireAuth'
import { useAuth } from './auth/useAuth'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SignUpPage from './pages/SignUpPage'

export default function App() {
  const { passwordRecovery } = useAuth()
  const navigate = useNavigate()

  // Arrivée depuis le lien « mot de passe oublié » : on ouvre la page de nouveau mot de passe
  useEffect(() => {
    if (passwordRecovery) navigate('/nouveau-mot-de-passe', { replace: true })
  }, [passwordRecovery, navigate])

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<SignUpPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/profil" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
