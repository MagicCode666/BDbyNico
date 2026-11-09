export const PASSWORD_MIN_LENGTH = 8
export const PSEUDO_MAX_LENGTH = 50

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | null {
  return EMAIL_PATTERN.test(email.trim()) ? null : 'Adresse email invalide.'
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
}

export function validatePseudo(pseudo: string): string | null {
  const value = pseudo.trim()
  if (value.length === 0) return 'Le pseudo est obligatoire.'
  if (value.length > PSEUDO_MAX_LENGTH) {
    return `Le pseudo ne peut pas dépasser ${PSEUDO_MAX_LENGTH} caractères.`
  }
  return null
}
