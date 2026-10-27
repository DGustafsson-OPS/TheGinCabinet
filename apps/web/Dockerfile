# Production image for the Next.js website (spec §10B: pinned runtime major
# version, multi-stage build, non-root user, health check).
#
# Build:  docker build -t gin-cabinet-web --build-arg API_INTERNAL_URL=http://api:8000 apps/web

# ---- Stage 1: install exactly the locked dependency versions ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: build ----
FROM node:22-slim AS build
WORKDIR /app
# The /api rewrite target is fixed at build time (see next.config.ts).
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: the small runtime image ----
FROM node:22-slim AS runtime
ARG API_INTERNAL_URL=http://api:8000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=$API_INTERNAL_URL
# curl: Coolify's generated HTTP health check runs curl (or wget) inside the
# container, so the image must include one of them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# `output: "standalone"` produced a self-contained server with only the needed
# node_modules; static assets are copied next to it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Files in public/ (e.g. the home page photo) are served as-is from /.
COPY --from=build --chown=node:node /app/public ./public
# The official Node image already has an unprivileged "node" user.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
