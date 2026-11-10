import { Link, useLocation } from 'react-router-dom'

import { Icon, type IconName } from '../icons'
import { activeNavId, type NavId } from './nav'

interface Tab {
  id: NavId | 'recherche'
  label: string
  to: string
  icon: IconName
}

const TABS: Tab[] = [
  { id: 'collection', label: 'Collection', to: '/collection', icon: 'library' },
  { id: 'recherche', label: 'Recherche', to: '/recherche', icon: 'search' },
  { id: 'ajouter', label: 'Ajouter', to: '/collection/ajouter', icon: 'plus' },
  { id: 'envies', label: 'Envies', to: '/collection?statut=envies', icon: 'heart' },
  { id: 'profil', label: 'Compte', to: '/profil', icon: 'user' },
]

/** Onglets du bas (mobile) : à portée du pouce, le bouton « Ajouter » au centre. */
export default function TabBar() {
  const { pathname, search } = useLocation()
  const active = pathname === '/recherche' ? 'recherche' : activeNavId(pathname, search)

  return (
    <nav
      aria-label="Navigation mobile"
      className="surface-tabs fixed inset-x-0 bottom-0 z-20 flex border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map((tab) =>
        tab.id === 'ajouter' ? (
          <Link
            key={tab.id}
            to={tab.to}
            aria-label="Ajouter un album"
            className="flex flex-1 flex-col items-center"
          >
            <span className="tab-add -mt-5 grid h-12 w-12 place-items-center rounded-full text-on-accent">
              <Icon name="plus" className="h-6 w-6" />
            </span>
          </Link>
        ) : (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={active === tab.id ? 'page' : undefined}
            className="tab-link flex flex-1 flex-col items-center gap-0.5 px-1 pb-2.5 pt-2 text-[0.7rem] font-semibold text-muted"
          >
            <Icon name={tab.icon} className="h-6 w-6" />
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  )
}
