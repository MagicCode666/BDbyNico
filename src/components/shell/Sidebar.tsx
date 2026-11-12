import { Link, useLocation } from 'react-router-dom'

import Avatar from '../../features/avatar/Avatar'
import { Icon } from '../icons'
import Logo from '../Logo'
import CountBadge from './CountBadge'
import { activeNavId, NAV_ITEMS, type NavItem } from './nav'
import { ROLE_LABELS, useAccountSummary } from './useAccountSummary'
import { useSidebarCollapsed } from './useSidebarCollapsed'

const ADMIN_ITEM: NavItem = {
  id: 'admin',
  label: 'Administration',
  to: '/admin',
  icon: 'shield',
}

/**
 * Navigation latérale (ordinateur) : l'entrée de la page courante est mise en avant.
 * Elle peut se réduire aux seules icônes, avec une infobulle sur chacune.
 */
export default function Sidebar({ friendRequests = 0 }: { friendRequests?: number }) {
  const { pathname, search } = useLocation()
  const active = activeNavId(pathname, search)
  const summary = useAccountSummary()
  const [collapsed, toggle] = useSidebarCollapsed()
  const moderator = summary?.role === 'moderator' || summary?.role === 'admin'
  const items = moderator ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS
  const pseudo = summary?.pseudo ?? 'Mon compte'
  const link = `nav-link flex items-center rounded border-l-[3px] border-transparent py-2.5 hover:bg-raised ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}`

  return (
    <aside
      className={`surface-side sticky top-0 hidden h-screen flex-none flex-col gap-6 border-r border-line p-4 transition-[width] duration-150 lg:flex ${collapsed ? 'w-[4.5rem] px-2' : 'w-60'}`}
    >
      <div className={`pt-1 ${collapsed ? 'flex justify-center' : 'px-1'}`}>
        {collapsed ? <Logo variant="symbole" className="h-9" /> : <Logo className="h-9" />}
      </div>
      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active === item.id ? 'page' : undefined}
            className={`${link} relative font-medium text-muted hover:text-fg`}
          >
            <Icon name={item.icon} />
            {!collapsed && item.label}
            {item.id === 'amis' && (
              <span className={collapsed ? 'absolute right-1 top-1' : 'ml-auto'}>
                <CountBadge count={friendRequests} label="demande(s) d’ami en attente" />
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <Link
          to="/profil"
          title={collapsed ? `${pseudo} : profil et réglages` : undefined}
          aria-label={collapsed ? `${pseudo} : profil et réglages` : undefined}
          aria-current={active === 'profil' ? 'page' : undefined}
          className={link}
        >
          <Avatar src={summary?.avatar} name={summary?.pseudo ?? '?'} />
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-semibold">{pseudo}</span>
              <span className="block truncate text-xs text-muted">
                {summary ? ROLE_LABELS[summary.role] : 'Profil et réglages'}
              </span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          className={`flex items-center rounded py-2 text-muted hover:bg-raised hover:text-fg ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}
        >
          <Icon name="chevron" className={`h-5 w-5 ${collapsed ? '' : 'rotate-180'}`} />
          {!collapsed && <span className="text-sm">Réduire le menu</span>}
        </button>
      </div>
    </aside>
  )
}
