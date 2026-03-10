# ─────────────────────────────────────────────
# Stage 1: Builder
# Installs ALL deps, generates Prisma client,
# patches it, and compiles TypeScript.
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install OS deps needed by some native npm packages
RUN apk add --no-cache python3 make g++

# Install dependencies (production + dev needed for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

# Generate Prisma client then patch it, then compile
RUN npm run db:generate && npm run build


# ─────────────────────────────────────────────
# Stage 2: Production image
# Copies only the compiled output + prod deps.
# ─────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install OS deps for native modules (bcrypt etc.)
RUN apk add --no-cache python3 make g++

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled app
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + migrations (needed for migrate deploy at startup)
COPY --from=builder /app/prisma ./prisma

# Copy prisma.config.ts (needed so migrate deploy can find DATABASE_URL at runtime)
COPY --from=builder /app/prisma.config.ts ./

# Copy generated Prisma client (patched)
COPY --from=builder /app/generated ./generated

# Copy Postman collection + environment (served at /dev/postman/*)
COPY postman ./postman

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Cloud Run injects PORT — default to 3000 locally
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
