# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

FROM base AS dependencies
COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
RUN pnpm --filter @capsicum/worker-node... build
RUN pnpm deploy --filter @capsicum/worker-node --prod /opt/worker

FROM python:3.13-slim-bookworm AS python-runtime
RUN python -m pip install --no-cache-dir Pillow==12.2.0

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production PYTHON_WORKER_PATH=/opt/capsicum-python-worker/worker.py
WORKDIR /app
COPY --from=python-runtime /usr/local /usr/local
RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin capsicum
COPY --from=build --chown=capsicum:capsicum /opt/worker ./
COPY --from=build --chown=capsicum:capsicum /app/apps/worker-node/dist ./dist
COPY --chown=capsicum:capsicum apps/worker-python/worker.py /opt/capsicum-python-worker/worker.py
USER capsicum
CMD ["node", "dist/worker.js"]
