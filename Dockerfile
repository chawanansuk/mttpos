# ───────── base: ติดตั้ง dependencies ทั้ง workspace ─────────
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false

FROM base AS build
COPY . .
RUN pnpm --filter @medee/db generate

# ───────── api ─────────
FROM build AS api
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "start"]

# ───────── web ─────────
FROM build AS web-build
RUN pnpm --filter @medee/web build

FROM web-build AS web
WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
