import { describe, expect, it } from 'vitest';
import { accommodationKind, recommendForStation, summarizeWeather, type StayKind } from '@/lib/tips/recommend';
import type { WeatherDay } from '@/lib/weather/types';

const day = (over: Partial<WeatherDay> = {}): WeatherDay => ({ date: '2026-10-15', source: 'forecast', tmax: 28, tmin: 15, rainMm: 0, rainChance: 0, windMax: 15, uvMax: 6, sunrise: '2026-10-15T06:23', sunset: '2026-10-15T19:02', ...over });
const tipsFor = (kinds: StayKind[], weather: WeatherDay[] | null, placeKey = 'sossusvlei') => recommendForStation({ placeKey, placeLabel: 'Ort', stayKinds: kinds, weather });
const ids = (tips: { id: string }[]) => tips.map((t) => t.id);

describe('accommodation type', () => {
  it('reads the stored type first, then the name', () => {
    expect(accommodationKind({ name: 'X', notes: 'Art: Camping. Planpreis 62,42 €.' })).toBe('camping');
    expect(accommodationKind({ name: 'X', notes: 'Art: Zelt-Lodge. Hinweis: noch buchen.' })).toBe('tented');
    expect(accommodationKind({ name: 'Sasa Safari Camp', notes: 'Art: Lodge.' })).toBe('lodge');
    expect(accommodationKind({ name: 'Sossus Oasis Campsite' })).toBe('camping');
    expect(accommodationKind({ name: 'Hakusembe Tented Camp' })).toBe('tented');
    expect(accommodationKind({ name: 'Dream Beach Villa' })).toBe('lodge');
    expect(accommodationKind({ name: 'Irgendwo' })).toBe('unknown');
  });
});

describe('weather summary', () => {
  it('takes the extremes over the days and the daylight times of the first forecast day', () => {
    const s = summarizeWeather([day({ tmin: 9, tmax: 31 }), day({ date: '2026-10-16', tmin: 6, tmax: 36, uvMax: 9, rainChance: 20 })])!;
    expect(s).toMatchObject({ tmin: 6, tmax: 36, uvMax: 9, rainChance: 20, sunrise: '06:23', sunset: '19:02', isClimateOnly: false });
    expect(summarizeWeather([day({ source: 'climate', sunrise: null, sunset: null })])).toMatchObject({ isClimateOnly: true, sunrise: null });
    expect(summarizeWeather([])).toBeNull();
  });
});

describe('recommendations adapt to the accommodation type', () => {
  const cold = [day({ tmin: 4, tmax: 24 })];
  it('cold nights: sleeping bag for camping, extra blanket for a tented camp, warm clothing for a lodge', () => {
    const camping = tipsFor(['camping'], cold).find((t) => t.id === 'cold-night')!;
    const tented = tipsFor(['tented'], cold).find((t) => t.id === 'cold-night')!;
    const lodge = tipsFor(['lodge'], cold).find((t) => t.id === 'cold-night')!;
    expect(camping.text).toMatch(/Schlafsack/);
    expect(tented.text).toMatch(/Zusatzdecke/);
    expect(lodge.text).toMatch(/Fleece/);
    expect(lodge.text).not.toMatch(/Schlafsack/);
    expect(camping).toMatchObject({ tone: 'warn', basis: 'weather', reason: expect.stringContaining('4 °C') });
  });

  it('heat and UV: water, shade and sun protection, with extra advice only for camping', () => {
    const hot = [day({ tmax: 37, uvMax: 9.4 })];
    const camping = tipsFor(['camping'], hot);
    const lodge = tipsFor(['lodge'], hot);
    expect(ids(camping)).toEqual(expect.arrayContaining(['heat', 'uv']));
    expect(camping.find((t) => t.id === 'heat')!.text).toMatch(/Stellplatz mit Schatten/);
    expect(lodge.find((t) => t.id === 'heat')!.text).not.toMatch(/Stellplatz/);
    expect(ids(lodge)).toContain('lodge-heat');
    expect(ids(tipsFor(['camping'], [day({ tmax: 31 })]))).toContain('warm');
    expect(ids(tipsFor(['camping'], [day({ tmax: 26, uvMax: 5 })]))).not.toEqual(expect.arrayContaining(['heat', 'warm', 'uv']));
  });

  it('rain: warns from a 50 % forecast or 5 mm, and from 40 % for climate averages', () => {
    expect(ids(tipsFor(['camping'], [day({ rainChance: 60 })]))).toContain('rain');
    expect(tipsFor(['camping'], [day({ rainChance: 60 })]).find((t) => t.id === 'rain')!.text).toMatch(/Plane/);
    expect(ids(tipsFor(['lodge'], [day({ rainChance: 10, rainMm: 7 })]))).toContain('rain');
    expect(ids(tipsFor(['lodge'], [day({ rainChance: 30 })]))).not.toContain('rain');
    expect(ids(tipsFor(['lodge'], [day({ source: 'climate', rainChance: 45, sunrise: null, sunset: null })]))).toContain('rain');
    expect(tipsFor(['lodge'], [day({ source: 'climate', rainChance: 45, sunrise: null, sunset: null })]).find((t) => t.id === 'rain')!.reason).toMatch(/Durchschnitt/);
  });

  it('dry dust only in desert places, wind advice for tents, daylight times from the forecast', () => {
    expect(ids(tipsFor(['lodge'], [day()], 'sossusvlei'))).toContain('dust');
    expect(ids(tipsFor(['lodge'], [day()], 'chobe'))).not.toContain('dust');
    expect(tipsFor(['camping'], [day({ windMax: 45 })]).find((t) => t.id === 'wind')!.text).toMatch(/abspannen/);
    expect(tipsFor(['lodge'], [day({ windMax: 45 })]).find((t) => t.id === 'wind')!.text).not.toMatch(/abspannen/);
    expect(tipsFor([], [day()]).find((t) => t.id === 'daylight')!.reason).toBe('Wetter: Sonnenaufgang 06:23, Sonnenuntergang 19:02');
  });

  it('stay tips follow the type, and mention the sunset for pitching the tent', () => {
    const camping = tipsFor(['camping'], [day()]);
    expect(ids(camping)).toEqual(expect.arrayContaining(['camping-basics', 'camping-animals']));
    expect(camping.find((t) => t.id === 'camping-basics')!.text).toContain('19:02');
    expect(ids(tipsFor(['tented'], null, 'ort'))).toEqual(['tented-basics']);
    expect(ids(tipsFor(['lodge'], null, 'ort'))).toEqual(['lodge-basics']);
    expect(ids(tipsFor(['unknown'], null, 'unbekannt'))).toEqual([]);
  });
});

describe('recommendations without weather and by place', () => {
  it('keeps the accommodation and place tips when no weather is known', () => {
    const tips = tipsFor(['camping'], null, 'etosha');
    expect(ids(tips)).toEqual(expect.arrayContaining(['camping-basics', 'etosha-waterholes']));
    expect(tips.every((t) => t.basis !== 'weather')).toBe(true);
  });

  it('adds malaria advice only where it is customary to discuss it, as advice to check with a doctor', () => {
    for (const key of ['rundu', 'divundu', 'chobe', 'kasane', 'maun']) expect(ids(tipsFor([], null, key)), key).toContain('malaria');
    expect(ids(tipsFor([], null, 'sossusvlei'))).not.toContain('malaria');
    expect(tipsFor([], null, 'chobe').find((t) => t.id === 'malaria')!.text).toMatch(/Ärztin, Arzt oder Tropeninstitut/);
  });

  it('gives every tip a reason, a basis and a unique id, with warnings first', () => {
    const tips = tipsFor(['camping', 'lodge'], [day({ tmin: 3, tmax: 37, uvMax: 10, rainChance: 70, windMax: 50 })], 'divundu');
    expect(new Set(ids(tips)).size).toBe(tips.length);
    for (const tip of tips) {
      expect(tip.reason.length).toBeGreaterThan(5);
      expect(['weather', 'stay', 'place']).toContain(tip.basis);
    }
    const firstInfo = tips.findIndex((t) => t.tone === 'info');
    expect(tips.slice(0, firstInfo).every((t) => t.tone === 'warn')).toBe(true);
    expect(tips.slice(firstInfo).every((t) => t.tone === 'info')).toBe(true);
  });
});
