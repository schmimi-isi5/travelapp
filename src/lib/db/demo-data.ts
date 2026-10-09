import { estimateRoute } from '../domain/geo';
import { ENTITY_SCHEMAS, type EntityName } from '../domain/schemas';

/**
 * Fictional demo content (see supabase/seed/demo.json). Nothing here is a confirmed booking, payment or
 * opening time. Every row is marked `is_demo` with `source_type: 'demo'`.
 */

const AT = '2026-10-01T08:00:00.000Z';
export const DEMO_FAMILY_ID = 'demo-family';
export const DEMO_TRIP_ID = 'demo-trip';

export const DEMO_USERS = {
  ownerA: 'demo-user-a',
  adultB: 'demo-user-b',
  memberTeen: 'demo-user-kind-a',
  childB: 'demo-user-kind-b',
  childC: 'demo-user-kind-c',
} as const;

const base = { version: 1, created_at: AT, updated_at: AT, created_by: DEMO_USERS.ownerA, is_demo: true, source_type: 'demo' as const };

const STOPS = [
  { key: 'windhoek', title: 'Windhoek', country: 'Namibia', latitude: -22.5609, longitude: 17.0658, arrive_at: '2026-10-13', depart_at: '2026-10-15', summary: 'Ankunft, Mietwagenübernahme und erste Einkäufe. Beispielstation.', highlights: ['Independence Memorial Museum', 'Craft Centre'] },
  { key: 'sossusvlei', title: 'Sossusvlei', country: 'Namibia', latitude: -24.7333, longitude: 15.3, arrive_at: '2026-10-15', depart_at: '2026-10-18', summary: 'Dünen und Salzpfannen der Namib. Beispielstation.', highlights: ['Düne 45', 'Deadvlei'] },
  { key: 'swakopmund', title: 'Swakopmund', country: 'Namibia', latitude: -22.6784, longitude: 14.5258, arrive_at: '2026-10-18', depart_at: '2026-10-20', summary: 'Küstenstadt am Atlantik. Beispielstation.', highlights: ['Strandpromenade', 'Walvis Bay Lagune'] },
  { key: 'etosha', title: 'Etosha Nationalpark', country: 'Namibia', latitude: -18.855, longitude: 16.3293, arrive_at: '2026-10-20', depart_at: '2026-10-24', summary: 'Wasserlöcher und Tierbeobachtung. Beispielstation.', highlights: ['Okaukuejo Wasserloch', 'Halali'] },
  { key: 'chobe', title: 'Kasane / Chobe', country: 'Botswana', latitude: -17.8016, longitude: 25.1536, arrive_at: '2026-10-24', depart_at: '2026-10-27', summary: 'Chobe-Fluss und Elefanten. Grenzübertritt vorher prüfen. Beispielstation.', highlights: ['Bootssafari Chobe'] },
  { key: 'maun', title: 'Maun / Okavango', country: 'Botswana', latitude: -19.9833, longitude: 23.4167, arrive_at: '2026-10-27', depart_at: '2026-10-30', summary: 'Tor zum Okavango-Delta. Beispielstation.', highlights: ['Mokoro-Fahrt'] },
] as const;

export const stopId = (key: string) => `demo-stop-${key}`;

function stopRows() {
  return STOPS.map((s, index) => ({
    ...base,
    id: stopId(s.key),
    trip_id: DEMO_TRIP_ID,
    title: s.title,
    country: s.country,
    latitude: s.latitude,
    longitude: s.longitude,
    arrive_at: s.arrive_at,
    depart_at: s.depart_at,
    sequence: index + 1,
    summary: s.summary,
    highlights: [...s.highlights],
    verified_at: null,
    source_reference: 'Demo-Beispiel, nicht verifiziert',
  }));
}

function routeRows() {
  return STOPS.slice(0, -1).map((from, index) => {
    const to = STOPS[index + 1]!;
    const estimate = estimateRoute(from, to);
    return {
      ...base,
      id: `demo-route-${from.key}-${to.key}`,
      trip_id: DEMO_TRIP_ID,
      from_stop_id: stopId(from.key),
      to_stop_id: stopId(to.key),
      distance_km: estimate?.distance_km ?? null,
      duration_minutes: estimate?.duration_minutes ?? null,
      duration_source: 'offline_estimate' as const,
    };
  });
}

const stays = [
  { id: 'demo-stay-etosha', stop: 'etosha', name: 'Demo-Lodge Etosha', check_in: '2026-10-20', check_out: '2026-10-24', quote_status: 'none', price_minor: null, currency: null, notes: 'Angebot und Buchungsbestätigung prüfen.' },
  { id: 'demo-stay-chobe', stop: 'chobe', name: 'Demo-Unterkunft Chobe', check_in: '2026-10-24', check_out: '2026-10-27', quote_status: 'none', price_minor: null, currency: null, notes: 'Check-in prüfen.' },
  { id: 'demo-stay-swakop', stop: 'swakopmund', name: 'Demo-Beispiel: Gästehaus Swakopmund', check_in: '2026-10-18', check_out: '2026-10-20', quote_status: 'confirmed', price_minor: 2_400_000, currency: 'NAD', notes: 'Fiktives Beispiel mit erfundenen Beträgen, um Teilzahlungen zu zeigen.' },
] as const;

export function buildDemoData(): Partial<Record<EntityName, Record<string, unknown>[]>> {
  const u = DEMO_USERS;
  const data: Partial<Record<EntityName, Record<string, unknown>[]>> = {
    family: [{ ...base, id: DEMO_FAMILY_ID, name: 'Demo-Familie', owner_user_id: u.ownerA }],
    members: [
      { ...base, id: u.ownerA, family_id: DEMO_FAMILY_ID, display_name: 'Demo-Erwachsene A', role: 'owner', status: 'active', avatar_color: '#0F3D4E' },
      { ...base, id: u.adultB, family_id: DEMO_FAMILY_ID, display_name: 'Demo-Erwachsene B', role: 'adult', status: 'active', avatar_color: '#A8472B' },
      { ...base, id: u.memberTeen, family_id: DEMO_FAMILY_ID, display_name: 'Demo-Kind A', role: 'member', status: 'active', avatar_color: '#5B6B3A' },
      { ...base, id: u.childB, family_id: DEMO_FAMILY_ID, display_name: 'Demo-Kind B', role: 'child', status: 'active', avatar_color: '#D4A373' },
      { ...base, id: u.childC, family_id: DEMO_FAMILY_ID, display_name: 'Demo-Kind C', role: 'child', status: 'active', avatar_color: '#334155' },
    ],
    trips: [{ ...base, id: DEMO_TRIP_ID, family_id: DEMO_FAMILY_ID, title: 'Namibia & Botswana – Familienabenteuer', start_date: '2026-10-13', end_date: null, countries: ['Namibia', 'Botswana'] }],
    trip_stops: stopRows(),
    routes: routeRows(),
    stays: stays.map((s) => ({
      ...base,
      id: s.id,
      trip_id: DEMO_TRIP_ID,
      stop_id: stopId(s.stop),
      name: s.name,
      address: null,
      check_in: s.check_in,
      check_out: s.check_out,
      booking_status: s.quote_status === 'confirmed' ? 'confirmed' : 'unknown',
      quote_status: s.quote_status,
      price_minor: s.price_minor,
      currency: s.currency,
      booking_ref: null,
      due_at: null,
      contact: null,
      notes: s.notes,
      verified_at: null,
      source_reference: null,
    })),
    payments: [
      { ...base, id: 'demo-pay-1', family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-swakop', booking_id: null, amount_minor: 800_000, currency: 'NAD', paid_at: '2026-09-20T10:00:00.000Z', verification_status: 'verified', source_document_id: null, notes: 'Fiktive Anzahlung', sync_state: 'synced' },
      { ...base, id: 'demo-pay-2', family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-swakop', booking_id: null, amount_minor: 400_000, currency: 'NAD', paid_at: '2026-10-02T10:00:00.000Z', verification_status: 'unverified', source_document_id: null, notes: 'Fiktive zweite Zahlung, Beleg fehlt', sync_state: 'synced' },
    ],
    bookings: [
      { ...base, id: 'demo-booking-flight', trip_id: DEMO_TRIP_ID, stop_id: stopId('windhoek'), stay_id: null, kind: 'flight', title: 'Hinflug nach Windhoek', booking_status: 'unknown', starts_at: '2026-10-13', deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: 'Abflug laut Planung am 13.10.2026. Buchungsbeleg ergänzen.', verified_at: null, source_reference: null },
      { ...base, id: 'demo-booking-car', trip_id: DEMO_TRIP_ID, stop_id: stopId('windhoek'), stay_id: null, kind: 'car', title: 'Mietwagen 4x4', booking_status: 'unknown', starts_at: '2026-10-13', deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: 'Angebot ist keine Buchung. Bestätigung einholen.', verified_at: null, source_reference: null },
      { ...base, id: 'demo-booking-drive', trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), stay_id: null, kind: 'activity', title: 'Geführte Pirschfahrt', booking_status: 'unknown', starts_at: null, deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: null, verified_at: null, source_reference: null },
      { ...base, id: 'demo-booking-chobe', trip_id: DEMO_TRIP_ID, stop_id: stopId('chobe'), stay_id: null, kind: 'park', title: 'Chobe Parkgebühren', booking_status: 'unknown', starts_at: null, deadline_at: null, reminder_at: null, amount_minor: null, currency: null, reference: null, provider: null, contact: null, notes: 'Aktuelle Gebühren vor Ort prüfen.', verified_at: null, source_reference: null },
    ],
    action_items: [
      { ...base, id: 'demo-action-1', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: null, stay_id: 'demo-stay-etosha', booking_id: null, title: 'Buchungsbestätigung Lodge prüfen', status: 'open', owner_user_id: u.ownerA, due_at: '2026-10-11', priority: 'high' },
      { ...base, id: 'demo-action-2', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: null, stay_id: 'demo-stay-etosha', booking_id: null, title: 'Zahlungsbeleg hinzufügen', status: 'open', owner_user_id: u.adultB, due_at: null, priority: 'normal' },
      { ...base, id: 'demo-action-3', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: null, stay_id: 'demo-stay-chobe', booking_id: null, title: 'Check-in-Zeit klären', status: 'open', owner_user_id: null, due_at: null, priority: 'normal' },
      { ...base, id: 'demo-action-4', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('windhoek'), stay_id: null, booking_id: 'demo-booking-car', title: 'Mietwagen-Bestätigung einholen', status: 'open', owner_user_id: u.ownerA, due_at: '2026-10-12', priority: 'high' },
      { ...base, id: 'demo-action-5', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('windhoek'), stay_id: null, booking_id: null, title: 'Reisepässe auf Gültigkeit prüfen', status: 'done', owner_user_id: u.adultB, due_at: null, priority: 'normal' },
      { ...base, id: 'demo-action-6', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), stay_id: null, booking_id: null, title: 'Fernglas und Tierbestimmungsbuch einpacken', status: 'open', owner_user_id: u.memberTeen, due_at: null, priority: 'low' },
    ],
    wildlife_species: ['Elefant|Loxodonta africana', 'Giraffe|Giraffa camelopardalis', 'Löwe|Panthera leo', 'Zebra|Equus quagga', 'Springbock|Antidorcas marsupialis', 'Flusspferd|Hippopotamus amphibius', 'Büffel|Syncerus caffer', 'Leopard|Panthera pardus'].map((entry, index) => {
      const [de, sci] = entry.split('|');
      return { ...base, id: `demo-species-${index + 1}`, common_name_de: de, scientific_name: sci };
    }),
    wildlife_sightings: [
      { ...base, id: 'demo-sighting-1', trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), species_id: 'demo-species-1', seen_at: '2026-10-21T17:40:00.000Z', recorded_by: u.memberTeen, count: 4, notes: 'Demo-Eintrag: Herde am Wasserloch.', media_id: null },
      { ...base, id: 'demo-sighting-2', trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), species_id: 'demo-species-2', seen_at: '2026-10-22T08:15:00.000Z', recorded_by: u.childB, count: 2, notes: 'Demo-Eintrag.', media_id: null },
    ],
    journal_entries: [
      { ...base, id: 'demo-journal-1', trip_id: DEMO_TRIP_ID, stop_id: stopId('sossusvlei'), author_user_id: u.adultB, entry_date: '2026-10-16', title: 'Sonnenaufgang auf der Düne (Demo)', body: 'Beispieleintrag: Früh aufgestanden, die Kinder sind barfuß den Dünenkamm hochgelaufen. Alle Inhalte sind erfunden und dienen nur der Darstellung.', visibility: 'family', status: 'published', location: null, summary: null },
      { ...base, id: 'demo-journal-2', trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), author_user_id: u.memberTeen, entry_date: '2026-10-21', title: 'Elefanten am Wasserloch (Demo)', body: 'Beispieleintrag: Abends vier Elefanten beim Trinken beobachtet. Fiktive Geschichte für die Demo.', visibility: 'family', status: 'published', location: null, summary: null },
    ],
    media_assets: [
      { ...base, id: 'demo-media-1', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('sossusvlei'), journal_entry_id: 'demo-journal-1', uploaded_by: u.adultB, kind: 'photo', storage_path: 'scene:dunes', original_name: 'dunen-illustration.svg', captured_at: '2026-10-16T05:50:00.000Z', mime_type: 'image/svg+xml', size_bytes: 0, caption: 'Illustration: Dünen im Morgenlicht (Demo)', visibility: 'family', album: 'Namib', is_favorite: true, upload_state: 'uploaded' },
      { ...base, id: 'demo-media-2', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('etosha'), journal_entry_id: 'demo-journal-2', uploaded_by: u.memberTeen, kind: 'photo', storage_path: 'scene:waterhole', original_name: 'wasserloch-illustration.svg', captured_at: '2026-10-21T17:30:00.000Z', mime_type: 'image/svg+xml', size_bytes: 0, caption: 'Illustration: Wasserloch bei Sonnenuntergang (Demo)', visibility: 'family', album: 'Etosha', is_favorite: false, upload_state: 'uploaded' },
      { ...base, id: 'demo-media-3', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('swakopmund'), journal_entry_id: null, uploaded_by: u.ownerA, kind: 'photo', storage_path: 'scene:coast', original_name: 'kueste-illustration.svg', captured_at: '2026-10-19T16:00:00.000Z', mime_type: 'image/svg+xml', size_bytes: 0, caption: 'Illustration: Atlantikküste (Demo)', visibility: 'family', album: 'Küste', is_favorite: false, upload_state: 'uploaded' },
      { ...base, id: 'demo-media-4', family_id: DEMO_FAMILY_ID, trip_id: DEMO_TRIP_ID, stop_id: stopId('chobe'), journal_entry_id: null, uploaded_by: u.ownerA, kind: 'photo', storage_path: 'scene:river', original_name: 'fluss-illustration.svg', captured_at: '2026-10-25T09:00:00.000Z', mime_type: 'image/svg+xml', size_bytes: 0, caption: 'Illustration: Fluss in der Morgendämmerung (Demo)', visibility: 'family', album: 'Chobe', is_favorite: false, upload_state: 'uploaded' },
    ],
    expenses: [
      { ...base, id: 'demo-exp-1', trip_id: DEMO_TRIP_ID, category: 'transport', description: 'Tanken (Demo)', amount_minor: 85_000, currency: 'NAD', spent_at: '2026-10-14', booking_id: null, payment_id: null, entered_by: u.ownerA },
      { ...base, id: 'demo-exp-2', trip_id: DEMO_TRIP_ID, category: 'verpflegung', description: 'Markteinkauf (Demo)', amount_minor: 32_000, currency: 'BWP', spent_at: '2026-10-25', booking_id: null, payment_id: null, entered_by: u.adultB },
      { ...base, id: 'demo-exp-3', trip_id: DEMO_TRIP_ID, category: 'sonstiges', description: 'Reiseapotheke (Demo)', amount_minor: 4_590, currency: 'EUR', spent_at: '2026-10-05', booking_id: null, payment_id: null, entered_by: u.ownerA },
    ],
    travel_tips: [
      { ...base, id: 'demo-tip-1', stop_id: stopId('etosha'), title: 'Tierbeobachtung an Wasserlöchern', body: 'Beispielhinweis: Früh morgens und am späten Nachmittag sind Wasserlöcher oft belebt. Aktuelle Regeln und Öffnungszeiten vor Ort prüfen.', category: 'wildlife', warning_level: 'info', verified_at: null, source_reference: null, source_type: 'demo' },
      { ...base, id: 'demo-tip-2', stop_id: stopId('sossusvlei'), title: 'Früh starten', body: 'Beispielhinweis: Dünen sind am Morgen kühler. Öffnungszeiten des Parks sind nicht verifiziert; vor Ort erfragen.', category: 'sight', warning_level: 'caution', verified_at: null, source_reference: null, source_type: 'demo' },
      { ...base, id: 'demo-tip-3', stop_id: stopId('chobe'), title: 'Grenzübertritt vorbereiten', body: 'Einreisebestimmungen, Mietwagen-Grenzpapiere und Öffnungszeiten der Grenzübergänge sind nicht in der App verifiziert. Offizielle Stellen vor Abreise prüfen.', category: 'border', warning_level: 'warning', verified_at: null, source_reference: 'https://www.auswaertiges-amt.de', source_type: 'editorial' },
      { ...base, id: 'demo-tip-4', stop_id: null, title: 'Reiseversicherung und Gesundheit', body: 'Auslandskrankenversicherung und Rücktransport prüfen; Impf- und Malariahinweise mit reisemedizinischer Beratung klären. Keine medizinische Beratung durch die App.', category: 'health', warning_level: 'caution', verified_at: null, source_reference: 'https://www.auswaertiges-amt.de', source_type: 'editorial' },
      { ...base, id: 'demo-tip-5', stop_id: null, title: 'Fahren auf Schotterpisten', body: 'Beispielhinweis: Langsamer fahren, Reifendruck anpassen, Abstand zu Gegenverkehr halten, Wasser und Reserverad prüfen.', category: 'driving', warning_level: 'info', verified_at: null, source_reference: null, source_type: 'demo' },
    ],
    emergency_contacts: [
      { ...base, id: 'demo-contact-1', trip_id: DEMO_TRIP_ID, name: 'Demo-Notruf (Nummer vor Reise eintragen)', phone: '+000 0000 000', type: 'emergency', notes: 'Platzhalter. Echte lokale Notrufnummern recherchieren und hier ersetzen.', available_offline: true },
      { ...base, id: 'demo-contact-2', trip_id: DEMO_TRIP_ID, name: 'Demo-Mietwagenstation', phone: '+000 0000 001', type: 'rental', notes: 'Pannenhilfe des Vermieters eintragen.', available_offline: true },
      { ...base, id: 'demo-contact-3', trip_id: DEMO_TRIP_ID, name: 'Demo-Versicherung (Assistance)', phone: '+000 0000 002', type: 'insurance', notes: 'Policennummer niemals hier ablegen, nur im Dokumenten-Tresor.', available_offline: true },
    ],
    fx_rates: [],
  };
  // Fail fast on drift between the seed and the schemas.
  for (const [table, rows] of Object.entries(data) as [EntityName, Record<string, unknown>[]][]) {
    for (const row of rows) ENTITY_SCHEMAS[table].parse(row);
  }
  return data;
}
