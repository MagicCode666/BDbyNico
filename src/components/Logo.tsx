import { Link } from 'react-router-dom'

import logotypeDark from '../assets/brand/logotype-sur-fond-sombre.svg'
import logotypeLight from '../assets/brand/logotype-sur-fond-clair.svg'
import symbolDark from '../assets/brand/symbole-compact-sur-fond-sombre.svg'
import symbolLight from '../assets/brand/symbole-compact-sur-fond-clair.svg'
import { useTheme } from '../theme/useTheme'

interface LogoProps {
  /** « logotype » : symbole et nom ; « symbole » : le symbole seul. */
  variant?: 'logotype' | 'symbole'
  /** Hauteur (classe Tailwind). */
  className?: string
  /** Lien vers l'accueil (par défaut oui). */
  linked?: boolean
}

/** Logo de la marque, dans la version adaptée au thème affiché. */
export default function Logo({
  variant = 'logotype',
  className = 'h-9',
  linked = true,
}: LogoProps) {
  const { theme } = useTheme()
  const dark = theme === 'rouille'
  const src =
    variant === 'logotype' ? (dark ? logotypeDark : logotypeLight) : dark ? symbolDark : symbolLight
  const image = <img src={src} alt="BDbyNico" className={`w-auto ${className}`} />
  return linked ? (
    <Link to="/" aria-label="BDbyNico, accueil" className="inline-flex">
      {image}
    </Link>
  ) : (
    image
  )
}
