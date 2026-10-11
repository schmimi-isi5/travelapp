// ENTWURF – zentrale UI-Labels (Ziel: lib/labels.ts). Nur Anzeige-Mapping;
// gespeicherte Werte in der Datenbank bleiben unverändert.

export type StatusTone = "confirmed" | "progress" | "clarify" | "critical" | "unknown";

/** Rohwert aus Daten → Status der 5er-Taxonomie. Rohwerte vor Übernahme im Code verifizieren! */
export const statusTone: Record<string, StatusTone> = {
  confirmed: "confirmed", booked: "confirmed", paid: "confirmed", verified: "confirmed",
  requested: "progress", pending: "progress", partially_paid: "progress",
  needs_clarification: "clarify", missing_receipt: "clarify", open: "clarify",
  overdue: "critical", placeholder: "critical",
  unknown: "unknown",
};

export const statusLabel: Record<StatusTone, string> = {
  confirmed: "Bestätigt",
  progress: "In Arbeit",
  clarify: "Zu klären",
  critical: "Dringend",
  unknown: "Noch offen",
};

export const roleLabel: Record<string, string> = {
  owner: "Organisator:in",
  adult: "Erwachsene:r",
  member: "Mitglied",
  child: "Kind",
};

export const sourceLabel: Record<string, string> = {
  user_entered: "selbst eingetragen",
  excel_import: "aus der Reiseplanung",
  curated: "redaktionell",
  unknown: "Quelle unbekannt",
};

export const syncLabel: Record<string, string> = {
  running: "Synchronisierung läuft",
  idle: "Alles aktuell",
  skipped: "Übersprungen",
  error: "Synchronisierung fehlgeschlagen",
  offline: "Offline – Änderungen werden gespeichert",
};

export const entityLabel: Record<string, string> = {
  members: "Mitglieder", media: "Medium", tasks: "Aufgabe", stays: "Unterkunft",
  bookings: "Buchung", journal_entries: "Tagebucheintrag", sightings: "Sichtung",
};

const pr = new Intl.PluralRules("de-DE");
export const nights = (n: number) => `${n} ${pr.select(n) === "one" ? "Nacht" : "Nächte"}`;
export const persons = (n: number) => `${n} ${pr.select(n) === "one" ? "Person" : "Personen"}`;

/** Fahrtsegment: unbekannte Werte weglassen statt „ca. ? km“. */
export function driveSummary(km?: number | null, minutes?: number | null): string | null {
  const parts: string[] = [];
  if (km != null) parts.push(`${Math.round(km)} km`);
  if (minutes != null) {
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    parts.push(h ? `~${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `~${m} min`);
  }
  return parts.length ? parts.join(" · ") : null;
}
