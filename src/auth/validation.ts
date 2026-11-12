export const PASSWORD_MIN_LENGTH = 8
export const PSEUDO_MIN_LENGTH = 3
export const PSEUDO_MAX_LENGTH = 30

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | null {
  return EMAIL_PATTERN.test(email.trim()) ? null : 'Adresse email invalide.'
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
}

/** Pseudo tel que la base l'enregistre : espaces de début, de fin et doublons retirés. */
export function normalizePseudo(pseudo: string): string {
  return pseudo.trim().replace(/\s+/g, ' ')
}

// Mêmes interdits que la base : < > & " @ / \ et les caractères de contrôle
// eslint-disable-next-line no-control-regex
const FORBIDDEN_PSEUDO_CHARS = /[<>&"@/\\\u0000-\u001f]/

export function validatePseudo(pseudo: string): string | null {
  const value = normalizePseudo(pseudo)
  if (value.length === 0) return 'Le pseudo est obligatoire.'
  if (value.length < PSEUDO_MIN_LENGTH) {
    return `Le pseudo doit contenir au moins ${PSEUDO_MIN_LENGTH} caractères.`
  }
  if (value.length > PSEUDO_MAX_LENGTH) {
    return `Le pseudo ne peut pas dépasser ${PSEUDO_MAX_LENGTH} caractères.`
  }
  if (FORBIDDEN_PSEUDO_CHARS.test(value)) {
    return 'Le pseudo ne peut pas contenir de < > & " @ / ni de \\.'
  }
  return null
}
