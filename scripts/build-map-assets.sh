#!/usr/bin/env bash
# Builds the self-hosted map data: a Protomaps (OpenStreetMap) extract for Namibia + Botswana and the Latin map fonts.
# Needs the pmtiles CLI (https://github.com/protomaps/go-pmtiles) on PATH or in $PMTILES_BIN. Run once, then again for updates.
#   BUILD=20261009 MAXZOOM=12 scripts/build-map-assets.sh   (SKIP_FONTS=1: tiles only, used by the Dockerfile)
set -euo pipefail
cd "$(dirname "$0")/.."

PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
MAXZOOM="${MAXZOOM:-12}"
BBOX="${BBOX:-11.5,-29.2,29.5,-17.3}" # west,south,east,north: Namibia, Botswana, Victoria Falls
OUT="${MAP_TILES_FILE:-data/map/namibia-botswana.pmtiles}"
FONT_BASE="https://protomaps.github.io/basemaps-assets/fonts"

if [ -z "${BUILD:-}" ]; then
  BUILD="$(curl -fsS https://build-metadata.protomaps.dev/builds.json | python3 -I -c "import sys,json; print(json.load(sys.stdin)[-1]['key'])")"
else
  BUILD="${BUILD}.pmtiles"
fi

mkdir -p "$(dirname "$OUT")"
echo "Extracting ${BUILD} (bbox ${BBOX}, maxzoom ${MAXZOOM}) -> ${OUT}"
"$PMTILES_BIN" extract "https://build.protomaps.com/${BUILD}" "${OUT}.tmp" --bbox="$BBOX" --maxzoom="$MAXZOOM"
mv "${OUT}.tmp" "$OUT"

if [ -n "${SKIP_FONTS:-}" ]; then echo "Done. Tiles: $(du -h "$OUT" | cut -f1)"; exit 0; fi

# Glyph ranges 0-511 cover German, Afrikaans and Setswana names.
for font in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "public/map/fonts/${font}"
  for range in 0-255 256-511; do
    curl -fsS -o "public/map/fonts/${font}/${range}.pbf" "${FONT_BASE}/${font// /%20}/${range}.pbf"
  done
done
echo "Done. Tiles: $(du -h "$OUT" | cut -f1)"
