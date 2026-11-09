import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import VersionBadge from './VersionBadge'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1 text-sm font-medium ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`

interface PageLayoutProps {
  title: string
  children: ReactNode
}

/** Gabarit des pages connectées : navigation + titre. */
export default function PageLayout({ title, children }: PageLayoutProps) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link to="/" className="text-xl font-bold text-indigo-600">
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
