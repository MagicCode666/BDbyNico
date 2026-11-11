import { useState, type InputHTMLAttributes } from 'react'

import { Icon } from './icons'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
}

/** Champ de mot de passe avec un œil pour l'afficher ou le masquer. */
export default function PasswordField({ label, id, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const inputId = id ?? props.name
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className="w-full rounded border border-line-strong py-2 pl-3 pr-11 shadow-[inset_0_2px_4px_rgb(0_0_0/0.25)] focus:border-accent focus:outline-none"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((on) => !on)}
          aria-pressed={visible}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name={visible ? 'hide' : 'eye'} className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
