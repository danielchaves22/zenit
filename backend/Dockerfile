# ============================================
# MULTI-STAGE DOCKER BUILD - CORRIGIDO
# ============================================

# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./
COPY prisma ./prisma

# Install ALL dependencies (including dev) for build
RUN npm ci && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production Runtime
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini \
    && rm -rf /var/cache/apk/*

# Copy package files for production install
COPY package*.json ./
COPY prisma ./prisma

# Install ONLY production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client for production
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# Copy startup script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create logs directory
RUN mkdir -p logs && chown nextjs:nodejs logs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Security: Run as non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["./docker-entrypoint.sh"]