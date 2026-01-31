#!/bin/bash

################################################################################
# Add New Domain to Existing SSL Certificate
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Usage
if [ $# -lt 1 ]; then
    echo "Usage: sudo ./add-domain.sh <new-domain>"
    echo "Example: sudo ./add-domain.sh admin-cors-proxy.brijeshdev.space"
    exit 1
fi

NEW_DOMAIN=$1
CERT_NAME="cors-proxy.brijeshdev.space"  # Your primary certificate name

log_info "Adding domain: $NEW_DOMAIN"

# Check DNS
log_info "Checking DNS for $NEW_DOMAIN..."
if ! host "$NEW_DOMAIN" > /dev/null 2>&1; then
    log_error "DNS not configured for $NEW_DOMAIN"
    log_error "Please add an A record pointing to your server's IP first"
    exit 1
fi
log_info "✓ DNS OK"

# Get current domains from certificate
log_info "Getting current domains from certificate..."
CURRENT_DOMAINS=$(certbot certificates -d "$CERT_NAME" 2>/dev/null | grep "Domains:" | sed 's/.*Domains: //')

if [ -z "$CURRENT_DOMAINS" ]; then
    log_error "Certificate $CERT_NAME not found. Run setup-ssl.sh first."
    exit 1
fi

log_info "Current domains: $CURRENT_DOMAINS"

# Check if domain already exists
if echo "$CURRENT_DOMAINS" | grep -q "$NEW_DOMAIN"; then
    log_warn "Domain $NEW_DOMAIN already exists in certificate"
    exit 0
fi

# Build domain list
DOMAIN_ARGS=""
for domain in $CURRENT_DOMAINS; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done
DOMAIN_ARGS="$DOMAIN_ARGS -d $NEW_DOMAIN"

log_info "Expanding certificate to include new domain..."

# Stop nginx to free port 80
log_info "Stopping nginx..."
docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true

# Expand certificate
certbot certonly \
    --standalone \
    --cert-name "$CERT_NAME" \
    --expand \
    --non-interactive \
    --agree-tos \
    $DOMAIN_ARGS

# Restart nginx
log_info "Starting nginx..."
docker compose -f docker-compose.prod.yml up -d nginx

log_info "================================"
log_info "✓ Domain added successfully!"
log_info "================================"
log_info "Next steps:"
log_info "1. Add server block for $NEW_DOMAIN in nginx/conf.d/bsingh.conf"
log_info "2. Rebuild nginx: ./build.sh nginx"
log_info "3. Restart: docker compose -f docker-compose.prod.yml restart nginx"
log_info "4. Test: https://$NEW_DOMAIN"
