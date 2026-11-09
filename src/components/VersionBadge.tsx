/** Version de l'application et commit déployé, pour vérifier qu'on utilise bien la dernière. */
export default function VersionBadge({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-400 ${className}`} title="Version de l'application">
      v{__APP_VERSION__} ({__APP_COMMIT__})
    </p>
  )
}
