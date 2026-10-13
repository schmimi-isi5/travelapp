import { beforeEach, describe, expect, it } from 'vitest';
import { addDocument, cacheDocumentsOffline } from '@/lib/db/documents';
import { loadBlob } from '@/lib/db/blob-store';
import { DEMO_FAMILY_ID, DEMO_USERS } from '@/lib/db/demo-data';
import { setActor } from '@/lib/db/actor';
import { getLocalDb } from '@/lib/db/local';
import { get, list } from '@/lib/db/repo';
import { travelDocumentItems } from '@/lib/domain/travel-documents';
import { BOOKING_DOCUMENT_KINDS, defaultDocumentKind, documentKindLabel } from '@/lib/labels';
import { DOCUMENT_CLASSIFICATIONS } from '@/lib/domain/schemas';
import { freshWorld } from './helpers';

const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70, 45, 49])], name, { type: 'application/pdf' });

describe('documents for the whole family', () => {
  beforeEach(() => freshWorld('owner', DEMO_USERS.ownerA));

  it('stores a boarding pass as family-visible and anything else as adults only', async () => {
    const pass = await addDocument({ file: pdf('bordkarte.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket', isFamilyVisible: true });
    const contract = await addDocument({ file: pdf('mietvertrag.pdf'), familyId: DEMO_FAMILY_ID, classification: 'contract' });
    expect(pass).toMatchObject({ classification: 'ticket', access_level: 'family' });
    expect(contract).toMatchObject({ classification: 'contract', access_level: 'adult' });
  });

  it('never makes an identity or insurance document family-visible, even when asked', async () => {
    const doc = await addDocument({ file: pdf('pass.pdf'), familyId: DEMO_FAMILY_ID, classification: 'passport', passphrase: 'geheim-12345', isFamilyVisible: true });
    expect(doc.access_level).toBe('sensitive');
  });

  it('shows adults every document and children and members only the family-visible ones', async () => {
    const pass = await addDocument({ file: pdf('bordkarte.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket', isFamilyVisible: true });
    const contract = await addDocument({ file: pdf('mietvertrag.pdf'), familyId: DEMO_FAMILY_ID, classification: 'contract' });
    const ids = async () => (await list('documents')).map((d) => d.id);
    expect(await ids()).toEqual(expect.arrayContaining([pass.id, contract.id]));
    for (const [role, userId] of [['child', DEMO_USERS.childB], ['member', DEMO_USERS.memberTeen]] as const) {
      setActor({ userId, role });
      const seen = await ids();
      expect(seen, role).toContain(pass.id);
      expect(seen, role).not.toContain(contract.id);
      expect(await get('documents', contract.id), role).toBeUndefined();
      expect((await get('documents', pass.id))?.id, role).toBe(pass.id);
    }
    setActor({ userId: DEMO_USERS.adultB, role: 'adult' });
    expect(await ids()).toEqual(expect.arrayContaining([pass.id, contract.id]));
  });

  it('keeps children from changing or adding documents', async () => {
    const pass = await addDocument({ file: pdf('bordkarte.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket', isFamilyVisible: true });
    setActor({ userId: DEMO_USERS.childB, role: 'child' });
    await expect(addDocument({ file: pdf('x.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket', isFamilyVisible: true })).rejects.toThrow();
    const { remove, update } = await import('@/lib/db/repo');
    await expect(update('documents', pass.id, { access_level: 'adult' })).rejects.toThrow();
    await expect(remove('documents', pass.id)).rejects.toThrow();
  });
});

describe('keeping documents on this device', () => {
  beforeEach(() => freshWorld('owner', DEMO_USERS.ownerA));

  it('downloads what is missing, leaves what is here alone and counts failures without throwing', async () => {
    const here = await addDocument({ file: pdf('hier.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket', isFamilyVisible: true });
    const elsewhere = { ...here, id: 'elsewhere-1', storage_path: `${DEMO_FAMILY_ID}/documents/elsewhere.pdf`, original_name: 'woanders.pdf' };
    const gone = { ...here, id: 'gone-1', storage_path: `${DEMO_FAMILY_ID}/documents/gone.pdf` };
    const remote = { download: async (path: string) => (path.endsWith('elsewhere.pdf') ? new Blob(['%PDF-remote'], { type: 'application/pdf' }) : null) };
    const steps: number[] = [];
    const result = await cacheDocumentsOffline([here, elsewhere, gone], remote, (done) => steps.push(done));
    expect(result).toEqual({ cached: 1, alreadyLocal: 1, failed: 1 });
    expect(steps).toEqual([1, 2, 3]);
    expect((await loadBlob(getLocalDb(), 'elsewhere-1'))?.name).toBe('woanders.pdf');
    expect((await cacheDocumentsOffline([here, elsewhere], remote)).alreadyLocal).toBe(2);
  });

  it('counts a download that throws as failed', async () => {
    const doc = await addDocument({ file: pdf('a.pdf'), familyId: DEMO_FAMILY_ID, classification: 'ticket' });
    const result = await cacheDocumentsOffline([{ ...doc, id: 'boom' }], { download: async () => { throw new Error('offline'); } });
    expect(result).toEqual({ cached: 0, alreadyLocal: 0, failed: 1 });
  });
});

describe('labels and the travel overview', () => {
  it('names every document kind and suggests the right kind per booking type', () => {
    for (const kind of DOCUMENT_CLASSIFICATIONS) expect(documentKindLabel[kind], kind).toBeTruthy();
    expect(documentKindLabel.ticket).toBe('Bordkarte / Ticket');
    expect(documentKindLabel.contract).toBe('Vertrag');
    expect(defaultDocumentKind('flight')).toBe('ticket');
    expect(defaultDocumentKind('car')).toBe('contract');
    expect(defaultDocumentKind('activity')).toBe('confirmation');
    expect(BOOKING_DOCUMENT_KINDS).toContain(defaultDocumentKind('flight'));
  });

  it('lists documents by trip day with their booking, leaves out mails and identity documents', () => {
    const base = { created_at: '2026-10-01T00:00:00Z', stay_id: null, booking_id: null, title: null, original_name: 'x.pdf' };
    const docs = [
      { ...base, id: 'd1', booking_id: 'b2', classification: 'contract', access_level: 'adult' },
      { ...base, id: 'd2', booking_id: 'b1', classification: 'ticket', access_level: 'family' },
      { ...base, id: 'd3', classification: 'correspondence', access_level: 'adult' },
      { ...base, id: 'd4', classification: 'passport', access_level: 'sensitive' },
      { ...base, id: 'd5', classification: 'other', access_level: 'adult' },
    ] as never[];
    const bookings = [{ id: 'b1', title: 'Flug Frankfurt – Windhoek', starts_at: '2026-10-13T20:30:00' }, { id: 'b2', title: 'Mietwagen', starts_at: '2026-10-14T10:00:00' }] as never[];
    const items = travelDocumentItems(docs, bookings, []);
    expect(items.map((i) => i.doc.id)).toEqual(['d2', 'd1', 'd5']);
    expect(items[0]).toMatchObject({ context: 'Flug Frankfurt – Windhoek', date: '2026-10-13' });
    expect(items[2]).toMatchObject({ context: null, date: null });
  });
});
