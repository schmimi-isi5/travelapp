export interface MailVars {
  link?: string;
  siteUrl?: string;
  email?: string;
  newEmail?: string;
  token?: string;
  inviterName?: string | null;
  familyName?: string | null;
}
export type MailKind = 'invitation' | 'invite' | 'recovery' | 'confirmation' | 'magic_link' | 'email_change' | 'reauthentication';
export const BRAND: { name: string; tagline: string; deep: string; gold: string; clay: string; sand: string; sandSoft: string; line: string; ink: string; muted: string };
export const GOTRUE: Required<Pick<MailVars, 'link' | 'siteUrl' | 'email' | 'newEmail' | 'token'>>;
export const KINDS: readonly MailKind[];
export const SUBJECTS: Record<MailKind, string>;
export function escapeHtml(value: string): string;
export function renderMail(kind: MailKind, vars?: MailVars): { subject: string; html: string; text: string };
