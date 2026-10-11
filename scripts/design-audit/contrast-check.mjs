#!/usr/bin/env node
// Doc 07 B1: WCAG-Kontrast der vorgesehenen Token-Paare (Design-System V2).
const pairs = [
  ["ink-900 auf sand-50", "#1F2937", "#FBF6EE", 4.5],
  ["ink-600 auf sand-50", "#566376", "#FBF6EE", 4.5],
  ["ink-600 auf weiß", "#566376", "#FFFFFF", 4.5],
  ["teal-900 auf sand-50 (Überschrift)", "#0B2E3B", "#FBF6EE", 4.5],
  ["weiß auf teal-800 (Primärbutton)", "#FFFFFF", "#0F3D4E", 4.5],
  ["teal-900 auf gold-500 (Hero-Button)", "#0B2E3B", "#D4A373", 4.5],
  ["gold-700 auf weiß (Goldtext)", "#8F5F2E", "#FFFFFF", 4.5],
  ["gold-200 auf teal-900 (Eyebrow auf dunklem Overlay)", "#F0D9B5", "#0B2E3B", 4.5],
  ["weiß auf clay-700 (Aufnahme)", "#FFFFFF", "#A8472B", 4.5],
  ["savanna-700 auf savanna-50", "#2F5D3A", "#EAF2EA", 4.5],
  ["ochre-700 auf ochre-50", "#8A5A12", "#FDF3DC", 4.5],
  ["stone-600 auf stone-100", "#5B6470", "#F1EEE9", 4.5],
  ["clay-700 auf clay-50", "#A8472B", "#FBEAE4", 4.5],
  ["gold-500 auf weiß (VERBOTEN als Text)", "#D4A373", "#FFFFFF", 4.5, true],
];
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let fail = 0;
for (const [name, fg, bg, min, expectFail] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok && !expectFail) fail++;
  console.log(`${ok ? "✔" : expectFail ? "✖ (erwartet)" : "✖"}  ${r.toFixed(2)} : 1  ${name}`);
}
console.log(fail ? `\n${fail} Paar(e) unter Mindestkontrast.` : "\nAlle vorgesehenen Paare erfüllen WCAG AA.");
process.exitCode = fail ? 1 : 0;
