import { Link } from 'react-router-dom'

import { Icon } from './icons'

export interface Crumb {
  label: string
  /** Sans lien : c'est la page courante. */
  to?: string
}

/** Fil d'Ariane : où l'on se trouve, avec un retour en un clic vers chaque niveau. */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <Icon name="chevron" className="h-3.5 w-3.5 opacity-60" />}
              {item.to && !last ? (
                <Link to={item.to} className="truncate hover:text-fg hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className="truncate font-medium text-fg"
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
