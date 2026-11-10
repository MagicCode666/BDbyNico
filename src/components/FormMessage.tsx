interface FormMessageProps {
  kind: 'error' | 'success'
  children: string
}

export default function FormMessage({ kind, children }: FormMessageProps) {
  const colors = kind === 'error' ? 'bg-danger-soft text-danger-text' : 'bg-ok-soft text-ok'
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded p-3 text-sm ${colors}`}>
      {children}
    </p>
  )
}
