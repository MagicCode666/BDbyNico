import { useEffect } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'

import RequireAuth from './auth/RequireAuth'
import { useAuth } from './auth/useAuth'
import AddAlbumPage from './features/collection/AddAlbumPage'
import AlbumPage from './features/collection/AlbumPage'
import CollectionPage from './features/collection/CollectionPage'
import FriendLibraryPage from './features/friends/FriendLibraryPage'
import FriendsPage from './features/friends/FriendsPage'
import InvitePage from './features/friends/InvitePage'
import AdminPage from './features/governance/AdminPage'
import ImportPage from './features/import/ImportPage'
import ExplorerPage from './features/explorer/ExplorerPage'
import SearchPage from './features/search/SearchPage'
import SeriesPage from './features/series/SeriesPage'
import SharedPage from './features/sharing/SharedPage'
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
      <Route path="/partage/:token" element={<SharedPage />} />
      <Route path="/partage/:token/:seriesId" element={<SharedPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/recherche" element={<SearchPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/collection/ajouter" element={<AddAlbumPage />} />
        <Route path="/collection/importer" element={<ImportPage />} />
        <Route path="/collection/:isbn" element={<AlbumPage />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/amis" element={<FriendsPage />} />
        <Route path="/amis/invitation/:token" element={<InvitePage />} />
        <Route path="/amis/:friendId" element={<FriendLibraryPage />} />
        <Route path="/amis/:friendId/:seriesId" element={<FriendLibraryPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}
