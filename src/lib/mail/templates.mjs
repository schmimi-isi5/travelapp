// All e-mails of the app in one place: the invitation mail the app sends itself and the mails of the auth service (password reset,
// confirmation, invitation, magic link, change of address, re-authentication). One layout, German texts, an HTML and a plain-text
// version. The auth service cannot call this code, so `scripts/build-mail-templates.mjs` renders the same layout with its
// placeholders ({{ .ConfirmationURL }} ...) into public/mail-templates/, and the auth service fetches those files.
// Plain JavaScript (no types needed at runtime) so that the build script can import it without a compiler.

export const BRAND = {
  name: 'Namibia & Botswana',
  tagline: 'Unsere Reise. Unsere Geschichte.',
  deep: '#0f3d4e',
  gold: '#d4a373',
  clay: '#c65a3a',
  sand: '#f5efe6',
  sandSoft: '#fbf6ee',
  line: '#e5dccd',
  ink: '#1f2937',
  muted: '#566376',
};

/** Placeholders of the auth service (Go templates); the app's own mail passes real values instead. */
export const GOTRUE = {
  link: '{{ .ConfirmationURL }}',
  siteUrl: '{{ .SiteURL }}',
  email: '{{ .Email }}',
  newEmail: '{{ .NewEmail }}',
  token: '{{ .Token }}',
};

export const KINDS = ['invitation', 'invite', 'recovery', 'confirmation', 'magic_link', 'email_change', 'reauthentication'];

/** Subject lines; the auth service gets the same ones through GOTRUE_MAILER_SUBJECTS_* (docker/supabase/compose.yml). */
export const SUBJECTS = {
  invitation: 'Einladung: Namibia & Botswana – Unsere Reise',
  invite: 'Einladung: Namibia & Botswana – Unsere Reise',
  recovery: 'Neues Passwort für „Unsere Reise“',
  confirmation: 'Bitte bestätige deine E-Mail-Adresse',
  magic_link: 'Dein Anmeldelink für „Unsere Reise“',
  email_change: 'Bitte bestätige deine neue E-Mail-Adresse',
  reauthentication: 'Dein Bestätigungscode für „Unsere Reise“',
};

export const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const IGNORE = 'Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren: Es passiert nichts, solange niemand auf den Link klickt.';

/** What each mail says. `vars` carries real values or the auth service's placeholders. */
function content(kind, vars) {
  const inviter = vars.inviterName ? escapeHtml(vars.inviterName) : null;
  const family = vars.familyName ? escapeHtml(vars.familyName) : null;
  switch (kind) {
    case 'invitation':
      return {
        preheader: inviter ? `${inviter} lädt dich in die Reise-App ein.` : 'Du wurdest in die Reise-App eingeladen.',
        heading: 'Du bist eingeladen',
        paragraphs: [
          `${inviter ? `<strong>${inviter}</strong> lädt dich` : 'Du wirst'} ${family ? `in die Reise-App der Familie „${family}“` : 'in die Familien-Reise-App „Namibia &amp; Botswana“'} ${inviter ? 'ein' : 'eingeladen'}.`,
          'Dort findet ihr Route, Unterkünfte, Tagebuch und Fotos eurer Reise an einem Ort, auch ohne Netz unterwegs.',
        ],
        button: 'Einladung annehmen',
        note: 'Der Link ist 7 Tage gültig und nur für diese E-Mail-Adresse bestimmt. Wenn du die Einladung nicht erwartest, ignoriere diese Nachricht.',
        why: 'Du bekommst diese E-Mail, weil dich jemand in die Reise-App eingeladen hat.',
      };
    case 'invite':
      return {
        preheader: 'Richte dein Konto für die Reise-App ein.',
        heading: 'Du bist eingeladen',
        paragraphs: ['Für dich wurde ein Konto in der Familien-Reise-App „Namibia &amp; Botswana“ angelegt.', 'Mit dem Link richtest du es ein und legst dein Passwort fest.'],
        button: 'Konto einrichten',
        note: 'Der Link ist nur kurze Zeit gültig und nur für diese E-Mail-Adresse bestimmt. Wenn du die Einladung nicht erwartest, ignoriere diese Nachricht.',
        why: 'Du bekommst diese E-Mail, weil für diese Adresse ein Konto angelegt wurde.',
      };
    case 'recovery':
      return {
        preheader: 'Lege ein neues Passwort für deinen Zugang fest.',
        heading: 'Neues Passwort festlegen',
        paragraphs: ['Für den Zugang zur Reise-App „Namibia &amp; Botswana“ wurde ein neues Passwort angefordert.', 'Mit dem Knopf legst du es fest.'],
        button: 'Neues Passwort festlegen',
        note: `Der Link ist nur kurze Zeit gültig und kann nur einmal verwendet werden. ${IGNORE} Dein bisheriges Passwort bleibt dann unverändert.`,
        why: 'Du bekommst diese E-Mail, weil für diese Adresse ein neues Passwort angefordert wurde.',
      };
    case 'confirmation':
      return {
        preheader: 'Ein Klick, dann ist deine Adresse bestätigt.',
        heading: 'E-Mail-Adresse bestätigen',
        paragraphs: ['Bitte bestätige, dass diese E-Mail-Adresse zu dir gehört. Danach kannst du die Reise-App „Namibia &amp; Botswana“ nutzen.'],
        button: 'Adresse bestätigen',
        note: `Der Link ist nur kurze Zeit gültig. ${IGNORE}`,
        why: 'Du bekommst diese E-Mail, weil diese Adresse für die Reise-App angegeben wurde.',
      };
    case 'magic_link':
      return {
        preheader: 'Dein persönlicher Anmeldelink.',
        heading: 'Dein Anmeldelink',
        paragraphs: ['Mit dem Knopf meldest du dich ohne Passwort in der Reise-App „Namibia &amp; Botswana“ an.'],
        button: 'Jetzt anmelden',
        note: `Der Link ist nur kurze Zeit gültig und kann nur einmal verwendet werden. Leite ihn nicht weiter. ${IGNORE}`,
        why: 'Du bekommst diese E-Mail, weil für diese Adresse ein Anmeldelink angefordert wurde.',
      };
    case 'email_change':
      return {
        preheader: 'Bestätige deine neue E-Mail-Adresse.',
        heading: 'Neue E-Mail-Adresse bestätigen',
        paragraphs: [`Du möchtest die E-Mail-Adresse deines Zugangs von <strong>${vars.email}</strong> zu <strong>${vars.newEmail}</strong> ändern.`, 'Bestätige die Änderung mit dem Knopf.'],
        button: 'Änderung bestätigen',
        note: `Der Link ist nur kurze Zeit gültig. ${IGNORE} Deine Adresse bleibt dann unverändert.`,
        why: 'Du bekommst diese E-Mail, weil für deinen Zugang eine neue Adresse angegeben wurde.',
      };
    case 'reauthentication':
      return {
        preheader: `Dein Code: ${vars.token}`,
        heading: 'Dein Bestätigungscode',
        paragraphs: ['Gib diesen Code in der Reise-App ein, um die Änderung zu bestätigen:'],
        code: vars.token,
        note: `Der Code ist nur kurze Zeit gültig. Gib ihn niemandem weiter. ${IGNORE}`,
        why: 'Du bekommst diese E-Mail, weil in deinem Zugang eine sensible Änderung bestätigt werden soll.',
      };
    default:
      throw new Error(`Unbekannte Mail-Art: ${kind}`);
  }
}

/** Strips tags for the plain-text version; values the app inserted are escaped in the HTML and unescaped here. */
function toText(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Renders one mail. `vars`: link, siteUrl, email, newEmail, token, inviterName, familyName (any may be missing for kinds that do
 * not use it). For the auth service pass `GOTRUE` as vars: the result then keeps its {{ placeholders }} for the service to fill.
 */
export function renderMail(kind, vars = {}) {
  const v = { link: '', siteUrl: '', email: '', newEmail: '', token: '', inviterName: null, familyName: null, ...vars };
  const c = content(kind, v);
  const subject = SUBJECTS[kind];
  const logo = `${v.siteUrl}/icons/icon-192.png`;
  const safeLink = v.link.startsWith('{{') ? v.link : escapeHtml(v.link);
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;"><tr><td align="center" bgcolor="${BRAND.gold}" style="border-radius:999px;"><a href="${safeLink}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:${SANS};font-size:16px;font-weight:700;line-height:20px;color:${BRAND.deep};text-decoration:none;border-radius:999px;">${c.button}</a></td></tr></table>
       <p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${BRAND.muted};">Der Knopf funktioniert nicht? Kopiere diesen Link in die Adresszeile deines Browsers:<br><a href="${safeLink}" target="_blank" style="color:${BRAND.deep};word-break:break-all;">${safeLink}</a></p>`
    : '';
  const code = c.code
    ? `<p style="margin:24px 0 8px;text-align:center;"><span style="display:inline-block;padding:14px 28px;border-radius:12px;background:${BRAND.sandSoft};border:1px solid ${BRAND.line};font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:${BRAND.deep};">${c.code}</span></p>`
    : '';
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .heading { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.sand};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${c.preheader}${'&#8199;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.sand}">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;">
    <tr><td bgcolor="${BRAND.deep}" class="px" style="padding:26px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:14px;"><img src="${logo}" width="44" height="44" alt="" style="display:block;border:0;border-radius:10px;"></td>
        <td valign="middle"><div style="font-family:${SERIF};font-size:20px;line-height:24px;font-weight:700;color:#ffffff;">${BRAND.name.replace('&', '&amp;')}</div><div style="font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:1.6px;text-transform:uppercase;color:${BRAND.gold};">${BRAND.tagline}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" height="5" bgcolor="${BRAND.gold}" style="height:5px;line-height:5px;font-size:0;">&nbsp;</td><td width="30%" height="5" bgcolor="${BRAND.clay}" style="height:5px;line-height:5px;font-size:0;">&nbsp;</td><td width="20%" height="5" bgcolor="${BRAND.line}" style="height:5px;line-height:5px;font-size:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td class="px" style="padding:38px 40px 12px;">
      <h1 class="heading" style="margin:0 0 18px;font-family:${SERIF};font-size:28px;line-height:1.2;font-weight:700;color:${BRAND.deep};">${c.heading}</h1>
      ${c.paragraphs.map((p) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:16px;line-height:1.6;color:${BRAND.ink};">${p}</p>`).join('\n      ')}
      ${button}${code}
    </td></tr>
    <tr><td class="px" style="padding:20px 40px 34px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND.sandSoft}" style="padding:14px 16px;border-left:3px solid ${BRAND.gold};border-radius:6px;font-family:${SANS};font-size:13px;line-height:1.55;color:${BRAND.muted};">${c.note}</td></tr></table>
    </td></tr>
    <tr><td bgcolor="${BRAND.sandSoft}" class="px" style="padding:22px 40px;border-top:1px solid ${BRAND.line};font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">
      ${c.why}<br>Unsere Reise. Unsere Geschichte.${v.siteUrl ? ` <a href="${v.siteUrl}" target="_blank" style="color:${BRAND.deep};">${v.siteUrl.replace(/^https?:\/\//, '')}</a>` : ''}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    c.heading,
    '',
    ...c.paragraphs.map(toText),
    ...(c.code ? ['', c.code] : []),
    ...(c.button ? ['', `${c.button}: ${v.link}`] : []),
    '',
    toText(c.note),
    '',
    '--',
    toText(c.why),
    `Unsere Reise. Unsere Geschichte.${v.siteUrl ? ` ${v.siteUrl}` : ''}`,
  ].join('\n');
  return { subject, html, text };
}
