import { PASSWORD_MIN_LENGTH } from '../auth/validation'

/** Barre de longueur du mot de passe : elle se remplit jusqu'au minimum exigé. */
export default function PasswordStrength({ value }: { value: string }) {
  if (value.length === 0) return null
  const ratio = Math.min(1, value.length / PASSWORD_MIN_LENGTH)
  const enough = value.length >= PASSWORD_MIN_LENGTH
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div
        role="progressbar"
        aria-label="Longueur du mot de passe"
        aria-valuemin={0}
        aria-valuemax={PASSWORD_MIN_LENGTH}
        aria-valuenow={Math.min(value.length, PASSWORD_MIN_LENGTH)}
        className="h-1.5 overflow-hidden rounded-sm bg-raised"
      >
        <div
          className={`h-full transition-all ${enough ? 'bg-ok' : 'bg-warn'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className={`text-xs ${enough ? 'text-ok' : 'text-muted'}`}>
        {enough
          ? 'Longueur suffisante.'
          : `${value.length} / ${PASSWORD_MIN_LENGTH} caractères au minimum.`}
      </p>
    </div>
  )
}
