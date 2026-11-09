interface SubmitButtonProps {
  busy: boolean
  children: string
}

export default function SubmitButton({ busy, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {busy ? 'Patientez…' : children}
    </button>
  )
}
