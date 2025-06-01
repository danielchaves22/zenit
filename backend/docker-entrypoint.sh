#!/bin/sh
set -e

# ============================================
# DOCKER ENTRYPOINT - VERSÃO SIMPLIFICADA
# ============================================

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# ============================================
# ENVIRONMENT VALIDATION
# ============================================

log_info "Starting Zenit Core application..."
log_info "Environment: ${NODE_ENV:-development}"
log_info "Port: ${PORT:-3000}"

# Validate required environment variables
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL is required"
    exit 1
fi

if [ -z "$JWT_SECRET" ]; then
    log_error "JWT_SECRET is required"
    exit 1
fi

if [ "$NODE_ENV" = "production" ] && [ "$JWT_SECRET" = "defaultsecret" ]; then
    log_error "JWT_SECRET must be changed in production"
    exit 1
fi

log_success "Environment validation passed"

# ============================================
# DATABASE CONNECTION
# ============================================

log_info "Checking database connection..."

# Extract database host and port from DATABASE_URL
DBURL=${DATABASE_URL}
DBHOST= ${DB_HOST} # $(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DBPORT= ${DB_PORT} # $(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
log_info "Database URL: ${DBURL}"
log_info "Database Host: ${DBHOST}"
log_info "Database Port: ${DBPORT:-5432}"

# if [ -z "$DBPORT" ]; then
#     DBPORT=5432
# fi

log_info "Waiting for database at $DBHOST:$DBPORT..."

# Wait up to 60 seconds for database
timeout=60
while [ $timeout -gt 0 ]; do
    if nc -z "$DBHOST" "$DBPORT" 2>/dev/null; then
        log_success "Database is ready"
        break
    fi
    
    timeout=$((timeout - 1))
    if [ $timeout -eq 0 ]; then
        log_error "Database connection timeout after 60 seconds"
        exit 1
    fi
    
    sleep 1
done

# ============================================
# DATABASE MIGRATIONS
# ============================================

log_info "Running database migrations..."

# Apply migrations directly without testing connection first
if npx prisma migrate deploy --schema=./prisma/schema.prisma; then
    log_success "Database migrations completed"
else
    log_error "Database migrations failed"
    exit 1
fi

# ============================================
# DATABASE SEEDING (DEV ONLY)
# ============================================

if [ "$NODE_ENV" != "production" ] || [ "$FORCE_SEED" = "true" ]; then
    log_info "Development mode - attempting to seed database..."
    
    # Try to run seed, but don't fail if it doesn't work
    if npx prisma db seed 2>/dev/null; then
        log_success "Database seeded successfully"
    else
        log_info "Seed skipped (database may already have data)"
    fi
else
    log_info "Production mode - skipping seed"
fi

# ============================================
# REDIS CONNECTION (OPTIONAL)
# ============================================

if [ -n "$REDIS_HOST" ]; then
    log_info "Checking Redis connection..."
    
    REDIS_PORT=${REDIS_PORT:-6379}
    
    # Test Redis connection (don't fail if Redis is down)
    if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
        log_success "Redis is available at $REDIS_HOST:$REDIS_PORT"
    else
        log_warning "Redis is not available - rate limiting will use memory store"
    fi
else
    log_info "Redis not configured - using memory store for rate limiting"
fi

# ============================================
# SECURITY CHECKS
# ============================================

log_info "Running security checks..."

# Check if running as root
if [ "$(id -u)" = "0" ]; then
    log_error "Application is running as root - security risk!"
    exit 1
fi

log_success "Security checks passed"

# ============================================
# GRACEFUL SHUTDOWN HANDLER
# ============================================

# Handle shutdown signals
shutdown() {
    log_info "Received shutdown signal - starting graceful shutdown..."
    
    if [ -n "$APP_PID" ]; then
        log_info "Stopping application (PID: $APP_PID)..."
        kill -TERM "$APP_PID"
        
        # Wait up to 30 seconds for graceful shutdown
        timeout=30
        while [ $timeout -gt 0 ] && kill -0 "$APP_PID" 2>/dev/null; do
            timeout=$((timeout - 1))
            sleep 1
        done
        
        if kill -0 "$APP_PID" 2>/dev/null; then
            log_warning "Graceful shutdown timeout - forcing termination"
            kill -KILL "$APP_PID"
        fi
    fi
    
    log_success "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap 'shutdown' TERM INT

# ============================================
# START APPLICATION
# ============================================

log_info "Starting application..."

# Start the application in background
node dist/server.js &
APP_PID=$!

log_success "Application started successfully (PID: $APP_PID)"

# Wait for the application to finish
wait $APP_PID