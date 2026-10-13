import { describe, expect, it } from 'vitest';
import { parseMailFactsText, verifySuggestions } from '@/lib/ai/mail-types';
import { extractFactsByRules, findDates, mergeFacts } from '@/lib/server/mailbox/extract';
import { mailToTextFile } from '@/lib/server/mailbox/ingest';
import { matchMail } from '@/lib/server/mailbox/match';
import type { Booking, Stay } from '@/lib/domain/schemas';

const stay = (over: Partial<Stay>) => ({ id: 's1', name: 'Arebbusch Travel Lodge', booking_ref: null, contact: null, ...over }) as Stay;
const booking = (over: Partial<Booking>) => ({ id: 'b1', title: 'Mietwagen Windhoek', reference: null, contact: null, ...over }) as Booking;

describe('findDates', () => {
  it('reads ISO, German and English dates', () => {
    const dates = findDates('Fällig am 15.10.2026, spätestens 2026-10-20, oder 3 November 2026 bzw. October 5, 2026.').map((d) => d.date);
    expect(dates).toEqual(['2026-10-15', '2026-10-20', '2026-11-03', '2026-10-05']);
  });
  it('ignores impossible dates', () => {
    expect(findDates('31.13.2026 und 1.1.1999')).toEqual([]);
  });
});

describe('extractFactsByRules', () => {
  it('finds a payment received with amount, currency and date (English)', () => {
    const { suggestions } = extractFactsByRules('Dear guest,\nWe confirm that we have received your deposit of NAD 2,340.00 on 12 October 2026. Thank you for your payment.\nKind regards');
    const received = suggestions.find((s) => s.kind === 'payment_received');
    expect(received).toMatchObject({ amount_minor: 234_000, currency: 'NAD', date: '2026-10-12' });
    expect(received?.evidence).toContain('2,340.00');
  });

  it('finds a payment received in German and a due payment with date', () => {
    const { suggestions } = extractFactsByRules('Wir haben Ihre Anzahlung in Höhe von 450,00 EUR erhalten.\nDer Restbetrag von 1.350,00 EUR ist bis zum 01.11.2026 fällig.');
    expect(suggestions.find((s) => s.kind === 'payment_received')).toMatchObject({ amount_minor: 45_000, currency: 'EUR' });
    expect(suggestions.find((s) => s.kind === 'payment_due')).toMatchObject({ amount_minor: 135_000, currency: 'EUR', date: '2026-11-01' });
  });

  it('finds booking references and cancellations, but only references that contain a digit', () => {
    const { suggestions } = extractFactsByRules('Your booking reference: 6616737486. Confirmation number is pending.\nThe tour on 3 Nov was cancelled.');
    expect(suggestions.filter((s) => s.kind === 'booking_ref').map((s) => s.reference)).toEqual(['6616737486']);
    expect(suggestions.some((s) => s.kind === 'cancellation')).toBe(true);
  });

  it('suggests nothing from a mail that merely mentions money without a payment statement', () => {
    expect(extractFactsByRules('Our rooms cost about NAD 1,200 per night. Looking forward to hosting you.').suggestions).toEqual([]);
  });

  it('does not treat a received payment without amount as a suggestion', () => {
    expect(extractFactsByRules('Payment received, thank you.').suggestions).toEqual([]);
  });
});

describe('verifySuggestions', () => {
  const text = 'We have received your payment of EUR 450.00 for booking AB-12345.';
  const base = { amount_minor: null, currency: null, date: null, reference: null, text: 't' };

  it('keeps suggestions backed by the mail and drops quotes that are not in it', () => {
    const ok = { ...base, kind: 'payment_received', amount_minor: 45_000, currency: 'EUR', evidence: 'received your payment of EUR 450.00' };
    const invented = { ...ok, evidence: 'We have received 9.999 EUR' };
    expect(verifySuggestions([ok, invented], text)).toHaveLength(1);
  });

  it('drops a payment whose amount does not appear in its quote (invented or injected value)', () => {
    const wrongAmount = { ...base, kind: 'payment_received', amount_minor: 99_900, currency: 'EUR', evidence: 'received your payment of EUR 450.00' };
    expect(verifySuggestions([wrongAmount], text)).toEqual([]);
  });

  it('requires references to occur in the mail and drops malformed items one by one', () => {
    const fakeRef = { ...base, kind: 'booking_ref', reference: 'ZZ-99999', evidence: 'booking AB-12345' };
    const realRef = { ...base, kind: 'booking_ref', reference: 'AB-12345', evidence: 'booking AB-12345' };
    expect(verifySuggestions([fakeRef, realRef, { kind: 'bogus' }, null], text).map((s) => s.reference)).toEqual(['AB-12345']);
  });
});

describe('parseMailFactsText', () => {
  it('reads the JSON answer (also in a code fence) and filters by the mail text', () => {
    const mail = 'Check-in is from 14:00. Please bring your passports.';
    const answer = '```json\n{"summary":"Check-in ab 14 Uhr.","suggestions":[{"kind":"info","amount_minor":null,"currency":null,"date":null,"reference":null,"text":"Check-in ab 14 Uhr","evidence":"Check-in is from 14:00"},{"kind":"info","amount_minor":null,"currency":null,"date":null,"reference":null,"text":"erfunden","evidence":"Free upgrade included"}]}\n```';
    const facts = parseMailFactsText(answer, mail);
    expect(facts.summary).toBe('Check-in ab 14 Uhr.');
    expect(facts.suggestions.map((s) => s.text)).toEqual(['Check-in ab 14 Uhr']);
  });
  it('rejects an answer without JSON', () => {
    expect(() => parseMailFactsText('Leider nicht möglich.', 'x')).toThrow();
  });
});

describe('mergeFacts', () => {
  it('unions rule and AI suggestions without duplicates and keeps the AI summary', () => {
    const rule = { kind: 'booking_ref' as const, amount_minor: null, currency: null, date: null, reference: 'AB-12345', text: 'a', evidence: 'ref AB-12345' };
    const merged = mergeFacts({ summary: null, suggestions: [rule] }, { summary: 'Kurz.', suggestions: [{ ...rule, text: 'b' }] });
    expect(merged.suggestions).toHaveLength(1);
    expect(merged.summary).toBe('Kurz.');
  });
});

describe('matchMail', () => {
  const mail = (over: Partial<{ from: string; subject: string; text: string }>) => ({ from: 'Rezeption <info@arebbusch.example>', subject: 'Ihre Reservierung', text: '', ...over });

  it('assigns by booking reference in the mail text', () => {
    const m = matchMail(mail({ text: 'Your booking 6616737486 is confirmed.' }), [stay({ booking_ref: '6616737486' }), stay({ id: 's2', booking_ref: '5132822699' })], []);
    expect(m).toMatchObject({ stayId: 's1', bookingId: null, reason: 'Buchungsnummer in der Mail' });
  });

  it('assigns a booking by its reference too', () => {
    expect(matchMail(mail({ subject: 'Rental AB123456' }), [], [booking({ reference: 'AB123456' })])).toMatchObject({ stayId: null, bookingId: 'b1' });
  });

  it('does not guess when two stays match the reference', () => {
    const m = matchMail(mail({ text: 'ref 1234567' }), [stay({ booking_ref: '1234567' }), stay({ id: 's2', booking_ref: '1234567' })], []);
    expect(m).toEqual({ stayId: null, bookingId: null, reason: null });
  });

  it('assigns by the sender address stored as contact, and by the same business domain', () => {
    const stays = [stay({ contact: 'info@arebbusch.example, +264 61 0000' }), stay({ id: 's2', name: 'Andere Lodge', contact: 'hello@other.example' })];
    expect(matchMail(mail({}), stays, []).stayId).toBe('s1');
    expect(matchMail(mail({ from: 'booking@arebbusch.example' }), stays, []).reason).toBe('Gleiche Mail-Domain wie der hinterlegte Kontakt');
  });

  it('never assigns by the domain of a free mail provider', () => {
    expect(matchMail(mail({ from: 'host@gmail.com' }), [stay({ contact: 'other@gmail.com' })], []).stayId).toBeNull();
  });

  it('assigns by the name of the stay in the subject, otherwise leaves the mail unassigned', () => {
    expect(matchMail(mail({ from: 'x@y.example', subject: 'Welcome to Arebbusch Travel Lodge' }), [stay({})], []).stayId).toBe('s1');
    expect(matchMail(mail({ from: 'x@y.example', subject: 'Newsletter' }), [stay({})], [])).toEqual({ stayId: null, bookingId: null, reason: null });
  });
});

describe('mailToTextFile', () => {
  it('starts with sender, subject and date and names attachments that are not stored', () => {
    const text = mailToTextFile({ uid: 1, messageId: 'm', from: 'a@b.example', subject: 'Hallo', receivedAt: '2026-10-12T10:00:00.000Z', text: 'Inhalt', attachmentNames: ['rechnung.pdf'] });
    expect(text.startsWith('Von: a@b.example\nBetreff: Hallo\nDatum: 2026-10-12')).toBe(true);
    expect(text).toContain('Anhänge (nicht gespeichert): rechnung.pdf');
    expect(text.endsWith('Inhalt')).toBe(true);
  });
});
