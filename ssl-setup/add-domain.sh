#!/bin/bash

# Utility to add a new domain to the SSL certificate configuration
# Usage: ./add-domain.sh <new-domain>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/domains.conf"
SETUP_SCRIPT="$SCRIPT_DIR/setup-ssl.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}[ERROR]${NC} Please provide a domain name."
    echo "Usage: $0 <domain.example.com>"
    exit 1
fi

NEW_DOMAIN=$1

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} domains.conf not found at $CONFIG_FILE"
    exit 1
fi

# Check if domain already exists
if grep -q "\"$NEW_DOMAIN\"" "$CONFIG_FILE"; then
    echo -e "${GREEN}[INFO]${NC} Domain $NEW_DOMAIN already exists in domains.conf"
else
    # Insert new domain before the closing parenthesis
    # This assumes the DOMAINS array ends with a ")" on its own or after the last entry
    sed -i "/)/i \    \"$NEW_DOMAIN\"" "$CONFIG_FILE"
    echo -e "${GREEN}[SUCCESS]${NC} Added $NEW_DOMAIN to domains.conf"
fi

echo -e "${GREEN}[INFO]${NC} Now running setup-ssl.sh to update certificates..."
sudo "$SETUP_SCRIPT"
