import { describe, expect, it } from 'vitest';
import { imagesForStop, isScenicMotif, type DestinationImage } from '../../src/lib/media/places';

const image = (id: string, role: DestinationImage['role'], alt: string, over: Partial<DestinationImage> = {}): DestinationImage => ({
  id, place_key: 'erongo', place_label: 'Erongo', country: 'Namibia', latitude: -21.5, longitude: 15.6, radius_km: 60, role, variants: { full: 'erongo/x-full.webp' }, width: 1200, height: 800, alt_text: alt,
  source_provider: 'pixabay', source_url: 'https://example.test', photographer: 'A', license_type: 'Pixabay Content License', license_url: null, attribution_text: 'A / Pixabay', location_verified: false, ...over,
});
const stop = { title: 'Erongo-Gebirge', latitude: -21.5, longitude: 15.6 };

describe('scenic motif filter', () => {
  it('rejects minerals, close-ups and buildings but keeps landscapes and wildlife', () => {
    expect(isScenicMotif({ alt_text: 'Aquamarine crystal specimen from Erongo', place_label: 'Erongo' })).toBe(false);
    expect(isScenicMotif({ alt_text: 'Windhoek Hotel building', place_label: 'Windhoek' })).toBe(false);
    expect(isScenicMotif({ alt_text: 'Elefanten am Wasserloch (Galeriebild)', place_label: 'Etosha' })).toBe(true);
    expect(isScenicMotif({ alt_text: 'Dünen bei Sonnenaufgang', place_label: 'Sossusvlei' })).toBe(true);
  });

  it('never hands a mineral photo to a station, not even as the only image of its place', () => {
    const library = [image('1', 'gallery', 'Aquamarine mineral Erongo'), image('2', 'gallery', 'Granitberge im Abendlicht')];
    expect(imagesForStop(stop, library).gallery.map((i) => i.id)).toEqual(['2']);
    expect(imagesForStop(stop, [image('1', 'card', 'Quartz crystal')])).toEqual({ hero: null, card: null, gallery: [] });
  });
});
