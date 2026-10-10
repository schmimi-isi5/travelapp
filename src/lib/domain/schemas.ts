import { z } from 'zod';

/**
 * Canonical domain entities (docs/DATA_CONTRACT.md). Column names are snake_case and identical
 * to the Postgres schema so the Supabase adapter can map 1:1. Money is always integer minor units.
 */

export const SOURCE_TYPES = ['imported_document', 'user_verified', 'user_entered', 'editorial', 'ai_generated', 'demo'] as const;
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const ROLES = ['owner', 'adult', 'member', 'child'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const BOOKING_STATUSES = ['unknown', 'requested', 'reserved', 'confirmed', 'cancelled'] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const BOOKING_KINDS = ['hotel', 'flight', 'car', 'activity', 'park', 'other'] as const;
export const bookingKindSchema = z.enum(BOOKING_KINDS);
export type BookingKind = z.infer<typeof bookingKindSchema>;

export const QUOTE_STATUSES = ['none', 'quoted', 'confirmed'] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'ISO-4217-Code erwartet, z. B. EUR');
export const minorUnitsSchema = z.number().int().safe();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Datum im Format JJJJ-MM-TT');

const baseShape = {
  id: z.string().min(1),
  version: z.number().int().min(1).default(1),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().nullable().default(null),
  is_demo: z.boolean().default(false),
  source_type: sourceTypeSchema.default('user_entered'),
};

const provenance = {
  verified_at: z.string().nullable().default(null),
  source_reference: z.string().nullable().default(null),
};

export const familySchema = z.object({ ...baseShape, name: z.string().min(1), owner_user_id: z.string() });

export const memberSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  display_name: z.string().min(1),
  role: roleSchema,
  status: z.enum(['active', 'invited', 'suspended', 'removed']).default('active'),
  avatar_color: z.string().default('#0F3D4E'),
});

export const invitationSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  email: z.string().email().nullable().default(null),
  role: roleSchema,
  /** Raw invitation token. Only kept on the creating device; the database stores a SHA-256 hash. */
  code: z.string().default(''),
  expires_at: z.string(),
  accepted_at: z.string().nullable().default(null),
  revoked_at: z.string().nullable().default(null),
});

export const tripSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  title: z.string().min(1),
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  countries: z.array(z.string()).default([]),
});

export const tripStopSchema = z.object({
  ...baseShape,
  ...provenance,
  trip_id: z.string(),
  title: z.string().min(1, 'Titel erforderlich'),
  country: z.string().min(1, 'Land erforderlich'),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  arrive_at: isoDate.nullable(),
  depart_at: isoDate.nullable(),
  sequence: z.number().int().min(1),
  summary: z.string().default(''),
  highlights: z.array(z.string()).default([]),
});

export const routeSchema = z.object({
  ...baseShape,
  trip_id: z.string(),
  from_stop_id: z.string(),
  to_stop_id: z.string(),
  distance_km: z.number().nonnegative().nullable(),
  duration_minutes: z.number().int().nonnegative().nullable(),
  duration_source: z.enum(['provider', 'offline_estimate', 'user_entered', 'unknown']).default('unknown'),
});

export const staySchema = z.object({
  ...baseShape,
  ...provenance,
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  name: z.string().min(1, 'Name erforderlich'),
  address: z.string().nullable().default(null),
  check_in: isoDate.nullable().default(null),
  check_out: isoDate.nullable().default(null),
  booking_status: bookingStatusSchema.default('unknown'),
  quote_status: quoteStatusSchema.default('none'),
  price_minor: minorUnitsSchema.nonnegative().nullable().default(null),
  currency: currencySchema.nullable().default(null),
  booking_ref: z.string().nullable().default(null),
  due_at: isoDate.nullable().default(null),
  contact: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const bookingSchema = z.object({
  ...baseShape,
  ...provenance,
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  stay_id: z.string().nullable().default(null),
  kind: bookingKindSchema,
  title: z.string().min(1, 'Titel erforderlich'),
  booking_status: bookingStatusSchema.default('unknown'),
  starts_at: z.string().nullable().default(null),
  deadline_at: z.string().nullable().default(null),
  reminder_at: z.string().nullable().default(null),
  amount_minor: minorUnitsSchema.nonnegative().nullable().default(null),
  currency: currencySchema.nullable().default(null),
  reference: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  contact: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const DOCUMENT_CLASSIFICATIONS = ['invoice', 'receipt', 'confirmation', 'ticket', 'passport', 'insurance', 'visa', 'voucher', 'other'] as const;
export const ACCESS_LEVELS = ['adult', 'sensitive'] as const;

export const documentSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  booking_id: z.string().nullable().default(null),
  stay_id: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  storage_path: z.string(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative().default(0),
  classification: z.enum(DOCUMENT_CLASSIFICATIONS).default('other'),
  access_level: z.enum(ACCESS_LEVELS).default('adult'),
  /** Local-only: whether the file already reached the storage backend. */
  upload_state: z.enum(['uploaded', 'queued']).default('uploaded'),
});

export const VERIFICATION_STATUSES = ['unverified', 'verified', 'rejected'] as const;
export const paymentSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  booking_id: z.string().nullable().default(null),
  stay_id: z.string().nullable().default(null),
  amount_minor: minorUnitsSchema.positive('Betrag muss größer 0 sein'),
  currency: currencySchema,
  paid_at: z.string().nullable().default(null),
  verification_status: z.enum(VERIFICATION_STATUSES).default('unverified'),
  source_document_id: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  /** Offline-created payments are shown as pending until the server acknowledges them. */
  sync_state: z.enum(['synced', 'pending']).default('synced'),
});

export const actionItemSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  stay_id: z.string().nullable().default(null),
  booking_id: z.string().nullable().default(null),
  title: z.string().min(1, 'Titel erforderlich'),
  status: z.enum(['open', 'done', 'blocked']).default('open'),
  owner_user_id: z.string().nullable().default(null),
  due_at: z.string().nullable().default(null),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const journalEntrySchema = z.object({
  ...baseShape,
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  author_user_id: z.string(),
  entry_date: isoDate,
  title: z.string().min(1, 'Titel erforderlich'),
  body: z.string().default(''),
  visibility: z.enum(['family', 'private']).default('family'),
  status: z.enum(['draft', 'published']).default('published'),
  /** Published to read-only follower links. Opt-in per item; only owner/adult may set it, never for private items. */
  shared_with_followers: z.boolean().default(false),
  /** Opt-in only: lat/lon recorded when the author explicitly consented. */
  location: z.object({ latitude: z.number(), longitude: z.number() }).nullable().default(null),
  summary: z.object({ text: z.string(), provider: z.string(), generated_at: z.string(), is_ai: z.boolean() }).nullable().default(null),
});

export const MEDIA_KINDS = ['photo', 'video', 'audio'] as const;
export const mediaAssetSchema = z.object({
  ...baseShape,
  family_id: z.string(),
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  journal_entry_id: z.string().nullable().default(null),
  uploaded_by: z.string(),
  kind: z.enum(MEDIA_KINDS),
  storage_path: z.string(),
  original_name: z.string().nullable().default(null),
  captured_at: z.string().nullable().default(null),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  caption: z.string().default(''),
  visibility: z.enum(['family', 'private']).default('family'),
  album: z.string().nullable().default(null),
  is_favorite: z.boolean().default(false),
  /** Published to read-only follower links. Opt-in per item; only owner/adult may set it, never for private items. */
  shared_with_followers: z.boolean().default(false),
  /** Upload state in the local queue; remote objects are always `uploaded`. */
  upload_state: z.enum(['uploaded', 'queued']).default('uploaded'),
});

export const voiceTranscriptSchema = z.object({
  ...baseShape,
  media_id: z.string(),
  provider: z.string(),
  body: z.string().default(''),
  language: z.string().default('de'),
  status: z.enum(['not_available', 'pending', 'done', 'failed']).default('not_available'),
});

export const wildlifeSpeciesSchema = z.object({
  ...baseShape,
  common_name_de: z.string().min(1),
  scientific_name: z.string().nullable().default(null),
});

export const wildlifeSightingSchema = z.object({
  ...baseShape,
  trip_id: z.string(),
  stop_id: z.string().nullable().default(null),
  species_id: z.string().min(1, 'Art wählen'),
  seen_at: z.string(),
  recorded_by: z.string(),
  count: z.number().int().positive().nullable().default(null),
  notes: z.string().default(''),
  media_id: z.string().nullable().default(null),
  /** Published to read-only follower links. Opt-in per item; only owner/adult may set it, never for private items. */
  shared_with_followers: z.boolean().default(false),
});

export const sightingFavoriteSchema = z.object({ ...baseShape, species_id: z.string(), user_id: z.string() });

export const EXPENSE_CATEGORIES = ['unterkunft', 'verpflegung', 'transport', 'aktivitaeten', 'park', 'einkauf', 'sonstiges'] as const;
export const expenseSchema = z.object({
  ...baseShape,
  trip_id: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().default(''),
  amount_minor: minorUnitsSchema.positive('Betrag muss größer 0 sein'),
  currency: currencySchema,
  spent_at: isoDate,
  booking_id: z.string().nullable().default(null),
  payment_id: z.string().nullable().default(null),
  entered_by: z.string(),
});

export const fxRateSchema = z.object({
  ...baseShape,
  from_currency: currencySchema,
  to_currency: currencySchema,
  rate: z.number().positive(),
  as_of: z.string(),
  source: z.string().min(1, 'Quelle erforderlich'),
});

export const travelTipSchema = z.object({
  ...baseShape,
  ...provenance,
  stop_id: z.string().nullable().default(null),
  title: z.string().min(1),
  body: z.string(),
  category: z.enum(['wildlife', 'sight', 'driving', 'border', 'health', 'insurance', 'general']).default('general'),
  warning_level: z.enum(['info', 'caution', 'warning', 'critical']).default('info'),
});

export const emergencyContactSchema = z.object({
  ...baseShape,
  trip_id: z.string(),
  name: z.string().min(1, 'Name erforderlich'),
  phone: z.string().default(''),
  type: z.enum(['emergency', 'medical', 'embassy', 'rental', 'lodging', 'insurance', 'family']).default('emergency'),
  notes: z.string().default(''),
  available_offline: z.boolean().default(true),
});

export const MUTATION_STATUSES = ['pending', 'acknowledged', 'conflict', 'failed'] as const;
export const syncMutationSchema = z.object({
  id: z.string(),
  mutation_id: z.string(),
  device_id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  operation: z.enum(['upsert', 'delete']),
  base_version: z.number().int().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(MUTATION_STATUSES),
  error: z.string().nullable().default(null),
  created_at: z.string(),
});

export const syncConflictSchema = z.object({
  id: z.string(),
  mutation_id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  local_value: z.record(z.string(), z.unknown()).nullable(),
  remote_value: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable().default(null),
  resolution: z.enum(['keep_local', 'keep_remote']).nullable().default(null),
  /** Set when the server refused the change instead of reporting a version conflict. */
  reason: z.string().nullable().default(null),
});

/** Registry of all synced entity tables. Keys are the Dexie / Postgres table names. */
export const ENTITY_SCHEMAS = {
  family: familySchema,
  members: memberSchema,
  invitations: invitationSchema,
  trips: tripSchema,
  trip_stops: tripStopSchema,
  routes: routeSchema,
  stays: staySchema,
  bookings: bookingSchema,
  documents: documentSchema,
  payments: paymentSchema,
  action_items: actionItemSchema,
  journal_entries: journalEntrySchema,
  media_assets: mediaAssetSchema,
  voice_transcripts: voiceTranscriptSchema,
  wildlife_species: wildlifeSpeciesSchema,
  wildlife_sightings: wildlifeSightingSchema,
  sighting_favorites: sightingFavoriteSchema,
  expenses: expenseSchema,
  fx_rates: fxRateSchema,
  travel_tips: travelTipSchema,
  emergency_contacts: emergencyContactSchema,
} as const;

export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

export type Entity<K extends EntityName> = z.infer<(typeof ENTITY_SCHEMAS)[K]>;
export type Family = Entity<'family'>;
export type Member = Entity<'members'>;
export type Invitation = Entity<'invitations'>;
export type Trip = Entity<'trips'>;
export type TripStop = Entity<'trip_stops'>;
export type Route = Entity<'routes'>;
export type Stay = Entity<'stays'>;
export type Booking = Entity<'bookings'>;
export type DocumentRecord = Entity<'documents'>;
export type Payment = Entity<'payments'>;
export type ActionItem = Entity<'action_items'>;
export type JournalEntry = Entity<'journal_entries'>;
export type MediaAsset = Entity<'media_assets'>;
export type VoiceTranscript = Entity<'voice_transcripts'>;
export type WildlifeSpecies = Entity<'wildlife_species'>;
export type WildlifeSighting = Entity<'wildlife_sightings'>;
export type SightingFavorite = Entity<'sighting_favorites'>;
export type Expense = Entity<'expenses'>;
export type FxRate = Entity<'fx_rates'>;
export type TravelTip = Entity<'travel_tips'>;
export type EmergencyContact = Entity<'emergency_contacts'>;
export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;

export type BaseEntity = { id: string; version: number; created_at: string; updated_at: string };
