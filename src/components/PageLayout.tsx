import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import VersionBadge from './VersionBadge'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1 text-sm font-medium ${isActive ? 'bg-accent text-on-accent' : 'text-fg hover:bg-raised'}`

interface PageLayoutProps {
  title: string
  children: ReactNode
}

/** Gabarit des pages connectées : navigation + titre. */
export default function PageLayout({ title, children }: PageLayoutProps) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link to="/" className="text-xl font-bold text-accent-text">
          BDbyNico
        </Link>
        <nav className="flex gap-2">
          <NavLink to="/collection" className={navClass}>
            Ma collection
          </NavLink>
          <NavLink to="/profil" className={navClass}>
            Profil
          </NavLink>
        </nav>
      </header>
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      {children}
      <VersionBadge className="mt-10 text-center" />
    </div>
  )
}
