export interface StopLike { id?: string; title: string; country: string; latitude?: number | null; longitude?: number | null; highlights?: string[] }
export interface Place { key: string; label: string; country: string; latitude: number | null; longitude: number | null; radiusKm: number; queries: string[] }
export interface Location { verified: boolean; basis: string; distanceKm: number | null }
export interface Candidate { id: string; title: string; width: number; height: number; categories?: string; description?: string; coords?: { lat: number; lon: number } | null; [key: string]: unknown }
export interface Scored extends Candidate { scores: { hero: number; card: number; gallery: number } }
export const TRAVEL_REGION: Set<string>;
export const ROLE_REQUIREMENTS: Record<'hero' | 'card' | 'gallery', { minWidth: number; minRatio: number; maxRatio: number }>;
export const MIN_SCORE: Record<'hero' | 'card' | 'gallery', number>;
export const VARIANT_PLAN: Record<'hero' | 'card' | 'gallery', { key: string; width: number; height: number | null; quality: number }[]>;
export function stripDiacritics(text: string): string;
export function slugify(text: string): string;
export function placeFromStop(stop: StopLike): Place | null;
export function highlightQueries(stop: StopLike, countryEnglish: string): string[];
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number;
export function checkLocation(place: Place, coords: { lat: number; lon: number } | null | undefined): Location;
export function stripHtml(html: unknown): string;
export function classifyLicense(meta: Record<string, { value?: string } | undefined>): { ok: true; type: string; licenseUrl: string | null; photographer: string | null; attributionRequired: boolean } | { ok: false; reason: string };
export function isUsableCandidate(candidate: { title: string; categories?: string }): { ok: boolean; reason?: string };
export function fitsRole(role: 'hero' | 'card' | 'gallery', width: number, height: number): boolean;
export function subjectScore(role: 'hero' | 'card' | 'gallery', title: string): number;
export function scoreCandidate(role: 'hero' | 'card' | 'gallery', candidate: Candidate, location: Location, options?: { reused?: boolean }): number;
export function altTextFor(place: Place, role: string, candidate: { description?: string }): string;
export function chooseRoles(scored: Scored[], needs?: { hero?: number; card?: number; gallery?: number }): { role: 'hero' | 'card' | 'gallery'; item: Scored }[];
export function namesPlace(place: Place, candidate: { title: string; categories?: string }): boolean;
