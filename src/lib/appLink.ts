/** Adresse complète d'une page de l'application (le routeur est en mode hash). */
export function appLink(path: string, base = window.location.href): string {
  return `${base.split('#')[0]}#${path}`
}
