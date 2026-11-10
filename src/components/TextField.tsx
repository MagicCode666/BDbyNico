import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export default function TextField({ label, id, ...props }: TextFieldProps) {
  const inputId = id ?? props.name
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        className="rounded border border-line-strong px-3 py-2 shadow-[inset_0_2px_4px_rgb(0_0_0/0.25)] focus:border-accent focus:outline-none"
        {...props}
      />
    </div>
  )
}
