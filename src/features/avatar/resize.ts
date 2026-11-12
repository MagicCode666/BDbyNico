/** Côté de l'avatar enregistré, en pixels. */
export const AVATAR_SIZE = 128
/** Taille maximale de l'adresse « data: » enregistrée (la base accepte jusqu'à 30 000 caractères). */
export const AVATAR_MAX_CHARS = 28000
/** Image d'origine acceptée : au-delà, on ne tente même pas de la décoder. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024

export class AvatarError extends Error {}

/** Carré centré le plus grand possible dans une image : origine et côté, en pixels. */
export function squareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}

const QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.3]

/**
 * Encode avec la meilleure qualité qui tient dans la limite : on baisse la qualité tant que
 * l'image est trop lourde. Renvoie null si même la plus basse est trop grosse.
 */
export function encodeWithin(
  encode: (quality: number) => string,
  maxChars: number = AVATAR_MAX_CHARS,
): string | null {
  for (const quality of QUALITIES) {
    const url = encode(quality)
    if (url.length <= maxChars) return url
  }
  return null
}

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Réduit une image choisie par l'utilisateur en un avatar carré de 128 px, en WebP (ou JPEG si le
 * navigateur ne sait pas faire de WebP), de quelques Ko. Tout se passe dans le navigateur.
 */
export async function resizeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('Ce fichier n’est pas une image.')
  if (file.size > MAX_SOURCE_BYTES)
    throw new AvatarError('Cette image est trop lourde (10 Mo au plus).')

  let decoded
  try {
    decoded = await decode(file)
  } catch {
    throw new AvatarError('Cette image ne peut pas être lue : essayez un JPEG, un PNG ou un WebP.')
  }
  const { sx, sy, side } = squareCrop(decoded.width, decoded.height)
  if (side === 0) throw new AvatarError('Cette image est vide.')

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new AvatarError('Votre navigateur ne sait pas redimensionner les images.')
  context.drawImage(decoded.source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

  const webp = canvas.toDataURL('image/webp', 0.85).startsWith('data:image/webp')
  const type = webp ? 'image/webp' : 'image/jpeg'
  const url = encodeWithin((quality) => canvas.toDataURL(type, quality))
  if (!url) throw new AvatarError('Cette image reste trop lourde une fois réduite.')
  return url
}
