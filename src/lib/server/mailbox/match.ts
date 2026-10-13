import type { Booking, Stay } from '@/lib/domain/schemas';

export interface MailMatch {
  stayId: string | null;
  bookingId: string | null;
  reason: string | null;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
const emailsIn = (value: string | null) => [...(value ?? '').toLowerCase().matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g)].map((m) => ({ address: m[0], domain: m[1]! }));
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'web.de', 'gmx.de', 'gmx.net', 'icloud.com', 'mailbox.org', 't-online.de']);

/**
 * Assigns a mail to a stay or booking, strongest signal first: booking reference in the mail, the provider's address as contact,
 * then the sender's own domain, finally the name of the stay or booking in the subject. Ambiguity means no assignment (a person
 * assigns it in the app); a wrong assignment would put payments on the wrong stay.
 */
export function matchMail(mail: { from: string; subject: string; text: string }, stays: readonly Stay[], bookings: readonly Booking[]): MailMatch {
  const haystack = `${mail.subject}\n${mail.text}`.toLowerCase();
  const byRef = [
    ...stays.filter((s) => s.booking_ref && s.booking_ref.length >= 4 && haystack.includes(s.booking_ref.toLowerCase())).map((s) => ({ kind: 'stay' as const, id: s.id })),
    ...bookings.filter((b) => b.reference && b.reference.length >= 4 && haystack.includes(b.reference.toLowerCase())).map((b) => ({ kind: 'booking' as const, id: b.id })),
  ];
  const pick = (candidates: { kind: 'stay' | 'booking'; id: string }[], reason: string): MailMatch | null =>
    candidates.length === 1 ? { stayId: candidates[0]!.kind === 'stay' ? candidates[0]!.id : null, bookingId: candidates[0]!.kind === 'booking' ? candidates[0]!.id : null, reason } : null;
  const ref = pick(byRef, 'Buchungsnummer in der Mail');
  if (ref) return ref;
  if (byRef.length > 1) return { stayId: null, bookingId: null, reason: null };

  const sender = emailsIn(mail.from)[0];
  if (sender) {
    const byAddress = [
      ...stays.filter((s) => emailsIn(s.contact).some((e) => e.address === sender.address)).map((s) => ({ kind: 'stay' as const, id: s.id })),
      ...bookings.filter((b) => emailsIn(b.contact).some((e) => e.address === sender.address)).map((b) => ({ kind: 'booking' as const, id: b.id })),
    ];
    const address = pick(byAddress, 'Absender ist als Kontakt hinterlegt');
    if (address) return address;
    if (!FREE_MAIL.has(sender.domain)) {
      const byDomain = [
        ...stays.filter((s) => emailsIn(s.contact).some((e) => e.domain === sender.domain)).map((s) => ({ kind: 'stay' as const, id: s.id })),
        ...bookings.filter((b) => emailsIn(b.contact).some((e) => e.domain === sender.domain)).map((b) => ({ kind: 'booking' as const, id: b.id })),
      ];
      const domain = pick(byDomain, 'Gleiche Mail-Domain wie der hinterlegte Kontakt');
      if (domain) return domain;
    }
  }

  const subject = norm(mail.subject);
  const byName = [
    ...stays.filter((s) => norm(s.name).length >= 5 && subject.includes(norm(s.name))).map((s) => ({ kind: 'stay' as const, id: s.id })),
    ...bookings.filter((b) => norm(b.title).length >= 5 && subject.includes(norm(b.title))).map((b) => ({ kind: 'booking' as const, id: b.id })),
  ];
  return pick(byName, 'Name der Unterkunft oder Buchung im Betreff') ?? { stayId: null, bookingId: null, reason: null };
}
