#!/bin/bash

################################################################################
# Deploy SSL Configuration
# Switches from HTTP to HTTPS configuration
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}==================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}==================================${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log_header "🔐 SSL Configuration Deployment"
echo ""

# Check if SSL certificates exist
if [ ! -d "/etc/letsencrypt/live" ] || [ -z "$(sudo ls -A /etc/letsencrypt/live 2>/dev/null)" ]; then
    log_error "❌ SSL certificates not found"
    log_info "Please run setup-ssl.sh first to obtain certificates"
    exit 1
fi

log_info "✓ SSL certificates found"
echo ""

# Step 1: Backup current nginx config
log_info "📋 Step 1: Backing up current nginx configuration..."
cd "$PROJECT_ROOT"

if [ -f "nginx/conf.d/bsingh.conf" ]; then
    BACKUP_FILE="nginx/conf.d/bsingh.conf.backup.$(date +%Y%m%d_%H%M%S)"
    cp "nginx/conf.d/bsingh.conf" "$BACKUP_FILE"
    log_info "   Backup created: $BACKUP_FILE"
else
    log_warn "   No existing config found"
fi

# Step 2: Remove duplicate SSL config if exists
if [ -f "nginx/conf.d/bsingh-ssl.conf" ]; then
    log_info "   Removing duplicate bsingh-ssl.conf from nginx/conf.d/"
    rm "nginx/conf.d/bsingh-ssl.conf"
fi

# Step 3: Deploy SSL nginx config
log_info "📝 Step 2: Deploying SSL nginx configuration..."
cp "$SCRIPT_DIR/bsingh-ssl.conf" "nginx/conf.d/bsingh.conf"
log_info "   ✓ SSL config deployed"

# Step 4: Backup docker-compose
log_info "📋 Step 3: Backing up docker-compose.prod.yml..."
if [ -f "docker-compose.prod.yml" ]; then
    BACKUP_COMPOSE="docker-compose.prod.yml.backup.$(date +%Y%m%d_%H%M%S)"
    cp "docker-compose.prod.yml" "$BACKUP_COMPOSE"
    log_info "   Backup created: $BACKUP_COMPOSE"
fi

# Step 5: Deploy SSL docker-compose
log_info "📝 Step 4: Deploying SSL docker-compose configuration..."
cp "$SCRIPT_DIR/docker-compose.prod-ssl.yml" "docker-compose.prod.yml"
log_info "   ✓ SSL docker-compose deployed"

echo ""
log_header "🔨 Building & Deploying"
echo ""

# Step 6: Rebuild nginx
log_info "🔨 Step 5: Rebuilding nginx image with SSL config..."
if ! ./build.sh --no-push nginx; then
    log_error "❌ Nginx build failed"
    exit 1
fi
log_info "   ✓ Nginx image built"

# Step 7: Deploy
log_info "🚀 Step 6: Deploying services..."
docker compose -f docker-compose.prod.yml pull backend frontend getdata portfolio
docker compose -f docker-compose.prod.yml up -d

log_info "   ✓ Services deployed"

echo ""
log_header "✅ SSL Deployment Complete!"
echo ""

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/domains.conf"

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    # Fallback if config not found (should not happen if flow is followed)
    DOMAINS=("cors-proxy.brijeshdev.space" "api-cors-proxy.brijeshdev.space" "getdata-cors-proxy.brijeshdev.space")
fi

log_info "Your domains are now running on HTTPS:"
for domain in "${DOMAINS[@]}"; do
    log_info "  • https://$domain"
done

echo ""
log_info "Next steps:"
log_info "1. Test HTTPS on all domains (check for green padlock)"
log_info "2. Verify HTTP → HTTPS redirect works"
log_info "3. Check SSL grade at: https://www.ssllabs.com/ssltest/"
log_info "4. Monitor certificate expiry: ./ssl-setup/check-ssl.sh"

echo ""
log_warn "💡 Tip: Run './ssl-setup/check-ssl.sh' anytime to check certificate status"
echo ""
