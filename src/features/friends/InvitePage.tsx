import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { governanceErrorMessage } from '../governance/api'
import { acceptInvite } from './api'

type State =
  { phase: 'loading' } | { phase: 'done'; pseudo: string } | { phase: 'error'; message: string }

/** Arrivée par un lien d'invitation : l'amitié est conclue, puis on renvoie vers la liste. */
export default function InvitePage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    acceptInvite(token)
      .then((pseudo) => setState({ phase: 'done', pseudo }))
      .catch((caught) =>
        setState({
          phase: 'error',
          message: inviteErrorMessage(caught),
        }),
      )
  }, [token])

  return (
    <PageLayout
      title="Invitation"
      crumbs={[
        { label: 'Accueil', to: '/' },
        { label: 'Amis', to: '/amis' },
        { label: 'Invitation' },
      ]}
    >
      <div className="flex max-w-xl flex-col gap-4">
        {state.phase === 'loading' && <p className="text-muted">Un instant…</p>}
        {state.phase === 'done' && (
          <>
            <FormMessage kind="success">
              {`Vous êtes maintenant ami avec ${state.pseudo}.`}
            </FormMessage>
            <Link to="/amis" className="text-accent-text underline">
              Voir mes amis
            </Link>
          </>
        )}
        {state.phase === 'error' && <FormMessage kind="error">{state.message}</FormMessage>}
      </div>
    </PageLayout>
  )
}

function inviteErrorMessage(caught: unknown): string {
  const message = (caught as { message?: string })?.message ?? ''
  if (message.includes('propre lien')) return 'C’est votre propre lien d’invitation.'
  if (message.includes('invalide')) {
    return 'Ce lien d’invitation n’est plus valide : demandez-en un nouveau à cette personne.'
  }
  return governanceErrorMessage(caught, 'Impossible d’accepter cette invitation.')
}
