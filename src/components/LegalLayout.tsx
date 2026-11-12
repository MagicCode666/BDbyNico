import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import Logo from './Logo'
import PageFooter from './PageFooter'

/** Page de texte juridique, accessible sans compte. */
export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <Logo className="h-9" />
        <Link to="/" className="text-sm text-accent-text underline">
          Retour à l’application
        </Link>
      </header>
      <main className="flex flex-col gap-4 [&_a]:text-accent-text [&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">
        <h1 className="title-metal text-3xl">{title}</h1>
        <p className="text-sm text-muted">Dernière mise à jour : {updated}</p>
        {children}
      </main>
      <PageFooter className="mt-6" />
    </div>
  )
}
