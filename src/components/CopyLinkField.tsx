import { useState } from 'react'

import FormMessage from './FormMessage'
import IconButton from './IconButton'

/** Lien en lecture seule avec un bouton pour le copier. */
export default function CopyLinkField({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setError(false)
    } catch {
      setError(true)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          aria-label={label}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2 text-sm"
        />
        <IconButton
          icon={copied ? 'check' : 'copy'}
          variant="primary"
          size="lg"
          label={copied ? 'Lien copié' : 'Copier le lien'}
          onClick={copy}
        />
      </div>
      {error && (
        <FormMessage kind="error">
          Copie impossible : sélectionnez le lien et copiez-le à la main.
        </FormMessage>
      )}
    </div>
  )
}
