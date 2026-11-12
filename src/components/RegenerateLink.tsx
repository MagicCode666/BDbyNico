import { useState } from 'react'

import Dialog from './Dialog'

/** « Générer un nouveau lien » avec confirmation : l'ancien lien cesse de fonctionner. */
export default function RegenerateLink({
  busy,
  onConfirm,
}: {
  busy: boolean
  onConfirm: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-sm text-danger-text underline"
      >
        Générer un nouveau lien
      </button>
      {asking && (
        <Dialog
          title="Générer un nouveau lien ?"
          busy={busy}
          onCancel={() => setAsking(false)}
          actions={[
            {
              label: 'Oui, générer un nouveau lien',
              icon: 'undo',
              danger: true,
              onClick: async () => {
                await onConfirm()
                setAsking(false)
              },
            },
          ]}
        >
          L’ancien lien cessera de fonctionner.
        </Dialog>
      )}
    </>
  )
}
