/**
 * Layout for the illustrated route map: simplified country outlines, projection of the stations, pins that never overlap and
 * labels that never collide. Pure functions, so the placement is testable. The outlines are hand-simplified illustrations,
 * not survey data; the map is labelled as an illustration.
 */
export const MAP_WIDTH = 640;
const LON_MIN = 11;
const LON_MAX = 30;
const LAT_MAX = -16.5;
const LAT_MIN = -29.5;
const COS_MID = Math.cos(((LAT_MAX + LAT_MIN) / 2) * (Math.PI / 180));
const SCALE = MAP_WIDTH / ((LON_MAX - LON_MIN) * COS_MID);
export const MAP_HEIGHT = Math.round((LAT_MAX - LAT_MIN) * SCALE);

/** Pins and labels are laid out in screen pixels, so text stays 12 px at every map width; only the country shapes scale. */
export const LABEL_FONT = 12;
const CHAR_WIDTH = 6.9;
export const pinRadiusFor = (width: number): number => (width < 420 ? 13 : 16);

export interface Point {
  x: number;
  y: number;
}

/** Base projection in the 640-unit drawing space; `scale` converts to screen pixels. */
export function project(lat: number, lon: number, scale = 1): Point {
  return { x: (lon - LON_MIN) * COS_MID * SCALE * scale, y: (LAT_MAX - lat) * SCALE * scale };
}

type LonLat = [number, number];

const NAMIBIA: LonLat[] = [[11.75, -17.25], [14.2, -17.4], [18.4, -17.4], [20.0, -17.9], [21.0, -18.1], [22.5, -17.5], [24.3, -17.45], [25.26, -17.8], [24.0, -18.0], [21.0, -18.32], [21.0, -22.0], [20.0, -22.0], [20.0, -24.77], [20.0, -28.4], [19.0, -28.5], [17.6, -28.75], [16.45, -28.62], [15.15, -26.65], [14.5, -22.95], [14.4, -22.0], [13.5, -20.5], [12.5, -18.8], [11.9, -18.0]];
const BOTSWANA: LonLat[] = [[21.0, -18.32], [24.0, -18.0], [25.26, -17.8], [26.0, -18.3], [26.9, -19.6], [27.3, -20.4], [27.7, -21.2], [28.4, -21.7], [29.35, -22.2], [28.0, -22.6], [27.0, -23.4], [26.4, -24.5], [25.6, -25.6], [24.5, -25.8], [22.6, -26.0], [21.0, -26.85], [20.6, -26.85], [20.0, -24.77], [20.0, -22.0], [21.0, -22.0]];
const OCEAN: LonLat[] = [[LON_MIN, LAT_MAX], [11.9, LAT_MAX], [11.75, -17.25], [11.9, -18.0], [12.5, -18.8], [13.5, -20.5], [14.4, -22.0], [14.5, -22.95], [15.15, -26.65], [16.45, -28.62], [17.2, LAT_MIN], [LON_MIN, LAT_MIN]];

function pathOf(points: LonLat[]): string {
  return `${points.map(([lon, lat], index) => { const p = project(lat, lon); return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join('')}Z`;
}

export const OUTLINES = { namibia: pathOf(NAMIBIA), botswana: pathOf(BOTSWANA), ocean: pathOf(OCEAN) };
export const COUNTRY_LABELS = [
  { text: 'NAMIBIA', ...project(-21.6, 16.3) },
  { text: 'BOTSWANA', ...project(-22.3, 24.0) },
];

export interface PinInput {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface PlacedPin {
  id: string;
  label: string;
  /** True position of the place. */
  origin: Point;
  /** Where the pin is drawn (nudged apart from its neighbours). */
  pin: Point;
  isNudged: boolean;
  labelAt: Point;
  anchor: 'start' | 'middle' | 'end';
  /** False when no free spot exists for the label (crowded small map): the pin stays, its name is in the accessible name only. */
  isLabelShown: boolean;
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const circleBox = (p: Point, radius: number, pad = 2): Box => ({ x1: p.x - radius - pad, y1: p.y - radius - pad, x2: p.x + radius + pad, y2: p.y + radius + pad });

/** Pushes overlapping pins apart; neighbours end up at least two radii (plus a gap) from each other. */
function separate(points: Point[], radius: number, width: number, height: number): Point[] {
  const out = points.map((p) => ({ ...p }));
  const minDistance = radius * 2 + 3;
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        if (distance < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); distance = 1; }
        const push = (minDistance - distance) / 2 + 0.5;
        a.x -= (dx / distance) * push; a.y -= (dy / distance) * push;
        b.x += (dx / distance) * push; b.y += (dy / distance) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out.map((p) => ({ x: Math.min(width - radius - 2, Math.max(radius + 2, p.x)), y: Math.min(height - radius - 2, Math.max(radius + 2, p.y)) }));
}

/** Projects the places into `width` pixels, keeps the pins apart and puts every label where it touches neither a pin nor another label. */
export function layoutPins(inputs: PinInput[], width = MAP_WIDTH): { pins: PlacedPin[]; height: number; radius: number } {
  const scale = width / MAP_WIDTH;
  const height = Math.round(MAP_HEIGHT * scale);
  const radius = pinRadiusFor(width);
  const origins = inputs.map((i) => project(i.latitude, i.longitude, scale));
  const positions = separate(origins, radius, width, height);
  const pinBoxes = positions.map((p) => circleBox(p, radius));
  const taken: Box[] = [];
  const pins = inputs.map((input, index) => {
    const pin = positions[index]!;
    const textWidth = input.label.length * CHAR_WIDTH;
    const textHeight = LABEL_FONT + 3;
    const candidates: { at: Point; anchor: PlacedPin['anchor']; box: Box }[] = [
      { at: { x: pin.x + radius + 5, y: pin.y + 4 }, anchor: 'start', box: { x1: pin.x + radius + 3, y1: pin.y - textHeight / 2, x2: pin.x + radius + 7 + textWidth, y2: pin.y + textHeight / 2 } },
      { at: { x: pin.x - radius - 5, y: pin.y + 4 }, anchor: 'end', box: { x1: pin.x - radius - 7 - textWidth, y1: pin.y - textHeight / 2, x2: pin.x - radius - 3, y2: pin.y + textHeight / 2 } },
      { at: { x: pin.x, y: pin.y - radius - 6 }, anchor: 'middle', box: { x1: pin.x - textWidth / 2, y1: pin.y - radius - 6 - textHeight, x2: pin.x + textWidth / 2, y2: pin.y - radius - 3 } },
      { at: { x: pin.x, y: pin.y + radius + 15 }, anchor: 'middle', box: { x1: pin.x - textWidth / 2, y1: pin.y + radius + 3, x2: pin.x + textWidth / 2, y2: pin.y + radius + 18 } },
    ];
    const fits = (c: (typeof candidates)[number]) => c.box.x1 >= 0 && c.box.x2 <= width && c.box.y1 >= 0 && c.box.y2 <= height && !taken.some((t) => overlaps(t, c.box)) && !pinBoxes.some((b, i) => i !== index && overlaps(b, c.box));
    const chosen = candidates.find(fits);
    const picked = chosen ?? candidates[0]!;
    if (chosen) taken.push(chosen.box);
    const origin = origins[index]!;
    return { id: input.id, label: input.label, origin, pin, isNudged: Math.hypot(origin.x - pin.x, origin.y - pin.y) > 4, labelAt: picked.at, anchor: picked.anchor, isLabelShown: Boolean(chosen) };
  });
  return { pins, height, radius };
}

/** Short place name for the label: last part of "A / B", without generic suffixes. */
export function mapLabel(title: string): string {
  const last = title.split('/').pop()?.trim() ?? title;
  return last.replace(/\s+(Nationalpark|National Park|N\.P\.)$/i, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim() || title;
}
