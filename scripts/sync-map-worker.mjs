// Copies the MapLibre tile-decoder worker next to the app so it loads from our own origin (strict CSP, offline, no bundler magic).
// Runs before dev and build; the copy is gitignored and always matches the installed maplibre-gl version.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/map/worker', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/map/worker/maplibre-gl-worker.mjs');
