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
  eye: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  import: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  hide: 'M3 3l18 18M10.6 6.2A9.5 9.5 0 0121 12a13 13 0 01-3 3.7M6.6 6.6A13 13 0 003 12s3.5 6.5 9 6.5a8.6 8.6 0 003.4-.7M9.9 9.9a3 3 0 004.2 4.2',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10',
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
