import { Link } from 'react-router-dom'

import { Icon, type IconName } from './icons'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow hover:bg-accent-strong',
  outline: 'border border-line-strong text-fg hover:border-accent hover:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
  danger: 'border border-danger text-danger-text hover:bg-danger-soft',
}

const SIZES = {
  sm: { box: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
  md: { box: 'h-8 w-8', icon: 'h-4 w-4' },
  lg: { box: 'h-9 w-9', icon: 'h-5 w-5' },
} as const

interface Common {
  icon: IconName
  /** Nom accessible, repris en infobulle : l'icône seule ne dit pas ce que fait le bouton. */
  label: string
  variant?: Variant
  size?: keyof typeof SIZES
  className?: string
}

type Props =
  | (Common & { to: string })
  | (Common & {
      to?: undefined
      onClick: () => void
      disabled?: boolean
      pressed?: boolean
    })

/** Bouton rond à icône, commun à toute l'application (lien si `to`, sinon bouton). */
export default function IconButton(props: Props) {
  const { icon, label, variant = 'outline', size = 'md', className = '' } = props
  const classes = `inline-flex flex-none items-center justify-center rounded-full transition disabled:opacity-50 ${SIZES[size].box} ${VARIANTS[variant]} ${className}`
  const glyph = <Icon name={icon} className={SIZES[size].icon} />
  if (props.to !== undefined) {
    return (
      <Link to={props.to} aria-label={label} title={label} className={classes}>
        {glyph}
      </Link>
    )
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
      className={classes}
    >
      {glyph}
    </button>
  )
}
