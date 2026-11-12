interface SwitchProps {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}

/** Interrupteur avec un libellé et une aide facultative. */
export default function Switch({ label, hint, checked, disabled, onChange }: SwitchProps) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-muted">{hint}</span>}
      </span>
    </label>
  )
}
