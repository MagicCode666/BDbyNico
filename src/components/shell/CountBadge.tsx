/** Pastille de nombre (demandes en attente, par exemple) ; rien quand il n'y en a pas. */
export default function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span
      role="status"
      aria-label={`${count} ${label}`}
      className="grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-bold leading-none text-on-accent"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
