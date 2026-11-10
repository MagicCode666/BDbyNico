import type { ReactNode } from 'react'

import Logo from './Logo'
import VersionBadge from './VersionBadge'

interface AuthCardProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex justify-center">
        <Logo className="h-12" />
      </div>
      <div className="card-lift flex flex-col gap-5 p-6">
        <h1 className="title-metal text-center text-3xl">{title}</h1>
        {children}
      </div>
      {footer && <p className="text-center text-sm text-muted">{footer}</p>}
      <VersionBadge className="text-center" />
    </main>
  )
}
