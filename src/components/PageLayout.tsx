import type { ReactNode } from 'react'

import type { Crumb } from './Breadcrumbs'
import AppShell from './shell/AppShell'

interface PageLayoutProps {
  title: string
  /** Fil d'Ariane ; par défaut « Accueil › titre de la page ». */
  crumbs?: Crumb[]
  /** Pour une page qui affiche son propre grand titre. */
  hideTitle?: boolean
  children: ReactNode
}

/** Gabarit des pages connectées : navigation, fil d'Ariane et titre. */
export default function PageLayout({
  title,
  crumbs,
  hideTitle = false,
  children,
}: PageLayoutProps) {
  const items = crumbs ?? [{ label: 'Accueil', to: '/' }, { label: title }]
  return (
    <AppShell crumbs={items}>
      {!hideTitle && <h1 className="title-metal mb-5 text-4xl">{title}</h1>}
      {children}
    </AppShell>
  )
}
