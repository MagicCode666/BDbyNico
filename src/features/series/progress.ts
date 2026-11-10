/**
 * Progression d'une série pour un utilisateur, à partir des seuls tomes possédés, du total et
 * de ses exclusions personnelles. Même calcul sur la page Collection et sur la page série :
 *  - un tome exclu et non possédé ne compte pas dans l'objectif ;
 *  - un tome possédé compte toujours, même exclu ;
 *  - le tome 0 (prologue) ne compte que si on le possède ;
 *  - la série est complète quand tous les tomes visés sont possédés ET qu'on possède quelque chose
 *    (un tome ou une intégrale : on peut exclure les tomes unitaires d'une intégrale).
 */
export interface Progress {
  owned: number
  target: number
  complete: boolean
  missing: number[]
}

export function seriesProgress(input: {
  total: number | null
  ownedVolumes: number[]
  ignored: number[]
  /** L'utilisateur possède au moins une intégrale ou un hors-série de la série. */
  ownsIntegral?: boolean
}): Progress {
  const owned = new Set(input.ownedVolumes)
  const ignored = new Set(input.ignored)
  const total = Math.max(input.total ?? 0, ...owned)
  let ownedCount = 0
  let target = 0
  const missing: number[] = []
  for (let volume = owned.has(0) ? 0 : 1; volume <= total; volume++) {
    if (owned.has(volume)) {
      ownedCount++
      target++
    } else if (!ignored.has(volume)) {
      target++
      missing.push(volume)
    }
  }
  return {
    owned: ownedCount,
    target,
    complete: total > 0 && ownedCount === target && (ownedCount > 0 || !!input.ownsIntegral),
    missing,
  }
}
