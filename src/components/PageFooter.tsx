import { Link } from 'react-router-dom'

import VersionBadge from './VersionBadge'

/** Pied de page : liens légaux et version de l'application. */
export default function PageFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex flex-col items-center gap-1 ${className}`}>
      <nav aria-label="Informations légales" className="flex gap-4 text-xs text-muted">
        <Link to="/mentions-legales" className="underline hover:text-accent-text">
          Mentions légales
        </Link>
        <Link to="/confidentialite" className="underline hover:text-accent-text">
          Confidentialité
        </Link>
      </nav>
      <VersionBadge />
    </footer>
  )
}
