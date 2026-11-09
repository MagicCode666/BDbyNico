import { useEffect, useRef, useState } from 'react'

import { isbnFromBarcode } from '../../../lib/isbn'
import { ScannerError, startScanner, type ScannerErrorKind } from './startScanner'

const ERROR_MESSAGES: Record<ScannerErrorKind, string> = {
  unavailable:
    "La caméra n'est pas disponible ici (elle nécessite une connexion sécurisée https). Saisissez l'ISBN à la main.",
  denied:
    "Accès à la caméra refusé. Autorisez-la dans les réglages du navigateur, ou saisissez l'ISBN à la main.",
  nocamera: "Aucune caméra trouvée. Saisissez l'ISBN à la main.",
  unknown: "Impossible de démarrer la caméra. Saisissez l'ISBN à la main.",
}

interface BarcodeScannerProps {
  onDetect: (isbn: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDetectRef = useRef(onDetect)
  const [errorKind, setErrorKind] = useState<ScannerErrorKind | null>(null)
  const [notIsbn, setNotIsbn] = useState(false)

  useEffect(() => {
    onDetectRef.current = onDetect
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let detected = false
    let stop: (() => void) | undefined

    startScanner(video, (text) => {
      if (detected) return
      const isbn = isbnFromBarcode(text)
      if (isbn) {
        detected = true
        onDetectRef.current(isbn)
      } else {
        setNotIsbn(true)
      }
    })
      .then((stopFn) => {
        // Le composant a pu être fermé pendant le démarrage de la caméra
        if (cancelled) stopFn()
        else stop = stopFn
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorKind(error instanceof ScannerError ? error.kind : 'unknown')
      })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-300 p-3">
      {errorKind ? (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {ERROR_MESSAGES[errorKind]}
        </p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded border-2 border-white/80" />
          </div>
          <p className="text-sm text-slate-600">
            Placez le code-barres du livre (au dos) dans le cadre.
          </p>
          {notIsbn && (
            <p role="status" className="text-sm text-amber-700">
              Ce code-barres n'est pas celui d'un livre (ISBN). Cherchez celui qui commence par 978
              ou 979.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="self-start rounded border border-slate-300 px-3 py-1 text-sm"
      >
        Fermer
      </button>
    </div>
  )
}
