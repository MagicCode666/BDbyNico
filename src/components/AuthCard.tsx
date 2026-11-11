import type { ReactNode } from 'react'

import Logo from './Logo'
import VersionBadge from './VersionBadge'

// Couvertures de la mosaïque : tout fichier déposé dans src/assets/auth/covers est repris
// tel quel (sans fichier, le panneau garde simplement son dégradé).
const COVER_FILES = import.meta.glob('../assets/auth/covers/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const COVERS = Object.keys(COVER_FILES)
  .sort()
  .map((path) => COVER_FILES[path])

const ARGUMENTS = [
  'Suivez vos séries tome après tome',
  'Retrouvez ce qu’il vous manque, en un coup d’œil',
  'Partagez votre collection par un simple lien',
]

/** Mosaïque de couvertures en fond du panneau de marque (décorative). */
function CoverWall({ covers }: { covers: string[] }) {
  if (covers.length === 0) return null
  // On répète les couvertures pour remplir la grille, quel qu'en soit le nombre
  const tiles = Array.from({ length: 18 }, (_, index) => covers[index % covers.length])
  return (
    <div
      aria-hidden="true"
      className="absolute -inset-10 grid -rotate-6 grid-cols-3 gap-3 opacity-40 sm:grid-cols-4"
    >
      {tiles.map((src, index) => (
        <img
          key={index}
          src={src}
          alt=""
          loading="lazy"
          className="aspect-[2/3] w-full rounded object-cover shadow-lg"
        />
      ))}
    </div>
  )
}

interface AuthCardProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Page d'authentification : sur ordinateur, un panneau de marque (couvertures, atouts) à gauche
 * et le formulaire à droite ; sur mobile, le formulaire seul sous le logo.
 */
export default function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside
        data-testid="auth-brand-panel"
        className="relative hidden flex-col justify-between overflow-hidden bg-[#130f0d] p-12 text-white lg:flex"
      >
        <CoverWall covers={COVERS} />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(900px 520px at 12% 8%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 70%), linear-gradient(180deg, rgb(19 15 13 / 0.55), rgb(19 15 13 / 0.92))',
          }}
        />
        <div className="relative">
          <Logo tone="dark" className="h-12" />
        </div>
        <div className="relative flex max-w-md flex-col gap-6">
          <p className="font-display text-4xl font-extrabold leading-tight">
            Votre collection de BD, toujours à portée de main.
          </p>
          <ul className="flex flex-col gap-3 text-white/85">
            {ARGUMENTS.map((text) => (
              <li key={text} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 flex-none rounded-full bg-accent"
                />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">
          Gratuit, sans publicité, entièrement en français.
        </p>
      </aside>

      <main className="flex min-h-screen flex-col justify-center gap-6 p-6 sm:p-10 lg:min-h-0">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <div className="flex justify-center lg:hidden">
            <Logo className="h-12" />
          </div>
          <div className="card-lift flex flex-col gap-6 p-7 sm:p-8">
            <h1 className="title-metal text-center text-3xl lg:text-4xl">{title}</h1>
            {children}
          </div>
          {footer && <p className="text-center text-sm text-muted">{footer}</p>}
          <VersionBadge className="text-center" />
        </div>
      </main>
    </div>
  )
}
