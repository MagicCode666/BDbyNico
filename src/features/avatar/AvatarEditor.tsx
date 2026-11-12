import { useRef, useState } from 'react'

import FormMessage from '../../components/FormMessage'
import IconButton from '../../components/IconButton'
import { saveAvatar } from './api'
import Avatar from './Avatar'
import { AVATAR_SIZE, AvatarError, resizeAvatar } from './resize'

/** Choix de l'avatar : l'image est réduite dans le navigateur avant d'être enregistrée. */
export default function AvatarEditor({
  userId,
  name,
  avatar,
  onChange,
}: {
  userId: string
  name: string
  avatar: string | null
  onChange: (avatar: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(prepare: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    try {
      const next = await prepare()
      await saveAvatar(userId, next)
      onChange(next)
    } catch (caught) {
      setError(
        caught instanceof AvatarError ? caught.message : 'Impossible d’enregistrer l’avatar.',
      )
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Avatar</span>
      <div className="flex items-center gap-3">
        <Avatar src={avatar} name={name} size="lg" />
        <IconButton
          icon="edit"
          size="lg"
          label={avatar ? 'Changer l’avatar' : 'Choisir un avatar'}
          disabled={busy}
          onClick={() => input.current?.click()}
        />
        {avatar && (
          <IconButton
            icon="trash"
            size="lg"
            variant="danger"
            label="Retirer l’avatar"
            disabled={busy}
            onClick={() => apply(async () => null)}
          />
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label="Image de l’avatar"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void apply(() => resizeAvatar(file))
          }}
        />
      </div>
      <p className="text-xs text-muted">
        Une image carrée de préférence : elle est recadrée et réduite à {AVATAR_SIZE} px avant
        d’être enregistrée. Seuls vos amis la voient.
      </p>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </div>
  )
}
