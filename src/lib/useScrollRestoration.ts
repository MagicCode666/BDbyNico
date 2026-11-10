import { useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigationType } from 'react-router-dom'

const storageKey = (name: string) => `bdbynico:scroll:${name}`

/**
 * Au retour en arrière (bouton « Précédent »), retrouve la position de défilement de la page, une
 * fois son contenu affiché (`ready`). Un clic sur un lien repart du haut, comme d'habitude.
 * La position est mémorisée au moment où la page est quittée, tant que son contenu est encore là.
 */
export function useScrollRestoration(name: string, ready: boolean): void {
  const navigationType = useNavigationType()
  const restored = useRef(false)

  useLayoutEffect(
    () => () => {
      try {
        sessionStorage.setItem(storageKey(name), String(window.scrollY))
      } catch {
        // stockage indisponible : on repartira simplement du haut
      }
    },
    [name],
  )

  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    if (navigationType !== 'POP') return
    try {
      const saved = Number(sessionStorage.getItem(storageKey(name)))
      if (saved > 0) window.scrollTo(0, saved)
    } catch {
      // idem
    }
  }, [ready, name, navigationType])
}
