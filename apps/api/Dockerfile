# Contexto de build: raíz del monorepo (docker build -f apps/api/Dockerfile .)
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
# `...` incluye las dependencias de workspace (packages/core).
RUN pnpm install --frozen-lockfile --filter @marcaje/api...
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @marcaje/core build \
 && pnpm --filter @marcaje/api build \
 && pnpm --filter @marcaje/api deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
