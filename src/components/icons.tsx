const PATHS = {
  home: 'M3 11l9-8 9 8v10H3z',
  library: 'M4 4h5v16H4zM11 4h5v16h-5zM18 6l3 .8-3.5 13-3-.8z',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  compass: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M4 6h16M4 12h16M4 18h16',
  chevron: 'M9 6l6 6-6 6',
  import: 'M12 3v12M7 10l5 5 5-5M5 21h14',
} as const

export type IconName = keyof typeof PATHS

/** Icônes de l'interface : tracé simple, la couleur vient du texte (currentColor). */
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
