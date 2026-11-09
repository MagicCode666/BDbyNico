import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import VersionBadge from './VersionBadge'

interface AuthCardProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <Link to="/" className="text-center text-2xl font-bold text-indigo-600">
        BDbyNico
      </Link>
      <h1 className="text-center text-xl font-semibold">{title}</h1>
      {children}
      {footer && <p className="text-center text-sm text-slate-600">{footer}</p>}
      <VersionBadge className="text-center" />
    </main>
  )
}
