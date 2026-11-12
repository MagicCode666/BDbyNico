import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import CopyLinkField from '../../components/CopyLinkField'
import Dialog from '../../components/Dialog'
import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import PageLayout from '../../components/PageLayout'
import RegenerateLink from '../../components/RegenerateLink'
import Switch from '../../components/Switch'
import { appLink } from '../../lib/appLink'
import Avatar from '../avatar/Avatar'
import { governanceErrorMessage } from '../governance/api'
import { useAsync } from '../collection/useAsync'
import {
  cancelRequest,
  listFriendRequests,
  listFriends,
  loadInviteToken,
  regenerateInviteToken,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  setFriendSharing,
  type Friend,
} from './api'

const FIELD =
  'min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2 focus:border-accent focus:outline-none'

interface Overview {
  friends: Friend[]
  requests: Awaited<ReturnType<typeof listFriendRequests>>
}

async function loadOverview(): Promise<Overview> {
  const [friends, requests] = await Promise.all([listFriends(), listFriendRequests()])
  return { friends, requests }
}

/** Amis : demandes, lien d'invitation, et accès à leurs bibliothèques. */
export default function FriendsPage() {
  const { user } = useAuth()
  const { data, loading, error: loadError, reload } = useAsync(loadOverview)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pseudo, setPseudo] = useState('')
  const [removing, setRemoving] = useState<Friend | null>(null)
  const [invite, setInvite] = useState<string | null>(null)

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadInviteToken(userId)
      .then((token) => !cancelled && setInvite(token))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  const run = useCallback(
    async (action: () => Promise<unknown>, failure: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await action()
        reload()
      } catch (caught) {
        setError(governanceErrorMessage(caught, failure))
      }
      setBusy(false)
    },
    [reload],
  )

  function submit() {
    const value = pseudo.trim()
    if (!value) return
    void run(async () => {
      await sendFriendRequest(value)
      setPseudo('')
      // Même message que le pseudo existe ou non : on ne révèle pas qui est inscrit
      setNotice('Si ce pseudo existe, la demande a été envoyée.')
    }, 'Impossible d’envoyer la demande.')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  const incoming = data?.requests.filter((r) => r.direction === 'in') ?? []
  const outgoing = data?.requests.filter((r) => r.direction === 'out') ?? []
  const friends = data?.friends ?? []

  return (
    <PageLayout title="Amis" hideTitle crumbs={[{ label: 'Accueil', to: '/' }, { label: 'Amis' }]}>
      <div className="flex max-w-2xl flex-col gap-5">
        <h1 className="title-metal text-4xl">Amis</h1>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        {loadError && <FormMessage kind="error">Impossible de charger vos amis.</FormMessage>}
        {notice && <FormMessage kind="success">{notice}</FormMessage>}

        {incoming.length > 0 && (
          <section className="card flex flex-col gap-3 p-5" aria-labelledby="demandes-recues">
            <h2 id="demandes-recues" className="font-display text-xl font-bold">
              Demandes reçues
            </h2>
            <ul className="flex flex-col gap-2">
              {incoming.map((request) => (
                <li key={request.userId} className="flex items-center gap-2">
                  <Avatar src={request.avatar} name={request.pseudo} size="sm" />
                  <span className="flex-1 font-medium">{request.pseudo}</span>
                  <IconButton
                    icon="check"
                    variant="primary"
                    label={`Accepter la demande de ${request.pseudo}`}
                    disabled={busy}
                    onClick={() =>
                      run(() => respondToRequest(request.userId, true), 'Impossible d’accepter.')
                    }
                  />
                  <IconButton
                    icon="close"
                    label={`Refuser la demande de ${request.pseudo}`}
                    disabled={busy}
                    onClick={() =>
                      run(() => respondToRequest(request.userId, false), 'Impossible de refuser.')
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="ajouter-ami">
          <h2 id="ajouter-ami" className="font-display text-xl font-bold">
            Ajouter un ami
          </h2>
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <input
              aria-label="Pseudo de l’ami"
              placeholder="Son pseudo exact"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              className={FIELD}
            />
            <IconButton
              icon="plus"
              variant="primary"
              size="lg"
              label="Envoyer la demande"
              disabled={busy || pseudo.trim() === ''}
              onClick={submit}
            />
          </form>
          {invite && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-sm text-muted">
                Ou envoyez ce lien à quelqu’un qui a un compte : en l’ouvrant, il devient votre ami
                tout de suite. Ne le donnez qu’à des personnes de confiance.
              </p>
              <CopyLinkField
                label="Lien d’invitation"
                url={appLink(`/amis/invitation/${invite}`)}
              />
              <RegenerateLink
                busy={busy}
                onConfirm={async () => {
                  try {
                    setInvite(await regenerateInviteToken())
                  } catch {
                    setError('Impossible de générer un nouveau lien.')
                  }
                }}
              />
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="mes-amis">
          <h2 id="mes-amis" className="font-display text-xl font-bold">
            Mes amis
          </h2>
          {loading && !data && <p className="text-muted">Chargement…</p>}
          {data && friends.length === 0 && (
            <p className="text-sm text-muted">
              Pas encore d’ami : ajoutez quelqu’un par son pseudo, ou envoyez votre lien
              d’invitation.
            </p>
          )}
          <ul className="flex flex-col gap-4">
            {friends.map((friend) => (
              <li
                key={friend.id}
                className="flex flex-col gap-2 border-b border-line pb-3 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Avatar src={friend.avatar} name={friend.pseudo} size="sm" />
                  {friend.theyShare ? (
                    <Link
                      to={`/amis/${friend.id}`}
                      className="flex-1 font-medium text-accent-text underline"
                    >
                      {friend.pseudo}
                    </Link>
                  ) : (
                    <span className="flex-1 font-medium">{friend.pseudo}</span>
                  )}
                  {friend.theyShare && (
                    <IconButton
                      to={`/amis/${friend.id}`}
                      icon="library"
                      label={`Voir la bibliothèque de ${friend.pseudo}`}
                    />
                  )}
                  <IconButton
                    icon="trash"
                    variant="danger"
                    label={`Retirer ${friend.pseudo} de mes amis`}
                    disabled={busy}
                    onClick={() => setRemoving(friend)}
                  />
                </div>
                {!friend.theyShare && (
                  <p className="text-xs text-muted">
                    Cette personne ne partage pas sa bibliothèque avec vous.
                  </p>
                )}
                <Switch
                  label={`${friend.pseudo} voit ma bibliothèque`}
                  checked={friend.iShare}
                  disabled={busy}
                  onChange={(share) =>
                    run(
                      () => setFriendSharing(friend.id, share),
                      'Impossible de modifier le partage.',
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        {outgoing.length > 0 && (
          <section className="card flex flex-col gap-3 p-5" aria-labelledby="demandes-envoyees">
            <h2 id="demandes-envoyees" className="font-display text-xl font-bold">
              Demandes envoyées
            </h2>
            <ul className="flex flex-col gap-2">
              {outgoing.map((request) => (
                <li key={request.userId} className="flex items-center gap-2">
                  <Avatar src={request.avatar} name={request.pseudo} size="sm" />
                  <span className="flex-1">
                    <span className="font-medium">{request.pseudo}</span>
                    <span className="ml-2 text-xs text-muted">en attente</span>
                  </span>
                  <IconButton
                    icon="close"
                    label={`Annuler la demande à ${request.pseudo}`}
                    disabled={busy}
                    onClick={() =>
                      run(() => cancelRequest(request.userId), 'Impossible d’annuler la demande.')
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {removing && (
        <Dialog
          title={`Retirer ${removing.pseudo} de mes amis ?`}
          busy={busy}
          onCancel={() => setRemoving(null)}
          actions={[
            {
              label: 'Retirer cet ami',
              icon: 'trash',
              danger: true,
              onClick: async () => {
                const friend = removing
                setRemoving(null)
                await run(() => removeFriend(friend.id), 'Impossible de retirer cet ami.')
              },
            },
          ]}
        >
          Vous ne verrez plus sa bibliothèque et cette personne ne verra plus la vôtre.
        </Dialog>
      )}
    </PageLayout>
  )
}
