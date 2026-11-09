interface FormMessageProps {
  kind: 'error' | 'success'
  children: string
}

export default function FormMessage({ kind, children }: FormMessageProps) {
  const colors = kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded p-3 text-sm ${colors}`}>
      {children}
    </p>
  )
}
