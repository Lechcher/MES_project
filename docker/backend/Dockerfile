# syntax=docker/dockerfile:1

# MES backend — multi-stage production image.
# Build context: backend/ (see ../docker-compose.yml).
#
# The runtime stage carries no build tooling: only the application sources, the
# committed Drizzle migrations, and production dependencies. The PostgreSQL
# driver and the S3 client are pure JavaScript, so there is no native build
# step to carry across stages, and migrations are applied at startup by the
# service itself.

# --- deps: install only what the running service needs ----------------------
FROM docker.io/oven/bun:1.4.2 AS deps
WORKDIR /app/backend
# No drizzle-kit, typescript, or @types/bun in the runtime image.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- runtime ----------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-slim AS runtime
WORKDIR /app/backend

ENV NODE_ENV=production \
    MES_API_PORT=3001 \
    MES_EXPORT_DIR=/app/backend/data/exports

COPY --from=deps /app/backend/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY drizzle ./drizzle

# The data directory is the mount point for generated exports. Create it owned
# by the non-root user so a fresh named volume inherits that ownership and the
# exports remain writable.
RUN mkdir -p data/exports && chown -R bun:bun /app/backend/data

USER bun
EXPOSE 3001

# Readiness probe: Compose gates the proxy and web client on this.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.MES_API_PORT||3001)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `bun run start` boots Elysia and applies migrations before serving.
CMD ["bun", "run", "start"]
