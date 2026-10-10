# syntax=docker/dockerfile:1.7
# Coolify build pack "Dockerfile". Stages: deps -> build -> runtime.
# NEXT_PUBLIC_* are inlined into the client bundle at build time -> build ARGs (public values only).
# Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_INTERNAL_URL, AI_PROVIDER, KONTUROS_*) are
# runtime environment only and never appear in an ARG/ENV of the build stages.

FROM node:22.23.3-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.23.3-alpine3.24 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_MODE=demo
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_APP_MODE=$NEXT_PUBLIC_APP_MODE \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Self-hosted map tiles (OpenStreetMap via Protomaps, ~60 MB). Skipped when data/map already holds an archive. A failed
# download does not fail the build: the app then shows the schematic route map (see docs/DEPLOYMENT.md, "Karte").
ARG PMTILES_VERSION=1.31.2
ARG PMTILES_SHA256_X86_64=3ed7dbf4ec2e6ffe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
ARG PMTILES_SHA256_ARM64=f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1
ARG MAP_BUILD=
RUN if [ ! -f data/map/namibia-botswana.pmtiles ]; then \
      apk add --no-cache bash curl python3 \
      && arch="$(uname -m)" \
      && case "$arch" in x86_64) cli=x86_64; sum="$PMTILES_SHA256_X86_64";; aarch64) cli=arm64; sum="$PMTILES_SHA256_ARM64";; *) echo "unsupported arch $arch"; exit 1;; esac \
      && curl -fsSL -o /tmp/pmtiles.tgz "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${cli}.tar.gz" \
      && echo "${sum}  /tmp/pmtiles.tgz" | sha256sum -c - \
      && tar -xzf /tmp/pmtiles.tgz -C /usr/local/bin pmtiles \
      && SKIP_FONTS=1 BUILD="$MAP_BUILD" bash scripts/build-map-assets.sh \
      || echo "WARNING: map tiles not built, the app falls back to the schematic map"; \
    fi
RUN npm run build

FROM node:22.23.3-alpine3.24 AS runtime
RUN apk add --no-cache tini \
 && addgroup -S -g 10001 app && adduser -S -u 10001 -G app app \
 && mkdir -p /app/.next/cache && chown -R app:app /app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/data ./data
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
