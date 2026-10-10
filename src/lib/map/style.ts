import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

export const TILE_SOURCE_URL = 'pmtiles://nb-trip-tiles';

// Warm sand and deep teal from the design system (docs/DESIGN_SPEC.md).
const flavor = {
  ...namedFlavor('light'),
  background: '#F3E9D6',
  earth: '#F3E9D6',
  water: '#9CC7D2',
  park_a: '#DCE3BF',
  park_b: '#D2DCB3',
  wood_a: '#CCD8AC',
  wood_b: '#C4D2A3',
  scrub_a: '#E4DDBA',
  scrub_b: '#DED6AE',
  sand: '#EBD7AA',
  highway: '#E3A26E',
  major: '#EFC596',
  boundaries: '#8A6B5A',
  city_label: '#0F3D4E',
  subplace_label: '#35616F',
  ocean_label: '#35788C',
  regular: 'Noto Sans Regular',
  bold: 'Noto Sans Medium',
  italic: 'Noto Sans Italic',
};

/** Offline-capable style: tiles from the PMTiles source, fonts from /map/fonts, no sprite (POI icons are dropped). */
export function buildMapStyle(): StyleSpecification {
  const baseLayers = layers('protomaps', flavor, { lang: 'de' }).filter((layer) => {
    const layout = 'layout' in layer ? (layer.layout as Record<string, unknown> | undefined) : undefined;
    return !(layout && 'icon-image' in layout);
  });
  return {
    version: 8,
    glyphs: '/map/fonts/{fontstack}/{range}.pbf',
    sources: {
      protomaps: {
        type: 'vector',
        url: TILE_SOURCE_URL,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-Mitwirkende · <a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a>',
      },
    },
    layers: baseLayers as StyleSpecification['layers'],
  };
}
