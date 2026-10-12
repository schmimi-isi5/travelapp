import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '@/lib/ai/providers';
import { parseReceiptText, toAmount } from '@/lib/ai/receipt-types';

describe('receipt amounts', () => {
  it('reads German and English number formats and refuses what is not a number', () => {
    expect(toAmount(123.4)).toBe(123.4);
    expect(toAmount('1.234,50')).toBe(1234.5);
    expect(toAmount('1,234.50')).toBe(1234.5);
    expect(toAmount('1234.5')).toBe(1234.5);
    expect(toAmount('N$ 89,90')).toBe(89.9);
    expect(toAmount('1.234')).toBe(1234);
    expect(toAmount('viel')).toBeNull();
    expect(toAmount(null)).toBeNull();
  });
});

describe('receipt reading answer', () => {
  it('takes the JSON out of a code fence and normalises the fields', () => {
    const text = 'Hier ist das Ergebnis:\n```json\n{"amount":"289,40","currency":"nad","date":"2026-10-20","merchant":"Spar Windhoek","category":"Einkauf"}\n```';
    expect(parseReceiptText(text)).toEqual({ amount: 289.4, currency: 'NAD', date: '2026-10-20', merchant: 'Spar Windhoek', category: 'einkauf' });
  });

  it('nulls a single bad field instead of dropping the whole receipt, and never invents values', () => {
    expect(parseReceiptText('{"amount":-5,"currency":"Dollar","date":"gestern","merchant":"  ","category":"Souvenirs"}')).toEqual({ amount: null, currency: null, date: null, merchant: null, category: null });
    expect(parseReceiptText('{"amount":12.5,"currency":null,"date":"2026-10-20"}')).toMatchObject({ amount: 12.5, currency: null, date: '2026-10-20', merchant: null });
  });

  it('fails without any JSON', () => {
    expect(() => parseReceiptText('Das ist kein Beleg.')).toThrow('Keine Beleg-Daten');
    expect(() => parseReceiptText('{kaputt')).toThrow();
  });
});

describe('AnthropicProvider.extractReceipt', () => {
  const image = { mediaType: 'image/jpeg' as const, base64: '/9j/AAAA' };
  const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

  it('sends the photo as an image block with a prompt that forbids guessing, and returns the parsed suggestion', async () => {
    const fetchMock = reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"amount":45,"currency":"BWP","date":null,"merchant":"Shell","category":"transport"}' }] });
    const reading = await new AnthropicProvider({ apiKey: 'k', model: 'claude-test' }, fetchMock as unknown as typeof fetch).extractReceipt(image);
    expect(reading.receipt).toEqual({ amount: 45, currency: 'BWP', date: null, merchant: 'Shell', category: 'transport' });
    expect(reading.provider).toBe('anthropic:claude-test');
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/AAAA' } });
    expect(body.messages[0].content[1].text).toContain('null für alles, was nicht sicher lesbar ist');
    expect(body.system).toContain('Rate nichts');
  });

  it('retries once with a larger budget when only a thinking block came back, and reports an unusable answer clearly', async () => {
    const retry = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'thinking' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"amount":9.9,"currency":"EUR","date":null,"merchant":null,"category":null}' }] }), { status: 200 }));
    expect((await new AnthropicProvider({ apiKey: 'k', maxTokens: 500 }, retry as unknown as typeof fetch).extractReceipt(image)).receipt.amount).toBe(9.9);
    expect(retry).toHaveBeenCalledTimes(2);
    await expect(new AnthropicProvider({ apiKey: 'k' }, reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ich kann das nicht lesen.' }] }) as unknown as typeof fetch).extractReceipt(image)).rejects.toThrow('Keine Beleg-Daten');
  });
});
