const SIZES = {
  sm: 'h-7 w-7 text-sm',
  md: 'h-9 w-9 text-lg',
  lg: 'h-20 w-20 text-4xl',
} as const

/** Avatar : l'image choisie, ou à défaut l'initiale du pseudo sur fond d'accent. */
export default function Avatar({
  src,
  name,
  size = 'md',
  className = '',
}: {
  src?: string | null
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const box = `${SIZES[size]} flex-none rounded ${className}`
  if (src) {
    // Décoratif : le pseudo est toujours écrit à côté
    return <img src={src} alt="" aria-hidden="true" className={`${box} object-cover`} />
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} grid place-items-center bg-accent font-display font-extrabold text-on-accent`}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
