import type { TravelTip } from '../domain/schemas';

const STAMP = '2026-10-01T00:00:00.000Z';
const BASE = { version: 1, created_at: STAMP, updated_at: STAMP, created_by: null, is_demo: false, source_type: 'editorial' as const, stop_id: null, verified_at: null };

/**
 * General guidance bundled with the app (read-only, available offline). Used in supabase mode, where the
 * database holds only station-bound tips. Deliberately free of concrete facts that can go stale (fees, hours, rules);
 * every item points to the official source and is marked as not verified.
 */
export const EDITORIAL_TIPS: readonly TravelTip[] = [
  { ...BASE, id: 'editorial-border', title: 'Grenzübertritt Namibia–Botswana vorbereiten', category: 'border', warning_level: 'warning', source_reference: 'https://www.auswaertiges-amt.de', body: 'Einreisebestimmungen, Mietwagen-Grenzpapiere und Öffnungszeiten der Grenzübergänge ändern sich und sind in der App nicht verifiziert. Offizielle Stellen und den Vermieter vor der Abreise fragen.' },
  { ...BASE, id: 'editorial-health', title: 'Reiseversicherung und Gesundheit', category: 'health', warning_level: 'caution', source_reference: 'https://www.auswaertiges-amt.de', body: 'Auslandskrankenversicherung und Rücktransport prüfen. Impf- und Malariahinweise mit reisemedizinischer Beratung klären. Die App gibt keine medizinische Beratung.' },
  { ...BASE, id: 'editorial-driving', title: 'Fahren auf Schotterpisten', category: 'driving', warning_level: 'info', source_reference: null, body: 'Langsamer fahren, Abstand halten, Reifen und Reserverad vor der Abfahrt prüfen, ausreichend Wasser mitführen und Tankstopps früh einplanen.' },
  { ...BASE, id: 'editorial-wildlife', title: 'Tiere beobachten', category: 'wildlife', warning_level: 'info', source_reference: null, body: 'Abstand halten, Tiere nicht füttern, im Fahrzeug bleiben und die Hinweise der Parkverwaltung beachten. Aktuelle Regeln vor Ort erfragen.' },
];
