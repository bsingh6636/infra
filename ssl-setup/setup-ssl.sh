#!/bin/bash

################################################################################
# SSL Certificate Setup Script using Let's Encrypt + Certbot
# Industry-grade free SSL certificates with auto-renewal
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/domains.conf"

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    echo -e "\033[0;31m[ERROR] Configuration file not found: $CONFIG_FILE\033[0m"
    exit 1
fi

CERT_DIR="/etc/letsencrypt"
NGINX_CONF_DIR="./nginx/conf.d"
if [ -z "$CERT_NAME" ]; then
    CERT_NAME="${DOMAINS[0]}"
fi

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_dns() {
    log_info "Checking DNS configuration..."
    for domain in "${DOMAINS[@]}"; do
        if ! host "$domain" > /dev/null 2>&1; then
            log_error "DNS not configured for $domain"
            log_error "Please add an A record pointing to your server's IP"
            exit 1
        fi
        log_info "✓ DNS OK for $domain"
    done
}

install_certbot() {
    log_info "Installing Certbot..."
    
    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        log_error "Cannot detect OS"
        exit 1
    fi
    
    case $OS in
        ubuntu|debian)
            apt-get update
            apt-get install -y certbot
            ;;
        centos|rhel|fedora)
            yum install -y certbot
            ;;
        *)
            log_error "Unsupported OS: $OS"
            log_info "Please install certbot manually: https://certbot.eff.org/"
            exit 1
            ;;
    esac
    
    log_info "✓ Certbot installed"
}

stop_nginx_container() {
    log_info "Stopping nginx container to free port 80..."
    docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true
}

start_nginx_container() {
    log_info "Starting nginx container..."
    docker compose -f docker-compose.prod.yml up -d nginx
}

obtain_certificates() {
    log_info "Obtaining SSL certificates..."
    
    # Build domain arguments
    DOMAIN_ARGS=""
    for domain in "${DOMAINS[@]}"; do
        DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
    done
    
    # Obtain certificate using standalone mode
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --cert-name "$CERT_NAME" \
        --expand \
        $DOMAIN_ARGS \
        --preferred-challenges http
    
    if [ $? -eq 0 ]; then
        log_info "✓ Certificates obtained successfully"
    else
        log_error "Failed to obtain certificates"
        exit 1
    fi
}

setup_auto_renewal() {
    log_info "Setting up automatic renewal..."
    
    # Create renewal hook script
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
# Reload nginx after certificate renewal
docker compose -f /path/to/docker-compose.prod.yml exec nginx nginx -s reload
EOF
    
    # Update path in script
    sed -i "s|/path/to|$(pwd)|g" /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    
    # Test renewal process
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_info "✓ Auto-renewal configured (certbot will run via systemd timer)"
    else
        log_warn "Renewal test failed - please check configuration"
    fi
}

update_nginx_config() {
    log_info "Updating nginx configuration..."
    
    # Backup existing config
    cp "${NGINX_CONF_DIR}/bsingh.conf" "${NGINX_CONF_DIR}/bsingh.conf.backup"
    
    log_info "✓ Backup created: ${NGINX_CONF_DIR}/bsingh.conf.backup"
    log_info "Please update nginx configuration manually or use the provided bsingh-ssl.conf template"
}

update_docker_compose() {
    log_info "Checking docker-compose.prod.yml..."
    
    if ! grep -q "/etc/letsencrypt" docker-compose.prod.yml; then
        log_warn "You need to mount SSL certificates in docker-compose.prod.yml"
        log_info "Add these volumes to nginx service:"
        echo "    volumes:"
        echo "      - /etc/letsencrypt:/etc/letsencrypt:ro"
        echo "      - /etc/ssl/certs:/etc/ssl/certs:ro"
    fi
}

show_summary() {
    log_info "======================================"
    log_info "SSL Setup Complete! 🎉"
    log_info "======================================"
    echo ""
    log_info "Certificates installed for:"
    for domain in "${DOMAINS[@]}"; do
        log_info "  • https://$domain"
    done
    echo ""
    log_info "Next steps:"
    log_info "1. Update docker-compose.prod.yml to mount certificates"
    log_info "2. Replace nginx/conf.d/bsingh.conf with the SSL version"
    log_info "3. Restart nginx: docker compose -f docker-compose.prod.yml restart nginx"
    echo ""
    log_info "Auto-renewal: Certificates will auto-renew every 60 days"
    log_info "Certificate location: /etc/letsencrypt/live/${DOMAINS[0]}/"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "Starting SSL setup for Let's Encrypt..."
    
    # Validate email
    if [[ "$EMAIL" == "your-email@example.com" ]]; then
        log_error "Please update EMAIL in the script with your real email"
        exit 1
    fi
    
    check_root
    check_dns
    install_certbot
    stop_nginx_container
    obtain_certificates
    start_nginx_container
    setup_auto_renewal
    update_nginx_config
    update_docker_compose
    show_summary
}

# Run main function
main
