import type { Booking, DocumentRecord, Stay } from './schemas';

export interface TravelDocumentItem {
  doc: DocumentRecord;
  context: string | null;
  date: string | null;
}

/** Everything that is needed on the way, earliest trip day first: documents with the booking or stay they belong to and the day. */
export function travelDocumentItems(docs: readonly DocumentRecord[], bookings: readonly Booking[], stays: readonly Stay[]): TravelDocumentItem[] {
  return docs
    .filter((d) => d.classification !== 'correspondence' && d.access_level !== 'sensitive')
    .map((doc) => {
      const booking = bookings.find((b) => b.id === doc.booking_id);
      const stay = stays.find((s) => s.id === doc.stay_id);
      return { doc, context: booking?.title ?? stay?.name ?? null, date: booking?.starts_at?.slice(0, 10) ?? stay?.check_in ?? null };
    })
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.doc.created_at.localeCompare(b.doc.created_at));
}
