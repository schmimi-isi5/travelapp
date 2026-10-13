import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND, GOTRUE, KINDS, renderMail, SUBJECTS, type MailKind } from '../../src/lib/mail/templates.mjs';

const SITE = 'https://reise.example.test';
const LINK = `${SITE}/invite?token=abc_DEF-123`;
const vars = { link: LINK, siteUrl: SITE, email: 'a@example.test', newEmail: 'b@example.test', token: '482913', inviterName: 'Michael', familyName: 'Familie Test' };

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('every mail of the app', () => {
  for (const kind of KINDS) {
    it(`${kind}: complete HTML mail with plain-text twin, preheader, safe markup and a size Gmail does not clip`, () => {
      const mail = renderMail(kind, vars);
      expect(mail.subject).toBe(SUBJECTS[kind]);
      expect(mail.html.startsWith('<!doctype html>')).toBe(true);
      expect(mail.html).toContain('<html lang="de">');
      expect(mail.html).toContain(`<title>${mail.subject.replace(/&/g, '&amp;')}</title>`);
      expect(mail.html).toMatch(/display:none;max-height:0;overflow:hidden/); // hidden preheader
      expect(mail.html).toContain(BRAND.tagline);
      expect(mail.html).not.toMatch(/<script|<link |<iframe|javascript:|undefined|\[object/i);
      for (const img of mail.html.match(/<img\b[^>]*>/g) ?? []) expect(img).toMatch(/\salt="/);
      for (const href of [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!)) expect(href).toMatch(/^https:\/\//);
      expect(Buffer.byteLength(mail.html)).toBeLessThan(100 * 1024);
      expect(mail.text).not.toMatch(/<[a-z/][^>]*>/i);
      expect(mail.text).toContain(BRAND.tagline);
      if (kind === 'reauthentication') expect(mail.text).toContain('482913');
      else {
        expect(mail.html).toContain(`href="${LINK}"`);
        expect(mail.text).toContain(LINK);
      }
    });
  }

  it('escapes names and links in the HTML and shows them plainly in the text', () => {
    const mail = renderMail('invitation', { ...vars, link: `${SITE}/i?a=1&b="2"`, inviterName: '<b>Max</b> & Co', familyName: 'Familie <Test>' });
    expect(mail.html).not.toContain('<b>Max</b>');
    expect(mail.html).toContain('&lt;b&gt;Max&lt;/b&gt; &amp; Co');
    expect(mail.html).toContain('&lt;Test&gt;');
    expect(mail.html).toContain('a=1&amp;b=&quot;2&quot;');
    expect(mail.text).toContain('<b>Max</b> & Co lädt dich');
    expect(mail.text).toContain(`${SITE}/i?a=1&b="2"`);
  });

  it('works without names and without a site URL (no empty link text, no broken sentence)', () => {
    const mail = renderMail('invitation', { link: LINK });
    expect(mail.text).toContain('Du wirst in die Familien-Reise-App „Namibia & Botswana“ eingeladen.');
    expect(mail.html).not.toContain('href="/'); // no relative links
  });

  it('keeps the placeholders of the auth service intact (not escaped, not filled)', () => {
    for (const kind of KINDS.filter((k) => k !== 'invitation')) {
      const html = renderMail(kind as MailKind, GOTRUE).html;
      if (kind === 'reauthentication') expect(html).toContain('{{ .Token }}');
      else {
        expect(html).toContain('href="{{ .ConfirmationURL }}"');
        expect(html).not.toContain('&#123;');
      }
      expect(html).toContain('{{ .SiteURL }}/icons/icon-192.png');
    }
    expect(renderMail('email_change', GOTRUE).html).toMatch(/\{\{ \.Email \}\}[\s\S]*\{\{ \.NewEmail \}\}/);
  });

  it('uses colour pairs that are readable (WCAG AA, 4.5:1) for every text on its background', () => {
    const pairs = [[BRAND.ink, '#ffffff'], [BRAND.deep, '#ffffff'], [BRAND.deep, BRAND.gold], ['#ffffff', BRAND.deep], [BRAND.gold, BRAND.deep], [BRAND.muted, BRAND.sandSoft], [BRAND.deep, BRAND.sandSoft]] as const;
    for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('auth service configuration', () => {
  const compose = readFileSync(join(process.cwd(), 'docker/supabase/compose.yml'), 'utf8');
  const AUTH_KINDS = KINDS.filter((k) => k !== 'invitation');

  it('has the same German subject lines as the templates for every auth mail', () => {
    for (const kind of AUTH_KINDS) {
      const line = new RegExp(`GOTRUE_MAILER_SUBJECTS_${kind.toUpperCase()}: "([^"]+)"`).exec(compose);
      expect(line?.[1], kind).toBe(SUBJECTS[kind]);
    }
  });

  it('points every auth mail at its template file below the site URL', () => {
    for (const kind of AUTH_KINDS) expect(compose, kind).toContain(`GOTRUE_MAILER_TEMPLATES_${kind.toUpperCase()}: \${MAIL_TEMPLATE_BASE:-\${SITE_URL}}/mail-templates/${kind}.html`);
  });

  it('writes one template file per auth mail with the build script', () => {
    execFileSync('node', ['scripts/build-mail-templates.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
    for (const kind of AUTH_KINDS) {
      const file = join(process.cwd(), 'public', 'mail-templates', `${kind}.html`);
      expect(existsSync(file), kind).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('<html lang="de">');
    }
  });
});
