/** Maps auth service errors to German, non-revealing user messages. */
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/email not confirmed/i.test(message)) return 'Die E-Mail-Adresse ist noch nicht bestätigt.';
  if (/rate limit|too many/i.test(message)) return 'Zu viele Versuche. Bitte warte einen Moment.';
  if (/fetch|network/i.test(message)) return 'Keine Verbindung zum Server. Anmelden ist nur online möglich.';
  return 'Anmeldung nicht möglich. Bitte versuche es erneut.';
}
