# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# prisma.config.ts reads DATABASE_URL; generating the client does not connect, so a placeholder is enough.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund --foreground-scripts

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Minimal toolchain to apply migrations at start-up.
FROM node:22-bookworm-slim AS migrator
WORKDIR /migrate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm init -y >/dev/null && npm install --no-audit --no-fund --save-exact prisma@7.10.1 dotenv@17.4.2
COPY prisma.config.ts ./
COPY prisma ./prisma
# Download the schema engine for this platform now, so start-up needs no network or write access.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma version >/dev/null

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# OpenSSL is used by Prisma's migration engine (and TLS connections to managed databases).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=migrator --chown=node:node /migrate /migrate
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "cd /migrate && npx prisma migrate deploy && cd /app && node server.js"]
