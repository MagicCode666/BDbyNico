import { usePseudoStatus } from '../auth/pseudo'
import { PSEUDO_MAX_LENGTH, PSEUDO_MIN_LENGTH, validatePseudo } from '../auth/validation'
import TextField from './TextField'

interface PseudoFieldProps {
  value: string
  onChange: (value: string) => void
  /** Pseudo actuel du compte (modification de profil) : il reste disponible pour lui. */
  current?: string
  disabled?: boolean
  autoComplete?: string
}

/** Champ de pseudo avec, pendant la saisie, la règle de forme et la disponibilité. */
export default function PseudoField({
  value,
  onChange,
  current,
  disabled,
  autoComplete,
}: PseudoFieldProps) {
  const status = usePseudoStatus(value, current)
  const message =
    status === 'invalid'
      ? validatePseudo(value)
      : status === 'checking'
        ? 'Vérification…'
        : status === 'free'
          ? 'Ce pseudo est disponible.'
          : status === 'taken'
            ? 'Ce pseudo est déjà pris.'
            : `${PSEUDO_MIN_LENGTH} à ${PSEUDO_MAX_LENGTH} caractères. Il permet à vos amis de vous retrouver.`
  const tone =
    status === 'free'
      ? 'text-ok'
      : status === 'taken' || status === 'invalid'
        ? 'text-danger-text'
        : 'text-muted'

  return (
    <div className="flex flex-col gap-1">
      <TextField
        label="Pseudo"
        name="pseudo"
        autoComplete={autoComplete}
        maxLength={PSEUDO_MAX_LENGTH}
        disabled={disabled}
        value={value}
        aria-describedby="pseudo-aide"
        aria-invalid={status === 'taken' || status === 'invalid'}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id="pseudo-aide" aria-live="polite" className={`text-xs ${tone}`}>
        {message}
      </p>
    </div>
  )
}
