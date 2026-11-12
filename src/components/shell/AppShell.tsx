import type { ReactNode } from 'react'

import { useIncomingRequests } from '../../features/friends/useIncomingRequests'
import type { Crumb } from '../Breadcrumbs'
import PageFooter from '../PageFooter'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import TopBar from './TopBar'
import { useEdgeSwipeBack, useGoBack } from './useGoBack'

/**
 * Structure des pages connectées : barre latérale (ordinateur), barre du haut avec fil d'Ariane
 * et recherche, onglets du bas (mobile).
 */
export default function AppShell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  const goBack = useGoBack(crumbs)
  const friendRequests = useIncomingRequests()
  useEdgeSwipeBack(goBack)
  return (
    <div className="flex min-h-screen">
      <Sidebar friendRequests={friendRequests} />
      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
        <TopBar crumbs={crumbs} goBack={goBack} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
        <PageFooter className="px-6 pb-4" />
      </div>
      <TabBar friendRequests={friendRequests} />
    </div>
  )
}
