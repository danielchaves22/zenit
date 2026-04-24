FROM node:20-alpine

WORKDIR /app

# Build/runtime system dependencies.
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client \
    curl \
    tini \
    netcat-openbsd

# Install dependencies from monorepo root lockfile/workspaces.
COPY package*.json ./
COPY apps/zenit-admin/package.json ./apps/zenit-admin/package.json
COPY apps/zenit-calc/package.json ./apps/zenit-calc/package.json
COPY apps/zenit-cash/package.json ./apps/zenit-cash/package.json
COPY backend/package.json ./backend/package.json
COPY packages/shared-users-core/package.json ./packages/shared-users-core/package.json
RUN npm ci

# Copy source and build only backend workspace.
COPY . .
RUN npm --workspace backend run build

WORKDIR /app/backend

# Ensure entrypoint is executable and Prisma client is generated in container.
RUN chmod +x docker-entrypoint.sh && npx prisma generate

ENV NODE_ENV=production
ENV PORT=3000

# Security: run as non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
RUN mkdir -p /app/backend/logs && chown -R nextjs:nodejs /app/backend/logs
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
