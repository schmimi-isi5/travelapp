import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildExport, toCsv } from '@/features/archive/export';
import { searchArchive } from '@/features/archive/search';
import { answerFromTips, summarizeLocally } from '@/lib/ai/fallback';
import { createProviderFromEnv, KonturosProvider } from '@/lib/ai/providers';
import { buildDemoData } from '@/lib/db/demo-data';
import { getLocalDb } from '@/lib/db/local';
import type { Booking, JournalEntry, TravelTip, TripStop, WildlifeSighting, WildlifeSpecies } from '@/lib/domain/schemas';
import { freshWorld } from './helpers';

describe('export', () => {
  beforeEach(() => freshWorld());

  it('builds a ZIP with JSON + CSV per table and a manifest naming missing media', async () => {
    await getLocalDb().entity('media_assets').put({ ...(await getLocalDb().entity('media_assets').get('demo-media-1'))!, id: 'gone', storage_path: 'fam/trip/gone.jpg', original_name: 'gone.jpg', size_bytes: 10, mime_type: 'image/jpeg' });
    const result = await buildExport('owner');
    const zip = await JSZip.loadAsync(result.zip);
    expect(zip.file('manifest.json')).toBeTruthy();
    expect(zip.file('data/stays.json')).toBeTruthy();
    expect(zip.file('data/stays.csv')).toBeTruthy();
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.format).toBe('namibia-botswana-export');
    expect(manifest.contains_demo_data).toBe(true);
    expect(manifest.media.find((m: { id: string }) => m.id === 'gone').status).toBe('missing');
    expect(manifest.notes.join(' ')).toMatch(/fehlen/);
    for (const [table, info] of Object.entries(manifest.tables) as [string, { rows: number }][]) expect(info.rows).toBe(result.data[table]!.length);
  });
  it('never exports finance tables for non-adult roles', async () => {
    const result = await buildExport('child');
    expect(result.data.payments).toBeUndefined();
    expect(result.data.documents).toBeUndefined();
    expect(result.data.expenses).toBeUndefined();
    expect(result.data.trip_stops).toBeDefined();
  });
  it('escapes CSV and neutralizes spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], ['say "hi"', 3]])).toBe('a,b\r\n"x,y",\'=SUM(A1)\r\n"say ""hi""",3');
  });
});

describe('archive search', () => {
  const d = buildDemoData();
  const src = { journal: d.journal_entries as unknown as JournalEntry[], sightings: d.wildlife_sightings as unknown as WildlifeSighting[], species: d.wildlife_species as unknown as WildlifeSpecies[], stops: d.trip_stops as unknown as TripStop[], tips: d.travel_tips as unknown as TravelTip[], bookings: d.bookings as unknown as Booking[] };
  it('finds text across journal, sightings and stops, ignoring case and accents', () => {
    expect(searchArchive('elefanten', src).map((h) => h.kind)).toEqual(expect.arrayContaining(['journal', 'sighting']));
    expect(searchArchive('SOSSUSVLEI', src).some((h) => h.kind === 'stop')).toBe(true);
    expect(searchArchive('duene', src)).toHaveLength(0);
    expect(searchArchive('dünen', src).length).toBeGreaterThan(0);
  });
  it('requires all terms to match', () => {
    expect(searchArchive('elefanten wasserloch', src).length).toBeGreaterThan(0);
    expect(searchArchive('elefanten zzzz', src)).toHaveLength(0);
  });
});

describe('AI layer', () => {
  const tips = buildDemoData().travel_tips as unknown as TravelTip[];
  it('local fallback answers from curated tips, labeled as rule based, without live claims', () => {
    const r = answerFromTips('Wie beobachte ich Tiere am Wasserloch?', tips);
    expect(r.origin).toBe('local_rule_based');
    expect(r.text).toMatch(/Wasserl/);
    expect(r.availability_note).toMatch(/offline|ohne Live/i);
  });
  it('admits when nothing is known instead of inventing an answer', () => {
    const r = answerFromTips('Aktuelle Flugpreise Frankfurt', tips);
    expect(r.text).toMatch(/kein kuratierter Hinweis/);
  });
  it('summarizes extractively and says so', () => {
    const r = summarizeLocally([{ title: 'Tag 1', body: 'Wir sind gelandet. Danach Mietwagen.' }]);
    expect(r.text).toContain('Wir sind gelandet.');
    expect(r.text).not.toContain('Danach');
    expect(r.origin).toBe('local_rule_based');
  });
  it('selects providers from env and reports not_configured honestly', () => {
    expect(createProviderFromEnv({ AI_PROVIDER: 'disabled' }).status().state).toBe('disabled');
    expect(createProviderFromEnv({ AI_PROVIDER: 'konturos' }).status()).toMatchObject({ state: 'not_configured' });
    expect(createProviderFromEnv({ AI_PROVIDER: 'stub' }).status().state).toBe('ready');
  });
  it('the Konturos adapter posts server-side with a bearer key and labels output as AI', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ text: 'Entwurf' }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new KonturosProvider({ baseUrl: 'https://konturos.example', apiKey: 'k', path: '/v1/generate' }, fakeFetch);
    const r = await provider.generate({ task: 'answer_question', input: { question: 'x' } });
    expect(r.origin).toBe('ai_generated');
    expect(seen!.url).toBe('https://konturos.example/v1/generate');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });
  it('the Konturos adapter fails loudly on provider errors', async () => {
    const provider = new KonturosProvider({ baseUrl: 'https://k.example', apiKey: 'k', path: '/p' }, (async () => new Response('no', { status: 500 })) as unknown as typeof fetch);
    await expect(provider.generate({ task: 'summarize_journal', input: {} })).rejects.toThrow(/500/);
  });
});
