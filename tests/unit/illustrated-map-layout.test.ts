import { describe, expect, it } from 'vitest';
import { layoutPins, LABEL_FONT, mapLabel, MAP_HEIGHT, MAP_WIDTH, project } from '../../src/lib/map/illustrated-layout';

const place = (id: string, latitude: number, longitude: number, label = id) => ({ id, label, latitude, longitude });
const stations = [
  place('windhoek', -22.56, 17.07, 'Windhoek'), place('sossusvlei', -24.75, 15.29, 'Sossusvlei'), place('swakopmund', -22.68, 14.53, 'Swakopmund'), place('erongo', -21.5, 15.6, 'Erongo'),
  place('etosha', -18.8, 16.9, 'Etosha'), place('rundu', -17.9, 19.77, 'Rundu'), place('divundu', -18.1, 21.0, 'Divundu'), place('chobe', -17.8, 25.1, 'Chobe'), place('kasane', -17.8, 25.15, 'Kasane'), place('nata', -20.2, 26.2, 'Nata'), place('maun', -19.98, 23.42, 'Maun'),
];

describe('illustrated map layout', () => {
  it('projects the travel region into the drawing area', () => {
    for (const s of stations) {
      const p = project(s.latitude, s.longitude);
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(MAP_WIDTH);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  for (const width of [300, 460, 640]) {
    it(`keeps pins apart and shown labels free of overlaps at ${width}px (Chobe and Kasane are almost the same spot)`, () => {
      const { pins, radius, height } = layoutPins(stations, width);
      for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
        expect(Math.hypot(pins[i]!.pin.x - pins[j]!.pin.x, pins[i]!.pin.y - pins[j]!.pin.y), `${pins[i]!.id} / ${pins[j]!.id}`).toBeGreaterThanOrEqual(radius * 2);
      }
      expect(pins.find((p) => p.id === 'kasane')?.isNudged || pins.find((p) => p.id === 'chobe')?.isNudged).toBe(true);
      const boxes = pins.filter((p) => p.isLabelShown).map((p) => {
        const w = p.label.length * 6.9;
        const x1 = p.anchor === 'start' ? p.labelAt.x : p.anchor === 'end' ? p.labelAt.x - w : p.labelAt.x - w / 2;
        return { id: p.id, x1, x2: x1 + w, y1: p.labelAt.y - LABEL_FONT + 1, y2: p.labelAt.y + 2 };
      });
      for (const b of boxes) { expect(b.x1).toBeGreaterThanOrEqual(0); expect(b.x2).toBeLessThanOrEqual(width); expect(b.y2).toBeLessThanOrEqual(height); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!; const b = boxes[j]!;
        expect(a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    });
  }

  it('shows most labels on a desktop-sized map and never fewer pins than stations', () => {
    const { pins } = layoutPins(stations, 460);
    expect(pins).toHaveLength(stations.length);
    expect(pins.filter((p) => p.isLabelShown).length).toBeGreaterThanOrEqual(8);
  });

  it('shortens station titles for the label', () => {
    expect(mapLabel('Namib Wüste / Sossusvlei')).toBe('Sossusvlei');
    expect(mapLabel('Etosha Nationalpark')).toBe('Etosha');
    expect(mapLabel('Okavango Delta (Moremi)')).toBe('Okavango Delta');
  });
});
