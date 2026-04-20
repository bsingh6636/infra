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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NGINX_CONF_DIR="$PROJECT_ROOT/nginx/conf.d"
INFRA_COMPOSE="/opt/brijesh-infra/current/compose.yaml"
INFRA_PROJECT="brijesh-infra"

# Load CLOUDFLARE_API_TOKEN from project root .env if not set in domains.conf
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    CLOUDFLARE_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$PROJECT_ROOT/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
export CLOUDFLARE_API_TOKEN
fi

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

is_cloudflare_domain() {
    local domain="$1"
    # Check if the domain is proxied through Cloudflare by looking for cf-ray header
    local headers
    headers=$(curl -sI --max-time 5 "http://$domain" 2>/dev/null || true)
    if echo "$headers" | grep -qi "cf-ray\|server: cloudflare"; then
        return 0
    fi
    return 1
}

detect_cloudflare_domains() {
    CF_DOMAINS=()
    NON_CF_DOMAINS=()
    log_info "Detecting Cloudflare-proxied domains..."
    for domain in "${DOMAINS[@]}"; do
        if is_cloudflare_domain "$domain"; then
            CF_DOMAINS+=("$domain")
            log_warn "⚡ Cloudflare-proxied: $domain"
        else
            NON_CF_DOMAINS+=("$domain")
            log_info "✓ Direct: $domain"
        fi
    done
}

install_certbot_dns_cloudflare() {
    log_info "Installing certbot-dns-cloudflare plugin..."
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    fi
    case $OS in
        ubuntu|debian)
            apt-get install -y python3-certbot-dns-cloudflare
            ;;
        centos|rhel|fedora)
            pip3 install certbot-dns-cloudflare
            ;;
        *)
            pip3 install certbot-dns-cloudflare
            ;;
    esac
    log_info "✓ certbot-dns-cloudflare installed"
}

setup_cloudflare_credentials() {
    local cred_file="/etc/letsencrypt/cloudflare.ini"
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        log_error "CLOUDFLARE_API_TOKEN is not set in domains.conf"
        log_error "Create one at: https://dash.cloudflare.com/profile/api-tokens"
        log_error "Required permissions: Zone → DNS → Edit"
        exit 1
    fi
    mkdir -p /etc/letsencrypt
    cat > "$cred_file" << EOF
dns_cloudflare_api_token = $CLOUDFLARE_API_TOKEN
EOF
    chmod 600 "$cred_file"
    log_info "✓ Cloudflare credentials configured"
}

obtain_certificates_dns01() {
    log_info "Retrying failed domains via DNS-01 (Cloudflare) challenge..."

    install_certbot_dns_cloudflare
    setup_cloudflare_credentials

    # Build domain arguments for ALL domains (single cert)
    DOMAIN_ARGS=""
    for domain in "${DOMAINS[@]}"; do
        DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
    done

    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 30 \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --cert-name "$CERT_NAME" \
        --expand \
        $DOMAIN_ARGS

    if [ $? -eq 0 ]; then
        log_info "✓ Certificates obtained successfully via DNS-01"
    else
        log_error "DNS-01 challenge also failed. Check Cloudflare API token and DNS settings."
        exit 1
    fi
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
    if [ -f "$INFRA_COMPOSE" ]; then
        docker compose -p "$INFRA_PROJECT" -f "$INFRA_COMPOSE" stop edge 2>/dev/null || true
    fi
}

start_nginx_container() {
    log_info "Starting nginx container..."
    if [ -f "$INFRA_COMPOSE" ]; then
        docker compose -p "$INFRA_PROJECT" -f "$INFRA_COMPOSE" up -d edge
    fi
}

check_new_domains() {
    # Check if the existing cert already covers all requested domains
    local cert_path="/etc/letsencrypt/live/$CERT_NAME/cert.pem"
    if [ ! -f "$cert_path" ]; then
        return 0  # No existing cert, needs issuance
    fi

    local needs_update=false
    for domain in "${DOMAINS[@]}"; do
        if ! openssl x509 -in "$cert_path" -noout -text 2>/dev/null | grep -qi "DNS:$domain"; then
            log_info "New domain detected: $domain"
            needs_update=true
        fi
    done

    if [ "$needs_update" = true ]; then
        FORCE_RENEWAL="--force-renewal"
        log_info "Certificate will be re-issued to include new domain(s)"
    else
        FORCE_RENEWAL=""
    fi
}

verify_cert_domains() {
    # Verify the actual cert file contains ALL requested domains
    local cert_path="/etc/letsencrypt/live/$CERT_NAME/cert.pem"
    if [ ! -f "$cert_path" ]; then
        return 1
    fi
    local cert_text
    cert_text=$(openssl x509 -in "$cert_path" -noout -text 2>/dev/null)
    for domain in "${DOMAINS[@]}"; do
        if ! echo "$cert_text" | grep -qi "DNS:$domain"; then
            log_warn "Domain $domain is NOT in the current certificate"
            return 1
        fi
    done
    return 0
}

obtain_certificates() {
    log_info "Obtaining SSL certificates (HTTP-01 standalone)..."

    # Check if new domains need to be added to the cert
    check_new_domains
    
    # Build domain arguments
    DOMAIN_ARGS=""
    for domain in "${DOMAINS[@]}"; do
        DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
    done
    
    # Attempt certificate using standalone mode
    set +e
    local certbot_output
    certbot_output=$(certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --cert-name "$CERT_NAME" \
        --expand \
        $FORCE_RENEWAL \
        $DOMAIN_ARGS \
        --preferred-challenges http 2>&1)
    local exit_code=$?
    set -e

    echo "$certbot_output"
    
    if [ $exit_code -eq 0 ]; then
        # Certbot may return 0 with "no action taken" — verify cert actually has all domains
        if echo "$certbot_output" | grep -qi "no action taken"; then
            if verify_cert_domains; then
                log_info "✓ Certificate already covers all domains"
            else
                log_warn "Certificate is missing domains. Certbot skipped re-issuance."
                log_warn "Falling back to DNS-01 to re-issue with all domains..."
                obtain_certificates_dns01
            fi
        else
            log_info "✓ Certificates obtained successfully via HTTP-01"
        fi
    else
        log_warn "HTTP-01 challenge failed. Checking for Cloudflare-proxied domains..."
        detect_cloudflare_domains
        if [ ${#CF_DOMAINS[@]} -gt 0 ]; then
            log_warn "Found ${#CF_DOMAINS[@]} Cloudflare-proxied domain(s). Falling back to DNS-01..."
            obtain_certificates_dns01
        else
            log_error "No Cloudflare domains detected. HTTP-01 failed for another reason."
            log_error "Check firewall rules and ensure port 80 is open."
            exit 1
        fi
    fi
}

setup_auto_renewal() {
    log_info "Setting up automatic renewal..."

    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    mkdir -p /etc/letsencrypt/renewal-hooks/pre
    mkdir -p /etc/letsencrypt/renewal-hooks/post
    
    # Reload edge nginx inside running container after renewal (no downtime)
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
INFRA_COMPOSE="/opt/brijesh-infra/current/compose.yaml"
INFRA_PROJECT="brijesh-infra"
if [ -f "$INFRA_COMPOSE" ]; then
    docker compose -p "$INFRA_PROJECT" -f "$INFRA_COMPOSE" exec edge nginx -s reload
fi
EOF
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    
    # Test renewal process
    stop_nginx_container
    set +e
    certbot renew --dry-run 2>&1
    local renew_exit=$?
    set -e
    
    if [ $renew_exit -eq 0 ]; then
        log_info "✓ Auto-renewal configured (certbot will run via systemd timer)"
    else
        log_warn "Renewal dry-run failed (likely Cloudflare-proxied domains)."
        log_warn "Auto-renewal via systemd will use pre/post hooks below."
    fi
    start_nginx_container

    # Pre/post hooks for standalone renewal fallback
    cat > /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh << 'EOF'
#!/bin/bash
INFRA_COMPOSE="/opt/brijesh-infra/current/compose.yaml"
INFRA_PROJECT="brijesh-infra"
if [ -f "$INFRA_COMPOSE" ]; then
    docker compose -p "$INFRA_PROJECT" -f "$INFRA_COMPOSE" stop edge
fi
EOF
    chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

    cat > /etc/letsencrypt/renewal-hooks/post/start-nginx.sh << 'EOF'
#!/bin/bash
INFRA_COMPOSE="/opt/brijesh-infra/current/compose.yaml"
INFRA_PROJECT="brijesh-infra"
if [ -f "$INFRA_COMPOSE" ]; then
    docker compose -p "$INFRA_PROJECT" -f "$INFRA_COMPOSE" up -d edge
fi
EOF
    chmod +x /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
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
    
    if ! grep -q "/etc/letsencrypt" "$DOCKER_COMPOSE_PROD"; then
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
