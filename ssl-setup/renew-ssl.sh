#!/bin/bash

################################################################################
# SSL Certificate Renewal Script
# Run this monthly via cron or rely on certbot's systemd timer
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_info "Starting certificate renewal check..."

# Renew certificates (certbot checks if renewal is needed)
if certbot renew --quiet; then
    log_info "Certificate renewal successful"
    
    # Reload nginx in docker container
    if docker ps | grep -q bsingh-nginx; then
        log_info "Reloading nginx..."
        docker exec bsingh-nginx nginx -s reload
        log_info "Nginx reloaded successfully"
    else
        log_warn "Nginx container not running"
    fi
else
    log_warn "Certificate renewal failed or not needed yet"
fi

log_info "Renewal check complete"
