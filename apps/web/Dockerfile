# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
RUN pnpm build:web

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 capsicum
COPY --from=build --chown=capsicum:capsicum /app/apps/web/.next/standalone ./
COPY --from=build --chown=capsicum:capsicum /app/apps/web/.next/static ./apps/web/.next/static
USER capsicum
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
