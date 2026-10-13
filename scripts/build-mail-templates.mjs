#!/usr/bin/env node
// Writes the HTML templates of the auth service into public/mail-templates/ (served by the app, fetched by the auth service via
// GOTRUE_MAILER_TEMPLATES_*). Same layout as the app's own mails: src/lib/mail/templates.mjs. Runs before every build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOTRUE, KINDS, renderMail } from '../src/lib/mail/templates.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mail-templates');
mkdirSync(out, { recursive: true });
// the app's own invitation mail is not an auth-service template
for (const kind of KINDS.filter((k) => k !== 'invitation')) writeFileSync(join(out, `${kind}.html`), renderMail(kind, GOTRUE).html);
console.log(`mail templates: ${KINDS.length - 1} written to public/mail-templates`);
