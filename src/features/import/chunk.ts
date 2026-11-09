/** Découpe une liste en lots de taille fixe (le dernier peut être plus petit). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('La taille de lot doit être au moins 1.')
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}
