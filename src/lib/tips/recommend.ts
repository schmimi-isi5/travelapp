/**
 * Rule-based recommendations for a station, derived from three facts the app really has: the weather of the station's days,
 * the type of the booked accommodation and the place. No model is involved and nothing is invented: every tip names its
 * reason (the fact that triggered it) and is general advice that has to be checked on site. Available offline.
 */
import type { WeatherDay } from '@/lib/weather/types';

export type StayKind = 'camping' | 'lodge' | 'tented' | 'unknown';
export type TipCategory = 'Wetter & Kleidung' | 'Hitze & Wasser' | 'Schlafen & Unterkunft' | 'Unterwegs' | 'Tiere & Sicherheit' | 'Gesundheit';

export interface Tip {
  id: string;
  category: TipCategory;
  title: string;
  text: string;
  /** The fact behind the tip, shown to the reader ("Wetter: nachts bis 4 °C"). */
  reason: string;
  basis: 'weather' | 'stay' | 'place';
  tone: 'info' | 'warn';
}

/** Camping, lodge or tented camp: from the stored type ("Art: Camping."), else from the name. */
export function accommodationKind(stay: { name: string; notes?: string | null }): StayKind {
  const declared = /Art:\s*([^.]+)\./i.exec(stay.notes ?? '')?.[1]?.trim().toLowerCase();
  if (declared) {
    if (/zelt|tent/.test(declared)) return 'tented';
    if (/camp/.test(declared)) return 'camping';
    if (/lodge|hotel|villa|guest/.test(declared)) return 'lodge';
  }
  if (/tented/i.test(stay.name)) return 'tented';
  if (/camp(site|ing)|campingplatz/i.test(stay.name)) return 'camping';
  if (/lodge|villa|guest ?house|hotel|resort/i.test(stay.name)) return 'lodge';
  return 'unknown';
}

export interface WeatherSummary {
  tmin: number | null;
  tmax: number | null;
  rainMm: number | null;
  rainChance: number | null;
  windMax: number | null;
  uvMax: number | null;
  sunrise: string | null;
  sunset: string | null;
  isClimateOnly: boolean;
}

const maxOf = (values: (number | null)[]) => (values.filter((v): v is number => v !== null).sort((a, b) => b - a)[0] ?? null);
const minOf = (values: (number | null)[]) => (values.filter((v): v is number => v !== null).sort((a, b) => a - b)[0] ?? null);

export function summarizeWeather(days: readonly WeatherDay[]): WeatherSummary | null {
  if (days.length === 0) return null;
  const forecast = days.find((d) => d.source === 'forecast' && d.sunrise && d.sunset);
  return {
    tmin: minOf(days.map((d) => d.tmin)),
    tmax: maxOf(days.map((d) => d.tmax)),
    rainMm: maxOf(days.map((d) => d.rainMm)),
    rainChance: maxOf(days.map((d) => d.rainChance)),
    windMax: maxOf(days.map((d) => d.windMax)),
    uvMax: maxOf(days.map((d) => d.uvMax)),
    sunrise: forecast?.sunrise?.slice(11, 16) ?? null,
    sunset: forecast?.sunset?.slice(11, 16) ?? null,
    isClimateOnly: days.every((d) => d.source === 'climate'),
  };
}

const KIND_LABEL: Record<StayKind, string> = { camping: 'Camping', lodge: 'Lodge', tented: 'Zelt-Lodge', unknown: 'Unterkunft' };
const deg = (value: number) => `${Math.round(value)} °C`;
const basisNote = (w: WeatherSummary) => (w.isClimateOnly ? ' (Durchschnitt der letzten Jahre)' : '');

function weatherTips(w: WeatherSummary, kinds: readonly StayKind[], placeKey: string): Tip[] {
  const tips: Tip[] = [];
  const camping = kinds.includes('camping');
  const tented = kinds.includes('tented');
  const lodge = kinds.includes('lodge');
  const add = (tip: Omit<Tip, 'basis'>) => tips.push({ ...tip, basis: 'weather' });

  if (w.tmin !== null && w.tmin <= 5) {
    add({
      id: 'cold-night', category: 'Wetter & Kleidung', tone: 'warn', title: 'Kalte Nächte', reason: `Wetter: nachts bis ${deg(w.tmin)}${basisNote(w)}`,
      text: camping
        ? 'Schlafsack mit Komfortbereich bis etwa 0 °C, Isomatte, Mütze und warme Socken einpacken; Kinder am besten in Schichten schlafen lassen.'
        : tented
          ? 'Im Zelt wird es nachts kalt: nach Zusatzdecke oder Wärmflasche fragen, Mütze und Socken bereithalten.'
          : 'Für kalte Nächte und frühe Pirschfahrten im offenen Fahrzeug: Fleece, warme Jacke, Mütze und Handschuhe einpacken.',
    });
  } else if (w.tmin !== null && w.tmin <= 12) {
    add({ id: 'cool-morning', category: 'Wetter & Kleidung', tone: 'info', title: 'Kühle Morgen und Abende', reason: `Wetter: morgens ab ${deg(w.tmin)}${basisNote(w)}`, text: 'Zwiebelprinzip: Fleece oder Pullover für den Morgen und den Abend, tagsüber leichte Kleidung.' });
  }
  if (w.tmax !== null && w.tmin !== null && w.tmax - w.tmin >= 20) {
    add({ id: 'temperature-range', category: 'Wetter & Kleidung', tone: 'info', title: 'Große Temperaturunterschiede', reason: `Wetter: ${deg(w.tmin)} bis ${deg(w.tmax)}`, text: 'Tagsüber heiß, nachts und morgens deutlich kühler: Kleidung in Schichten griffbereit halten, nicht tief im Gepäck.' });
  }
  if (w.tmax !== null && w.tmax >= 35) {
    add({
      id: 'heat', category: 'Hitze & Wasser', tone: 'warn', title: 'Große Hitze', reason: `Wetter: bis ${deg(w.tmax)}${basisNote(w)}`,
      text: `Reichlich Wasser mitnehmen (für Erwachsene mindestens 3 bis 4 Liter am Tag, Kinder nach Alter), Mittagspause im Schatten oder am Pool, Wanderungen und Pirschfahrten früh am Morgen und am späten Nachmittag. Niemanden im geparkten Fahrzeug lassen.${camping ? ' Auf dem Campingplatz einen Stellplatz mit Schatten wählen, Kühlbox mit Eis, Wasserreserve.' : ''}`,
    });
  } else if (w.tmax !== null && w.tmax >= 30) {
    add({ id: 'warm', category: 'Hitze & Wasser', tone: 'info', title: 'Warm bis heiß', reason: `Wetter: bis ${deg(w.tmax)}${basisNote(w)}`, text: 'Hut, Sonnenschutz und genug Trinkwasser im Fahrzeug; auf Pisten fern von Orten immer Wasserreserve dabeihaben.' });
  }
  if (w.uvMax !== null && w.uvMax >= 8) {
    add({ id: 'uv', category: 'Hitze & Wasser', tone: 'warn', title: 'Sehr hohe UV-Strahlung', reason: `Wetter: UV-Index bis ${w.uvMax.toFixed(0)}`, text: 'Sonnencreme mit Lichtschutzfaktor 50, alle zwei Stunden nachcremen, Hut mit Nackenschutz, Sonnenbrille; Kinder zusätzlich mit langer, leichter Kleidung schützen.' });
  }
  const rainy = (w.rainMm !== null && w.rainMm >= 5) || (w.rainChance !== null && w.rainChance >= (w.isClimateOnly ? 40 : 50));
  if (rainy) {
    add({
      id: 'rain', category: 'Wetter & Kleidung', tone: 'warn', title: 'Regen möglich', reason: `Wetter: Regenrisiko ${w.rainChance !== null ? `${Math.round(w.rainChance)} %` : `${w.rainMm} mm`}${basisNote(w)}`,
      text: `Schotter- und Sandpisten werden rutschig und die Fahrt dauert länger: Zeitpuffer einplanen, ausgetrocknete Flussbetten nicht befahren, Elektronik wasserdicht verpacken, Regenjacken griffbereit.${camping ? ' Zelt abdichten oder eine Plane mitnehmen, Gepäck nicht auf dem Zeltboden stehen lassen.' : ''}`,
    });
  } else if (w.tmax !== null && w.rainMm !== null && w.rainMm < 1 && /^(sossusvlei|erongo|etosha|swakopmund)$/.test(placeKey)) {
    add({ id: 'dust', category: 'Wetter & Kleidung', tone: 'info', title: 'Trocken und staubig', reason: `Wetter: kein Regen erwartet${basisNote(w)}`, text: 'Staub schadet Kameras und Handys: Objektive und Geräte in Beuteln verstauen; Lippenpflege, Augentropfen und ein Tuch gegen Staub sind nützlich.' });
  }
  if (w.windMax !== null && w.windMax >= 35) {
    add({ id: 'wind', category: 'Wetter & Kleidung', tone: 'info', title: 'Kräftiger Wind', reason: `Wetter: Wind bis ${Math.round(w.windMax)} km/h`, text: `Sand und Staub in der Luft, am Meer wirkt es kühler.${camping || tented ? ' Zelt gut abspannen und Gepäck nicht offen herumliegen lassen.' : ''}` });
  }
  if (w.sunrise && w.sunset) {
    add({ id: 'daylight', category: 'Unterwegs', tone: 'info', title: 'Tageslicht einplanen', reason: `Wetter: Sonnenaufgang ${w.sunrise}, Sonnenuntergang ${w.sunset}`, text: 'Parks und viele Camps haben Torzeiten rund um Sonnenaufgang und Sonnenuntergang (aktuelle Zeiten vor Ort prüfen). Nach Einbruch der Dunkelheit nicht mehr fahren: Wildwechsel und schlechte Sicht sind gefährlich.' });
  }
  if (lodge && w.tmax !== null && w.tmax >= 33) {
    add({ id: 'lodge-heat', category: 'Hitze & Wasser', tone: 'info', title: 'Pool und Schatten nutzen', reason: `Wetter: bis ${deg(w.tmax)} · Unterkunft: Lodge`, text: 'Aktivitäten der Lodge (Pirschfahrt, Bootstour) möglichst früh oder abends legen; mittags bieten Pool und Schatten Erholung.' });
  }
  return tips;
}

function stayTips(kinds: readonly StayKind[], w: WeatherSummary | null): Tip[] {
  const tips: Tip[] = [];
  const add = (tip: Omit<Tip, 'basis'>) => tips.push({ ...tip, basis: 'stay' });
  const known = [...new Set(kinds)].filter((k) => k !== 'unknown');
  if (known.includes('camping')) {
    add({ id: 'camping-basics', category: 'Schlafen & Unterkunft', tone: 'info', title: 'Camping vorbereiten', reason: `Unterkunft: ${KIND_LABEL.camping}`, text: `Wasser nachfüllen, Stirnlampen und Kocher griffbereit, Zelt vor Einbruch der Dunkelheit aufbauen${w?.sunset ? ` (Sonnenuntergang gegen ${w.sunset})` : ''}. Vor Ort klären, ob Strom und Warmwasser vorhanden sind.` });
    add({ id: 'camping-animals', category: 'Tiere & Sicherheit', tone: 'warn', title: 'Nachts auf Tiere achten', reason: `Unterkunft: ${KIND_LABEL.camping}`, text: 'Lebensmittel und Müll nachts im Fahrzeug einschließen, nichts im Freien liegen lassen; bei Geräuschen im Dunkeln im Zelt oder Fahrzeug bleiben und nicht mit der Taschenlampe nachsehen gehen.' });
  }
  if (known.includes('tented')) {
    add({ id: 'tented-basics', category: 'Schlafen & Unterkunft', tone: 'info', title: 'Zelt-Lodge', reason: `Unterkunft: ${KIND_LABEL.tented}`, text: 'Reißverschlüsse immer schließen (Insekten, Skorpione), Taschenlampe bereithalten, Schuhe morgens ausschütteln, Wertsachen nicht offen im Zelt liegen lassen.' });
  }
  if (known.includes('lodge')) {
    add({ id: 'lodge-basics', category: 'Schlafen & Unterkunft', tone: 'info', title: 'Lodge: Angebote früh buchen', reason: `Unterkunft: ${KIND_LABEL.lodge}`, text: 'Pirschfahrten, Bootstouren und Abendessen möglichst bei der Ankunft anfragen und buchen; für Trinkgeld etwas Bargeld in kleinen Scheinen bereithalten.' });
  }
  return tips;
}

const MALARIA = /^(rundu|divundu|chobe|kasane|maun)$/;

/**
 * What families typically see around a place (general knowledge, not a forecast and no promise). Keys are place keys; the lists
 * feed the "Typisch hier" tip and the quick picks in the sighting form.
 */
const TYPICAL_WILDLIFE: Record<string, { species: string[]; hint: string }> = {
  etosha: { species: ['Elefant', 'Löwe', 'Giraffe', 'Zebra', 'Oryx', 'Springbock', 'Spitzmaulnashorn'], hint: 'Die Chancen sind an den Wasserlöchern am Morgen und späten Nachmittag am besten.' },
  chobe: { species: ['Elefant', 'Flusspferd', 'Krokodil', 'Büffel', 'Kudu', 'Fischadler'], hint: 'Bootsfahrten auf dem Fluss zeigen große Elefantenherden am Ufer.' },
  kasane: { species: ['Elefant', 'Flusspferd', 'Krokodil', 'Büffel', 'Kudu', 'Fischadler'], hint: 'Bootsfahrten auf dem Fluss zeigen große Elefantenherden am Ufer.' },
  divundu: { species: ['Flusspferd', 'Krokodil', 'Elefant', 'Eisvogel', 'Bienenfresser'], hint: 'Am Okavango und im Bwabwata-Gebiet; Elefanten ziehen oft an den Fluss.' },
  maun: { species: ['Elefant', 'Flusspferd', 'Letschwe', 'Fischadler', 'Löwe'], hint: 'Im Okavango-Delta sind Boots- und Mokoro-Ausflüge üblich.' },
  nata: { species: ['Zebra', 'Springbock', 'Pelikan', 'Flamingo'], hint: 'Flamingos und Pelikane kommen nur, wenn die Pfanne nach der Regenzeit Wasser hat.' },
  sossusvlei: { species: ['Oryx', 'Springbock', 'Strauß', 'Schakal'], hint: 'Tiere sind in der Dünenlandschaft eher selten und früh am Morgen aktiv.' },
  swakopmund: { species: ['Zwergflamingo', 'Pelikan', 'Robbe', 'Delfin'], hint: 'Flamingos und Pelikane an der Lagune von Walvis Bay; Robben bei Cape Cross (etwa 120 km nördlich).' },
  erongo: { species: ['Klippschliefer', 'Pavian', 'Kudu'], hint: 'Klippschliefer sitzen in den Granitfelsen; Leoparden gibt es, sie sind aber sehr scheu.' },
  rundu: { species: ['Flusspferd', 'Krokodil', 'Eisvogel'], hint: 'Vögel und Flusstiere am Okavango, besonders morgens und abends.' },
};

/** Species names typically seen near a place, for quick picks; empty for unknown places. */
export function typicalWildlife(placeKey: string): string[] {
  return TYPICAL_WILDLIFE[placeKey]?.species ?? [];
}

function placeTips(placeKey: string, label: string): Tip[] {
  const tips: Tip[] = [];
  const add = (tip: Omit<Tip, 'basis' | 'reason'>) => tips.push({ ...tip, basis: 'place', reason: `Ort: ${label}` });
  switch (placeKey) {
    case 'windhoek':
      add({ id: 'windhoek-car', category: 'Unterwegs', tone: 'info', title: 'Mietwagen übernehmen', text: 'Bei der Übergabe Reserverad, Wagenheber, Wasser und vorhandene Schäden prüfen und fotografieren. Es gilt Linksverkehr.' });
      break;
    case 'sossusvlei':
      add({ id: 'sossusvlei-early', category: 'Unterwegs', tone: 'info', title: 'Früh in die Dünen', text: 'Düne und Deadvlei am besten zum Sonnenaufgang und vor der Mittagshitze besuchen; im weichen Sand ist Gehen anstrengend, feste Schuhe und Wasser mitnehmen.' });
      break;
    case 'swakopmund':
      add({ id: 'swakopmund-coast', category: 'Wetter & Kleidung', tone: 'info', title: 'Küstenklima', text: 'Nebel und eine frische Brise sind am Atlantik auch im Sommer üblich: eine Jacke einpacken. Der Ozean ist kalt und hat Strömungen: Baden nur mit Vorsicht und an bewachten Stellen.' });
      break;
    case 'erongo':
      add({ id: 'erongo-rocks', category: 'Tiere & Sicherheit', tone: 'info', title: 'Felsen und Buschwanderung', text: 'Feste Schuhe tragen, nicht in Felsspalten greifen (Schlangen, Skorpione) und Wasser mitnehmen.' });
      break;
    case 'etosha':
      add({ id: 'etosha-waterholes', category: 'Unterwegs', tone: 'info', title: 'Wasserlöcher zur richtigen Zeit', text: 'Am frühen Morgen und späten Nachmittag sind die meisten Tiere an den Wasserlöchern. Im Fahrzeug bleiben, Abstand zu Elefanten halten und nichts füttern; Torzeiten der Camps beachten.' });
      break;
    case 'nata':
      add({ id: 'nata-sanctuary', category: 'Unterwegs', tone: 'info', title: 'Vogelschutzgebiet', text: 'Fernglas, Sonnenschutz und Wasser mitnehmen. In Botswana wird häufig in Pula bezahlt: Bargeld und Kartenzahlung vorab klären.' });
      break;
    case 'divundu':
      add({ id: 'divundu-river', category: 'Tiere & Sicherheit', tone: 'warn', title: 'Flusspferde und Krokodile', text: 'Am Fluss Abstand zum Ufer halten, nicht im Wasser baden und nach Einbruch der Dunkelheit nicht am Ufer laufen.' });
      break;
    case 'kasane':
      add({ id: 'kasane-border', category: 'Unterwegs', tone: 'warn', title: 'Ausflug nach Victoria Falls', text: 'Für Ausflüge über die Grenze Pässe mitnehmen und Einreise- und Visabestimmungen sowie Gebühren vorab bei offiziellen Stellen klären.' });
      break;
    case 'maun':
      add({ id: 'maun-sand', category: 'Unterwegs', tone: 'info', title: 'Sandpisten', text: 'Sandpisten nur mit geeignetem Fahrzeug und langsam befahren, ausreichend Wasser und Treibstoff mitnehmen.' });
      break;
    default:
      break;
  }
  const wildlife = TYPICAL_WILDLIFE[placeKey];
  if (wildlife) {
    add({ id: `wildlife-${placeKey}`, category: 'Tiere & Sicherheit', tone: 'info', title: 'Typisch hier', text: `${wildlife.species.join(', ')}. ${wildlife.hint} Erfahrungswerte, keine Garantie.` });
  }
  if (MALARIA.test(placeKey)) {
    add({ id: 'malaria', category: 'Gesundheit', tone: 'warn', title: 'Malaria-Schutz klären', text: 'Diese Gegend gehört zu einem Gebiet, für das Malariaschutz üblicherweise besprochen wird. Prophylaxe vorab mit Ärztin, Arzt oder Tropeninstitut klären; abends lange Kleidung und Mückenschutz.' });
  }
  return tips;
}

export interface RecommendInput {
  placeKey: string;
  placeLabel: string;
  stayKinds: readonly StayKind[];
  weather: readonly WeatherDay[] | null;
}

/** Tips for a station, warnings first. Without weather data only the accommodation- and place-based tips remain. */
export function recommendForStation(input: RecommendInput): Tip[] {
  const summary = input.weather ? summarizeWeather(input.weather) : null;
  const all = [...(summary ? weatherTips(summary, input.stayKinds, input.placeKey) : []), ...stayTips(input.stayKinds, summary), ...placeTips(input.placeKey, input.placeLabel)];
  return all.sort((a, b) => Number(b.tone === 'warn') - Number(a.tone === 'warn'));
}
