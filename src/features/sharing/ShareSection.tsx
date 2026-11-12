import { useEffect, useState } from 'react'

import CopyLinkField from '../../components/CopyLinkField'
import FormMessage from '../../components/FormMessage'
import RegenerateLink from '../../components/RegenerateLink'
import Switch from '../../components/Switch'
import {
  loadShareSettings,
  regenerateShareToken,
  saveShareSettings,
  type ShareSettings,
} from './api'
import { shareUrl } from './sharedCollection'

/**
 * Réglages du partage de collection : lien en lecture seule (sans compte), envies et dédicaces.
 * Les envies et les dédicaces valent aussi pour les amis.
 */
export default function ShareSection({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<ShareSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch {
      setError('Impossible de générer un nouveau lien.')
    }
    setBusy(false)
  }

  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="partage-titre">
      <div>
        <h2 id="partage-titre" className="font-display text-xl font-bold">
          Partage
        </h2>
        <p className="text-sm text-muted">
          Montrez votre collection à qui vous voulez, sans que cette personne ait besoin d’un
          compte. Le lien est en lecture seule. Pour la partager avec des personnes qui ont un
          compte, ajoutez-les dans « Amis ».
        </p>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {settings && (
        <>
          <Switch
            label="Activer le lien public"
            checked={settings.enabled}
            disabled={busy}
            onChange={(enabled) => change({ enabled })}
          />
          {settings.enabled && (
            <CopyLinkField label="Lien de partage" url={shareUrl(settings.token)} />
          )}
          <Switch
            label="Montrer mes envies"
            hint="Une personne qui vous veut du bien sait quoi vous offrir. Vaut pour le lien public et pour vos amis."
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
          {settings.enabled && (
            <div className="border-t border-line pt-3">
              <RegenerateLink busy={busy} onConfirm={regenerate} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
