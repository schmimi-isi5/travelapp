import nodemailer from 'nodemailer';
import { renderMail } from '../mail/templates.mjs';

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

/** The invitation mail (HTML and plain text, same layout as the mails of the auth service). */
export function renderInvitation({ link, familyName, inviterName }: Omit<InvitationMail, 'to'>, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''): { subject: string; text: string; html: string } {
  return renderMail('invitation', { link, familyName, inviterName, siteUrl: siteUrl.replace(/\/+$/, '') });
}

export async function sendInvitationMail(config: MailConfig, mail: InvitationMail): Promise<void> {
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: config.user ? { user: config.user, pass: config.pass } : undefined, connectionTimeout: 8000, socketTimeout: 10_000 });
  const content = renderInvitation(mail);
  await transport.sendMail({ from: config.from, to: mail.to, ...content });
}
