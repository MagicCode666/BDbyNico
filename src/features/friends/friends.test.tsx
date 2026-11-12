import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthContextValue } from '../../auth/AuthContext'
import { AuthContext } from '../../auth/AuthContext'
import ThemeProvider from '../../theme/ThemeProvider'
import type { SharedRow } from '../sharing/api'
import FriendLibraryPage from './FriendLibraryPage'
import FriendsPage from './FriendsPage'
import InvitePage from './InvitePage'
import type { Friend, FriendRequest } from './api'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => ({ pseudo: 'Nico', role: 'user' }),
  ROLE_LABELS: { user: 'Collectionneur', moderator: 'Modérateur', admin: 'Administrateur' },
}))
vi.mock('./useIncomingRequests', () => ({ useIncomingRequests: () => 0 }))

const listFriends = vi.fn<() => Promise<Friend[]>>()
const listFriendRequests = vi.fn<() => Promise<FriendRequest[]>>()
const sendFriendRequest = vi.fn()
const respondToRequest = vi.fn()
const cancelRequest = vi.fn()
const removeFriend = vi.fn()
const setFriendSharing = vi.fn()
const acceptInvite = vi.fn()
const getFriendCollection = vi.fn<(id: string) => Promise<SharedRow[]>>()

vi.mock('./api', () => ({
  listFriends: () => listFriends(),
  listFriendRequests: () => listFriendRequests(),
  sendFriendRequest: (...a: unknown[]) => sendFriendRequest(...a),
  respondToRequest: (...a: unknown[]) => respondToRequest(...a),
  cancelRequest: (...a: unknown[]) => cancelRequest(...a),
  removeFriend: (...a: unknown[]) => removeFriend(...a),
  setFriendSharing: (...a: unknown[]) => setFriendSharing(...a),
  acceptInvite: (...a: unknown[]) => acceptInvite(...a),
  loadInviteToken: async () => 'jeton-invitation',
  regenerateInviteToken: async () => 'nouveau-jeton',
}))
vi.mock('../sharing/api', () => ({ getFriendCollection: (id: string) => getFriendCollection(id) }))

const noop = async () => ({ error: null })
const auth: AuthContextValue = {
  session: null,
  user: { id: 'me' } as AuthContextValue['user'],
  loading: false,
  passwordRecovery: false,
  signUp: noop,
  signIn: noop,
  signOut: noop,
  requestPasswordReset: noop,
  updatePassword: noop,
}

const bruno: Friend = { id: 'f1', pseudo: 'Bruno', iShare: true, theyShare: true, avatar: null }
const row = (extra: Partial<SharedRow> = {}): SharedRow => ({
  pseudo: 'Bruno',
  isbn: 'isbn-1',
  title: 'Tome 1',
  seriesId: 's1',
  seriesName: 'Black Op',
  seriesTotal: 4,
  seriesStatus: 'finished',
  startsAtZero: false,
  volume: 1,
  volumeFrom: null,
  volumeTo: null,
  kind: 'album',
  authors: [],
  coverUrl: null,
  status: 'owned',
  dedicated: false,
  ...extra,
})

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/amis" element={<FriendsPage />} />
            <Route path="/amis/invitation/:token" element={<InvitePage />} />
            <Route path="/amis/:friendId" element={<FriendLibraryPage />} />
            <Route path="/amis/:friendId/:seriesId" element={<FriendLibraryPage />} />
            <Route path="/collection" element={<p>Ma collection</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

describe('FriendsPage', () => {
  beforeEach(() => {
    for (const fn of [
      sendFriendRequest,
      respondToRequest,
      cancelRequest,
      removeFriend,
      setFriendSharing,
    ]) {
      fn.mockReset().mockResolvedValue(undefined)
    }
    listFriends.mockReset().mockResolvedValue([bruno])
    listFriendRequests.mockReset().mockResolvedValue([
      { userId: 'u2', pseudo: 'Chloé', direction: 'in', avatar: null },
      { userId: 'u3', pseudo: 'Denis', direction: 'out', avatar: null },
    ])
  })
  afterEach(cleanup)

  it('liste les amis, les demandes reçues et les demandes envoyées', async () => {
    renderAt('/amis')
    expect(await screen.findByRole('link', { name: 'Bruno' })).toBeTruthy()
    expect(screen.getByText('Chloé')).toBeTruthy()
    expect(screen.getByText('Denis')).toBeTruthy()
    expect(screen.getByLabelText('Lien d’invitation')).toBeTruthy()
  })

  it('accepte et refuse une demande reçue', async () => {
    renderAt('/amis')
    fireEvent.click(await screen.findByRole('button', { name: 'Accepter la demande de Chloé' }))
    await waitFor(() => expect(respondToRequest).toHaveBeenCalledWith('u2', true))
    fireEvent.click(screen.getByRole('button', { name: 'Refuser la demande de Chloé' }))
    await waitFor(() => expect(respondToRequest).toHaveBeenCalledWith('u2', false))
  })

  it('envoie une demande sans dire si le pseudo existe', async () => {
    renderAt('/amis')
    fireEvent.change(await screen.findByLabelText('Pseudo de l’ami'), { target: { value: 'Zoé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }))
    await waitFor(() => expect(sendFriendRequest).toHaveBeenCalledWith('Zoé'))
    expect(await screen.findByText('Si ce pseudo existe, la demande a été envoyée.')).toBeTruthy()
  })

  it('coupe le partage pour un ami, sans le retirer', async () => {
    renderAt('/amis')
    fireEvent.click(await screen.findByRole('switch', { name: /Bruno voit ma bibliothèque/ }))
    await waitFor(() => expect(setFriendSharing).toHaveBeenCalledWith('f1', false))
    expect(removeFriend).not.toHaveBeenCalled()
  })

  it('demande confirmation avant de retirer un ami', async () => {
    renderAt('/amis')
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer Bruno de mes amis' }))
    expect(removeFriend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retirer cet ami' }))
    await waitFor(() => expect(removeFriend).toHaveBeenCalledWith('f1'))
  })

  it('annule une demande envoyée', async () => {
    renderAt('/amis')
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler la demande à Denis' }))
    await waitFor(() => expect(cancelRequest).toHaveBeenCalledWith('u3'))
  })

  it('ne propose pas la bibliothèque d’un ami qui ne partage pas', async () => {
    listFriends.mockResolvedValue([{ ...bruno, theyShare: false }])
    renderAt('/amis')
    expect(await screen.findByText(/ne partage pas sa bibliothèque avec vous/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Bruno' })).toBeNull()
  })
})

describe('FriendLibraryPage', () => {
  beforeEach(() => {
    listFriends.mockReset().mockResolvedValue([bruno])
    getFriendCollection.mockReset().mockResolvedValue([row(), row({ isbn: 'isbn-2', volume: 2 })])
  })
  afterEach(cleanup)

  it('affiche la bibliothèque de l’ami en lecture seule, avec retour à la mienne', async () => {
    renderAt('/amis/f1')
    expect(await screen.findByText(/lecture seule/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Bruno' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Black Op' }).getAttribute('href')).toBe('/amis/f1/s1')
    expect(screen.getByRole('link', { name: 'Revenir à ma collection' }).getAttribute('href')).toBe(
      '/collection',
    )
    // lecture seule : aucun bouton d'état d'album
    expect(screen.queryByRole('button', { name: /Ajouter à ma collection/ })).toBeNull()
  })

  it('refuse quelqu’un qui n’est pas un ami', async () => {
    listFriends.mockResolvedValue([])
    getFriendCollection.mockResolvedValue([])
    renderAt('/amis/inconnu')
    expect(await screen.findByText('Cette personne n’est pas dans vos amis.')).toBeTruthy()
  })

  it('n’affiche rien quand l’ami ne partage pas', async () => {
    listFriends.mockResolvedValue([{ ...bruno, theyShare: false }])
    getFriendCollection.mockResolvedValue([])
    renderAt('/amis/f1')
    expect(await screen.findByText(/Bruno ne partage pas sa bibliothèque/)).toBeTruthy()
  })
})

describe('InvitePage', () => {
  beforeEach(() => {
    acceptInvite.mockReset()
  })
  afterEach(cleanup)

  it('conclut l’amitié avec la personne qui invitait', async () => {
    acceptInvite.mockResolvedValue('Alice')
    renderAt('/amis/invitation/abc')
    expect(await screen.findByText('Vous êtes maintenant ami avec Alice.')).toBeTruthy()
    expect(acceptInvite).toHaveBeenCalledWith('abc')
    expect(acceptInvite).toHaveBeenCalledTimes(1)
  })

  it('explique un lien qui n’est plus valide', async () => {
    acceptInvite.mockImplementation(() => Promise.reject(new Error('Lien d’invitation invalide')))
    renderAt('/amis/invitation/vieux')
    expect(await screen.findByText(/n’est plus valide/)).toBeTruthy()
  })
})
