# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-alpine AS bun

FROM node:26-alpine AS base
ENV BUN_INSTALL=/usr/local
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /workspace

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS prisma-deps
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY apps/backend/prisma ./apps/backend/prisma
WORKDIR /workspace/apps/backend
RUN DATABASE_URL="postgresql://user:password@localhost:5432/mellocracia" \
    ../../node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM prisma-deps AS builder
WORKDIR /workspace
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true
COPY nx.json tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY libs ./libs
RUN --mount=type=cache,target=/workspace/.nx/cache \
    bun x nx build backend --configuration=production

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY apps/backend/prisma ./apps/backend/prisma

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
RUN apk add --no-cache dumb-init \
    && addgroup -S app \
    && adduser -S app -G app

COPY --from=production-deps --chown=app:app /workspace/node_modules ./node_modules
COPY --from=production-deps --chown=app:app /workspace/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY --from=production-deps --chown=app:app /workspace/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder --chown=app:app /workspace/dist/apps/backend ./

USER app
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]
