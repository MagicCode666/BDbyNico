export type ScannerErrorKind = 'unavailable' | 'denied' | 'nocamera' | 'unknown'

export class ScannerError extends Error {
  constructor(readonly kind: ScannerErrorKind) {
    super(kind)
  }
}

const CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike

function toScannerError(error: unknown): ScannerError {
  if (error instanceof ScannerError) return error
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return new ScannerError('denied')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new ScannerError('nocamera')
  }
  return new ScannerError('unknown')
}

/** Détection native du navigateur (Chrome Android, Safari récent…). */
async function startNative(
  video: HTMLVideoElement,
  detector: BarcodeDetectorLike,
  onCode: (text: string) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
  video.srcObject = stream
  await video.play()

  let busy = false
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      for (const code of await detector.detect(video)) onCode(code.rawValue)
    } catch {
      // image pas encore prête : on réessaie au prochain passage
    } finally {
      busy = false
    }
  }, 250)

  return () => {
    clearInterval(timer)
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
  }
}

/** Repli : décodage logiciel (ZXing), chargé à la demande pour ne pas alourdir l'application. */
async function startZxing(
  video: HTMLVideoElement,
  onCode: (text: string) => void,
): Promise<() => void> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]])
  const reader = new BrowserMultiFormatReader(hints)
  const controls = await reader.decodeFromConstraints(CONSTRAINTS, video, (result) => {
    if (result) onCode(result.getText())
  })
  return () => controls.stop()
}

/**
 * Démarre la caméra sur l'élément vidéo et appelle `onCode` à chaque code-barres EAN-13 lu.
 * Renvoie la fonction qui arrête la caméra. Lève une `ScannerError` si le démarrage échoue.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (text: string) => void,
): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ScannerError('unavailable')
  try {
    const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector
    if (Native) {
      try {
        return await startNative(video, new Native({ formats: ['ean_13'] }), onCode)
      } catch (error) {
        // Format non géré par l'appareil : on bascule sur le décodage logiciel
        if (!(error instanceof TypeError)) throw error
      }
    }
    return await startZxing(video, onCode)
  } catch (error) {
    throw toScannerError(error)
  }
}
