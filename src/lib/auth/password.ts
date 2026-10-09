/** Mirrors GOTRUE_PASSWORD_MIN_LENGTH of the self-hosted stack (see docker/supabase/compose.yml). */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (password !== repeat) return 'Die Passwörter stimmen nicht überein.';
  return null;
}
