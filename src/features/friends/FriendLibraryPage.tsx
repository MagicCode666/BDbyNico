import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import PageLayout from '../../components/PageLayout'
import Avatar from '../avatar/Avatar'
import { listMyItemStates } from '../collection/api'
import CollectionStateButton from '../collection/CollectionStateButton'
import { useAsync } from '../collection/useAsync'
import { getFriendCollection } from '../sharing/api'
import LibraryView from '../sharing/LibraryView'
import { toSharedEntries } from '../sharing/sharedCollection'
import { listFriends } from './api'

async function loadLibrary(friendId: string) {
  const [friends, rows] = await Promise.all([listFriends(), getFriendCollection(friendId)])
  const friend = friends.find((candidate) => candidate.id === friendId) ?? null
  return { friend, entries: toSharedEntries(rows) }
}

/** Bibliothèque d'un ami, dans l'application : lecture seule, avec retour à la sienne. */
export default function FriendLibraryPage() {
  const { friendId = '', seriesId } = useParams()
  const load = useCallback(() => loadLibrary(friendId), [friendId])
  const { data, loading, error } = useAsync(load)
  const friend = data?.friend ?? null
  // Mon état pour chaque album : les boutons d'ajout parlent de MA collection, jamais de celle de l'ami
  const { user } = useAuth()
  const { data: mine, reload: reloadMine } = useAsync(listMyItemStates)
  const [actionError, setActionError] = useState<string | null>(null)

  return (
    <PageLayout
      title="Bibliothèque d’un ami"
      hideTitle
      crumbs={[
        { label: 'Accueil', to: '/' },
        { label: 'Amis', to: '/amis' },
        { label: friend?.pseudo ?? 'Bibliothèque' },
      ]}
    >
      <div className="flex flex-col gap-6">
        {friend && (
          <div
            role="status"
            className="sticky top-[4.25rem] z-[5] flex items-center gap-3 rounded border border-steel bg-surface px-4 py-2 text-sm shadow"
          >
            <Avatar src={friend.avatar} name={friend.pseudo} size="sm" />
            <span className="flex-1">
              Vous consultez la bibliothèque de <strong>{friend.pseudo}</strong> · lecture seule
            </span>
            <IconButton to="/collection" icon="library" label="Revenir à ma collection" />
          </div>
        )}
        {actionError && <FormMessage kind="error">{actionError}</FormMessage>}
        {loading && !data && <p className="text-muted">Chargement…</p>}
        {error && <FormMessage kind="error">Impossible de charger cette bibliothèque.</FormMessage>}
        {data && !friend && (
          <>
            <FormMessage kind="error">Cette personne n’est pas dans vos amis.</FormMessage>
            <Link to="/amis" className="text-accent-text underline">
              Retour à la liste
            </Link>
          </>
        )}
        {data && friend && !friend.theyShare && (
          <FormMessage kind="error">
            {`${friend.pseudo} ne partage pas sa bibliothèque avec vous.`}
          </FormMessage>
        )}
        {data && friend && friend.theyShare && (
          <LibraryView
            pseudo={friend.pseudo}
            entries={data.entries}
            basePath={`/amis/${friendId}`}
            seriesId={seriesId}
            intro="Bibliothèque de"
            avatar={friend.avatar}
            renderAction={
              user && mine
                ? (entry) => (
                    <CollectionStateButton
                      userId={user.id}
                      isbn={entry.edition.isbn}
                      title={entry.edition.title}
                      item={mine.get(entry.edition.isbn) ?? null}
                      size="sm"
                      onChanged={reloadMine}
                      onError={setActionError}
                    />
                  )
                : undefined
            }
          />
        )}
      </div>
    </PageLayout>
  )
}
