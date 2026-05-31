# syntax=docker/dockerfile:1.7

# ── Stage 1: dependencies + build ─────────────────────────────────────────────
FROM node:20-alpine AS builder

# OpenSSL is needed by Prisma's query engine
RUN apk add --no-cache openssl

WORKDIR /app

# Install all deps (dev + prod) — needed for tsc and prisma generate
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source + schema, generate Prisma client, build TypeScript
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Prune dev dependencies so the runner stage stays small
RUN npm prune --omit=dev


# ── Stage 2: minimal runner ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy only what we need at runtime
COPY --from=builder --chown=app:app /app/node_modules     ./node_modules
COPY --from=builder --chown=app:app /app/dist             ./dist
COPY --from=builder --chown=app:app /app/prisma           ./prisma
COPY --from=builder --chown=app:app /app/package.json     ./package.json

USER app

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# tini = proper PID-1 init so SIGTERM from the host (Render) propagates cleanly to node
ENTRYPOINT ["/sbin/tini", "--"]

# `db:deploy` is safe to run every cold start — Prisma skips already-applied migrations.
# Falls through to `node dist/app.js` if migrations succeed.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
