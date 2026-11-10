interface SubmitButtonProps {
  busy: boolean
  children: string
}

export default function SubmitButton({ busy, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50"
    >
      {busy ? 'Patientez…' : children}
    </button>
  )
}
