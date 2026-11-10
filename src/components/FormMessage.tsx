interface FormMessageProps {
  kind: 'error' | 'success'
  children: string
}

export default function FormMessage({ kind, children }: FormMessageProps) {
  const colors =
    kind === 'error'
      ? 'border-danger bg-danger-soft text-danger-text'
      : 'border-ok bg-ok-soft text-ok'
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded border-l-4 p-3 text-sm ${colors}`}
    >
      {children}
    </p>
  )
}
