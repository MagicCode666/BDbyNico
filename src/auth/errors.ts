const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Adresse email non confirmée. Vérifiez votre boîte de réception.',
  user_already_exists: 'Un compte existe déjà avec cette adresse email.',
  email_exists: 'Un compte existe déjà avec cette adresse email.',
  weak_password: 'Mot de passe trop faible. Choisissez-en un plus long ou plus varié.',
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  over_email_send_rate_limit: "Trop d'emails envoyés. Réessayez dans quelques minutes.",
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  signup_disabled: 'Les inscriptions sont désactivées.',
  validation_failed: 'Données invalides.',
}

const FALLBACK = 'Une erreur est survenue. Réessayez dans un instant.'

export function translateAuthError(error: { code?: string } | null | undefined): string {
  if (!error) return FALLBACK
  return (error.code && MESSAGES[error.code]) || FALLBACK
}
