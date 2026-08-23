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

FROM deps AS builder
ENV NODE_ENV=production \
    NX_DAEMON=false \
    NX_NO_CLOUD=true
ARG PUBLIC_API_BASE_URL=/api
ENV PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL}
COPY nx.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY libs ./libs
RUN --mount=type=cache,target=/workspace/.nx/cache \
    bun x nx build web --configuration=production

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app
RUN apk add --no-cache dumb-init \
    && addgroup -S app \
    && adduser -S app -G app

# Astro's Node adapter emits a standalone server at this path.
COPY --from=builder --chown=app:app /workspace/apps/web/dist ./

USER app
EXPOSE 4321
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/entry.mjs"]
