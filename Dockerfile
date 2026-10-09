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
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ENV NEXT_PUBLIC_APP_MODE=$NEXT_PUBLIC_APP_MODE \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
