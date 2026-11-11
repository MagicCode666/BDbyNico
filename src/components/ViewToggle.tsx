import { Icon } from './icons'

export type ViewMode = 'grille' | 'liste'

const OPTIONS = [
  ['grille', 'grid', 'Affichage en grille'],
  ['liste', 'list', 'Affichage en liste'],
] as const

/** Bascule grille / liste, identique sur toutes les pages qui offrent les deux vues. */
export default function ViewToggle({
  value,
  onChange,
  className = '',
}: {
  value: ViewMode
  onChange: (next: ViewMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Affichage"
      className={`inline-flex overflow-hidden rounded-full border border-line-strong ${className}`}
    >
      {OPTIONS.map(([mode, icon, label]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          aria-label={label}
          title={label}
          onClick={() => onChange(mode)}
          className={`flex h-8 w-10 items-center justify-center ${value === mode ? 'bg-raised text-accent-text' : 'text-muted hover:bg-raised hover:text-fg'}`}
        >
          <Icon name={icon} className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
