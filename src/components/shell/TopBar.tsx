import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Breadcrumbs, { type Crumb } from '../Breadcrumbs'
import { Icon } from '../icons'
import IconButton from '../IconButton'
import Logo from '../Logo'

/** Barre du haut : fil d'Ariane (ordinateur), logo (mobile) et accès à la recherche. */
export default function TopBar({
  crumbs,
  goBack,
}: {
  crumbs: Crumb[]
  goBack: (() => void) | null
}) {
  const navigate = useNavigate()

  // Ctrl+K (ou Cmd+K) ouvre la recherche depuis n'importe quelle page
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigate('/recherche')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <header className="surface-bar sticky top-0 z-10 flex items-center gap-4 border-b border-line px-4 py-3 sm:px-6">
      {goBack && <IconButton icon="back" size="lg" label="Retour" onClick={goBack} />}
      <div className={goBack ? 'hidden' : 'lg:hidden'}>
        <Logo variant="symbole" className="h-8" />
      </div>
      <div className="hidden min-w-0 flex-1 lg:block">
        <Breadcrumbs items={crumbs} />
      </div>
      <Link
        to="/recherche"
        className="search-field ml-auto flex w-full max-w-sm flex-1 items-center gap-2 rounded border border-line px-3 py-2 text-sm text-muted hover:border-accent lg:w-80 lg:flex-none"
      >
        <Icon name="search" className="h-4 w-4" />
        <span className="truncate">Rechercher une série, un album, un auteur…</span>
        <kbd className="ml-auto hidden whitespace-nowrap rounded border border-line px-1.5 py-0.5 text-[0.7rem] font-semibold lg:inline">
          Ctrl K
        </kbd>
      </Link>
    </header>
  )
}
