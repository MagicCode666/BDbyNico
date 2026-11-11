import { useEffect, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import {
  loadShareSettings,
  regenerateShareToken,
  saveShareSettings,
  type ShareSettings,
} from './api'
import { shareUrl } from './sharedCollection'

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/** Réglages du partage de collection : lien en lecture seule, envies et dédicaces. */
export default function ShareSection({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadShareSettings(userId)
      .then((value) => !cancelled && setSettings(value))
      .catch(() => !cancelled && setError('Impossible de charger les réglages de partage.'))
    return () => {
      cancelled = true
    }
  }, [userId])

  async function change(patch: Partial<Pick<ShareSettings, 'enabled' | 'wishes' | 'dedications'>>) {
    if (!settings) return
    setBusy(true)
    setError(null)
    try {
      await saveShareSettings(userId, patch)
      setSettings({ ...settings, ...patch })
    } catch {
      setError('Impossible d’enregistrer ce réglage.')
    }
    setBusy(false)
  }

  async function regenerate() {
    if (!settings) return
    setBusy(true)
    setError(null)
    try {
      const token = await regenerateShareToken()
      setSettings({ ...settings, token })
      setConfirmRegenerate(false)
    } catch {
      setError('Impossible de générer un nouveau lien.')
    }
    setBusy(false)
  }

  async function copy() {
    if (!settings) return
    try {
      await navigator.clipboard.writeText(shareUrl(settings.token))
      setCopied(true)
    } catch {
      setError('Copie impossible : sélectionnez le lien et copiez-le à la main.')
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="partage-titre">
      <div>
        <h2 id="partage-titre" className="font-display text-xl font-bold">
          Partage
        </h2>
        <p className="text-sm text-muted">
          Montrez votre collection à qui vous voulez, sans que cette personne ait besoin d’un
          compte. Le lien est en lecture seule.
        </p>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {settings && (
        <>
          <Switch
            label="Activer le partage"
            checked={settings.enabled}
            disabled={busy}
            onChange={(enabled) => change({ enabled })}
          />
          {settings.enabled && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  aria-label="Lien de partage"
                  value={shareUrl(settings.token)}
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
              <Switch
                label="Montrer mes envies"
                hint="Une personne qui vous veut du bien sait quoi vous offrir."
                checked={settings.wishes}
                disabled={busy}
                onChange={(wishes) => change({ wishes })}
              />
              <Switch
                label="Signaler mes dédicaces"
                hint="Un petit ✎ sur les albums dédicacés. Le nom du dédicaceur reste privé."
                checked={settings.dedications}
                disabled={busy}
                onChange={(dedications) => change({ dedications })}
              />
              <p className="text-sm text-muted">
                Toujours privés : prix, état, notes et dates d’achat.
              </p>
              <div className="border-t border-line pt-3">
                {confirmRegenerate ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm">
                      L’ancien lien cessera de fonctionner. Générer un nouveau lien ?
                    </span>
                    <IconButton
                      icon="check"
                      variant="danger"
                      label="Oui, générer"
                      disabled={busy}
                      onClick={regenerate}
                    />
                    <IconButton
                      icon="close"
                      label="Annuler"
                      onClick={() => setConfirmRegenerate(false)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRegenerate(true)}
                    className="text-sm text-danger-text underline"
                  >
                    Générer un nouveau lien
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
