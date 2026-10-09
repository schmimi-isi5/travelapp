import nodemailer from 'nodemailer';

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/** SMTP settings of the web app (used for invitation mails). The auth service has its own SMTP settings. */
export function getMailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const host = env.SMTP_HOST;
  const from = env.SMTP_FROM;
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  return { host, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined, from };
}

export interface InvitationMail {
  to: string;
  link: string;
  familyName: string | null;
  inviterName: string | null;
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderInvitation({ link, familyName, inviterName }: Omit<InvitationMail, 'to'>): { subject: string; text: string; html: string } {
  const sentence = (name: string | null, family: string | null) =>
    `${name ? `${name} lädt dich` : 'Du wirst'} ${family ? `in die Reise-App der Familie „${family}“` : 'in die Familien-Reise-App „Namibia & Botswana“'} ${name ? 'ein' : 'eingeladen'}.`;
  const note = 'Der Link ist 7 Tage gültig und nur für diese E-Mail-Adresse bestimmt. Wenn du die Einladung nicht erwartest, ignoriere diese Nachricht.';
  return {
    subject: 'Einladung: Namibia & Botswana – Unsere Reise',
    text: `${sentence(inviterName, familyName)}\n\nEinladung annehmen: ${link}\n\n${note}`,
    html: `<p>${escapeHtml(sentence(inviterName, familyName))}</p><p><a href="${escapeHtml(link)}">Einladung annehmen</a></p><p>${escapeHtml(note)}</p>`,
  };
}

export async function sendInvitationMail(config: MailConfig, mail: InvitationMail): Promise<void> {
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.user ? { user: config.user, pass: config.pass } : undefined, connectionTimeout: 8000, socketTimeout: 10_000 });
  const content = renderInvitation(mail);
  await transport.sendMail({ from: config.from, to: mail.to, ...content });
}
