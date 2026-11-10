import type { IconName } from '../icons'

export type NavId = 'accueil' | 'collection' | 'envies' | 'ajouter' | 'profil' | 'admin'

export interface NavItem {
  id: NavId
  label: string
  to: string
  icon: IconName
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'accueil', label: 'Accueil', to: '/', icon: 'home' },
  { id: 'collection', label: 'Ma collection', to: '/collection', icon: 'library' },
  { id: 'envies', label: 'Mes envies', to: '/collection?statut=envies', icon: 'heart' },
  { id: 'ajouter', label: 'Ajouter un album', to: '/collection/ajouter', icon: 'plus' },
]

/** Quelle entrée de navigation correspond à la page affichée ? (null : aucune) */
export function activeNavId(pathname: string, search: string): NavId | null {
  if (pathname === '/') return 'accueil'
  if (pathname === '/collection') {
    return new URLSearchParams(search).get('statut') === 'envies' ? 'envies' : 'collection'
  }
  if (pathname === '/collection/ajouter' || pathname === '/collection/importer') return 'ajouter'
  // Une série ou la fiche d'un album se rangent sous « Ma collection »
  if (pathname.startsWith('/series/') || pathname.startsWith('/collection/')) return 'collection'
  if (pathname === '/profil') return 'profil'
  if (pathname === '/admin') return 'admin'
  return null
}
