import { Link, useLocation } from 'react-router-dom'

import { Icon } from '../icons'
import Logo from '../Logo'
import { activeNavId, NAV_ITEMS, type NavItem } from './nav'
import { ROLE_LABELS, useAccountSummary } from './useAccountSummary'

const ADMIN_ITEM: NavItem = {
  id: 'admin',
  label: 'Administration',
  to: '/admin',
  icon: 'shield',
}

/** Navigation latérale (ordinateur) : l'entrée de la page courante est mise en avant. */
export default function Sidebar() {
  const { pathname, search } = useLocation()
  const active = activeNavId(pathname, search)
  const summary = useAccountSummary()
  const moderator = summary?.role === 'moderator' || summary?.role === 'admin'
  const items = moderator ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS

  return (
    <aside className="surface-side sticky top-0 hidden h-screen w-60 flex-none flex-col gap-6 border-r border-line p-4 lg:flex">
      <div className="px-1 pt-1">
        <Logo className="h-9" />
      </div>
      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            aria-current={active === item.id ? 'page' : undefined}
            className="nav-link flex items-center gap-3 rounded border-l-[3px] border-transparent px-3 py-2.5 font-medium text-muted hover:bg-raised hover:text-fg"
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
      <Link
        to="/profil"
        aria-current={active === 'profil' ? 'page' : undefined}
        className="nav-link mt-auto flex items-center gap-3 rounded border-l-[3px] border-transparent px-3 py-2.5 hover:bg-raised"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 flex-none place-items-center rounded bg-accent font-display text-lg font-extrabold text-on-accent"
        >
          {(summary?.pseudo ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-semibold">{summary?.pseudo ?? 'Mon compte'}</span>
          <span className="block truncate text-xs text-muted">
            {summary ? ROLE_LABELS[summary.role] : 'Profil et réglages'}
          </span>
        </span>
      </Link>
    </aside>
  )
}
