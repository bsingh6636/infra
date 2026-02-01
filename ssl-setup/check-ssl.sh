#!/bin/bash

################################################################################
# Check SSL Certificate Status and Domains
################################################################################

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}$1${NC}"; }
log_warn() { echo -e "${YELLOW}$1${NC}"; }
log_header() { echo -e "${BLUE}$1${NC}"; }
log_error() { echo -e "${RED}$1${NC}"; }

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    log_error "❌ Certbot not installed"
    log_info "Run setup-ssl.sh to install and configure SSL"
    exit 1
fi

echo "=================================="
log_header "📜 SSL Certificate Status"
echo "=================================="
echo ""

# Check if running as root
SUDO=""
if [[ $EUID -ne 0 ]]; then
    SUDO="sudo"
fi

# Get certificate information
CERT_INFO=$($SUDO certbot certificates 2>/dev/null)

if [ -z "$CERT_INFO" ]; then
    log_error "❌ No certificates found"
    log_info "Run setup-ssl.sh to obtain SSL certificates"
    exit 1
fi

# Parse and display certificate info
echo "$CERT_INFO" | while IFS= read -r line; do
    case "$line" in
        *"Certificate Name"*)
            echo ""
            log_header "🔐 Certificate: $(echo $line | cut -d: -f2 | xargs)"
            ;;
        *"Domains"*)
            DOMAINS=$(echo $line | cut -d: -f2 | xargs)
            log_info "   📍 Domains:"
            for domain in $DOMAINS; do
                echo "      • $domain"
            done
            ;;
        *"Expiry Date"*)
            EXPIRY=$(echo $line | cut -d: -f2- | xargs)
            
            # Check if expiring soon
            DAYS_LEFT=$(echo "$EXPIRY" | grep -oP '\d+(?= day)')
            if [ ! -z "$DAYS_LEFT" ]; then
                if [ "$DAYS_LEFT" -lt 30 ]; then
                    log_warn "   ⏰ Expires: $EXPIRY"
                    log_warn "   ⚠️  Warning: Less than 30 days remaining!"
                else
                    log_info "   ✓ Expires: $EXPIRY"
                fi
            else
                log_info "   ✓ Expires: $EXPIRY"
            fi
            ;;
        *"Certificate Path"*)
            PATH_INFO=$(echo $line | cut -d: -f2- | xargs)
            echo "   📂 Path: $PATH_INFO"
            ;;
    esac
done

echo ""
echo "=================================="
log_header "🔄 Auto-Renewal Status"
echo "=================================="

# Check systemd timer (Ubuntu/Debian)
if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
    TIMER_STATUS=$($SUDO systemctl status certbot.timer 2>/dev/null | grep "Active:" | xargs)
    log_info "✓ Systemd timer: $TIMER_STATUS"
    
    NEXT_RUN=$($SUDO systemctl list-timers certbot.timer 2>/dev/null | grep certbot | awk '{print $1, $2, $3}')
    if [ ! -z "$NEXT_RUN" ]; then
        log_info "   Next run: $NEXT_RUN"
    fi
else
    log_warn "⚠️  Systemd timer not found - check cron jobs"
fi

echo ""
echo "=================================="
log_header "🌐 Domain DNS Check"
echo "=================================="

# Load domains from config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/domains.conf"

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    DOMAIN_LIST="${DOMAINS[@]}"
else
    # Fallback to certbot output if config not found
    DOMAIN_LIST=$($SUDO certbot certificates 2>/dev/null | grep "Domains:" | head -1 | cut -d: -f2 | xargs)
fi

for domain in $DOMAIN_LIST; do
    if host "$domain" > /dev/null 2>&1; then
        IP=$(host "$domain" | grep "has address" | awk '{print $4}' | head -1)
        log_info "✓ $domain → $IP"
    else
        log_error "❌ $domain - DNS not resolving"
    fi
done

echo ""
echo "=================================="
log_header "🔧 Quick Actions"
echo "=================================="
echo ""
echo "Test renewal:       sudo certbot renew --dry-run"
echo "Force renewal:      sudo certbot renew --force-renewal"
echo "Add domain:         sudo ./add-domain.sh <domain>"
echo "View logs:          sudo journalctl -u certbot.service"
echo ""
