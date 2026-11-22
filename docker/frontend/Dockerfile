# syntax=docker/dockerfile:1

# MES frontend — multi-stage production image.
# Build context: frontend/ (see ../docker-compose.yml).
#
# The build stage produces Next.js standalone output (see next.config.ts), so the
# runtime stage ships only the traced server bundle, the static assets, and the
# public folder — not the full dependency tree or any build tooling.

# --- build ------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2 AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined by Next at build time, so they must arrive as
# build arguments. An empty value builds a Sentry-disabled client.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# `public/` may not exist in the sources; create it so the runtime copy is stable.
RUN mkdir -p public
RUN bun run build

# --- runtime ----------------------------------------------------------------
FROM docker.io/library/node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Standalone bundle (server.js + traced node_modules), static assets, and public.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Never ship a local .env (it can carry secrets); runtime values come from Compose.
RUN find . -maxdepth 1 -name '.env*' -delete && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "server.js"]
