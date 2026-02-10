# 🌐 Managing Multiple Domains and Subdomains

Complete guide for managing multiple domains and subdomains in your production infrastructure.

---

## 📋 Quick Reference

### Adding a New Subdomain (Same Domain)
1. Add service to `docker-compose.prod.yml`
2. Add mapping in `nginx/conf.d/bsingh-multi-domain.conf`
3. Add subdomain to `ssl-setup/domains.conf` or use wildcard cert
4. Deploy: `./ssl-setup/deploy-ssl.sh`

### Adding a New Root Domain
1. Add all services for that domain to `docker-compose.prod.yml`
2. Add domain mappings in nginx config
3. Create SSL certificate for new domain
4. Add DNS A records
5. Deploy

---

## 🎯 Configuration Files

### 1. Nginx Routing: `nginx/conf.d/bsingh-multi-domain.conf`

**Map Section** - Add your domain → service mappings:

```nginx
map $host $backend_service {
    # Add your mappings here:
    admin.brijeshdev.space              "admin:3000";
    blog.brijeshdev.space               "blog:8080";
}
```

**Server Names** - Add your domains to both HTTP and HTTPS blocks:

```nginx
server {
    listen 80;
    server_name 
        *.brijeshdev.space brijeshdev.space
        *.example.com example.com;  # Add new domains here
}
```

### 2. SSL Certificates: `ssl-setup/domains.conf`

**Option A: Individual Subdomains**
```bash
DOMAINS_BRIJESH=(
    "brijeshdev.space"
    "api.brijeshdev.space"
    "new-subdomain.brijeshdev.space"  # Add here
)
```

**Option B: Wildcard Certificate** (Recommended for many subdomains)
```bash
DOMAINS_BRIJESH=(
    "brijeshdev.space"
    "*.brijeshdev.space"
)
```

---

## ✅ Step-by-Step Guides

### 📌 Adding a New Subdomain (e.g., `admin.brijeshdev.space`)

**Step 1:** Add service to `docker-compose.prod.yml`
```yaml
services:
  admin:
    image: bsingh6636/bsingh-admin:latest
    container_name: bsingh-admin
    networks:
      - bsingh-net
    restart: unless-stopped
```

**Step 2:** Add mapping to nginx config
```bash
# Edit nginx/conf.d/bsingh-multi-domain.conf
# In the map section, add:
admin.brijeshdev.space              "admin:3000";
```

**Step 3:** Update SSL certificate

If using **individual subdomains**:
```bash
# Edit ssl-setup/domains.conf, add to DOMAINS array:
"admin.brijeshdev.space"

# Expand certificate:
cd ssl-setup
sudo ./setup-ssl.sh
```

If using **wildcard certificate** (*.brijeshdev.space):
```bash
# Nothing to do - wildcard already covers all subdomains!
```

**Step 4:** Rebuild nginx and deploy
```bash
# Rebuild nginx with new config
./build.sh nginx

# Pull admin service image
docker compose -f docker-compose.prod.yml pull admin

# Deploy everything
cd ssl-setup
./deploy-ssl.sh
```

**Step 5:** Verify
```bash
curl -I https://admin.brijeshdev.space
```

---

### 📌 Adding a New Root Domain (e.g., `another-domain.com`)

**Step 1:** Add services for new domain
```yaml
# docker-compose.prod.yml
services:
  another-frontend:
    image: bsingh6636/another-frontend:latest
    container_name: another-frontend
    networks:
      - bsingh-net
    restart: unless-stopped
  
  another-backend:
    image: bsingh6636/another-backend:latest
    container_name: another-backend
    networks:
      - bsingh-net
    restart: unless-stopped
```

**Step 2:** Add domain mappings to nginx
```nginx
# nginx/conf.d/bsingh-multi-domain.conf

# In map section:
map $host $backend_service {
    # ... existing mappings ...
    
    # New domain
    another-domain.com                  "another-frontend:80";
    api.another-domain.com              "another-backend:8080";
}

# In HTTP server block, add to server_name:
server {
    listen 80;
    server_name 
        *.brijeshdev.space brijeshdev.space
        *.another-domain.com another-domain.com;  # Add this
}

# Do the same for HTTPS server block
```

**Step 3:** Create SSL certificate
```bash
# Edit ssl-setup/domains.conf
CERT_NAME_ANOTHER="another-domain.com"
DOMAINS_ANOTHER=(
    "another-domain.com"
    "api.another-domain.com"
)

# Or for wildcard:
DOMAINS_ANOTHER=(
    "another-domain.com"
    "*.another-domain.com"
)

# Get certificate
cd ssl-setup
sudo certbot certonly --nginx \
  -d another-domain.com \
  -d api.another-domain.com \
  --email your-email@example.com
```

**Step 4:** Configure DNS
Add A records pointing to your server IP:
- `another-domain.com` → `<YOUR_SERVER_IP>`
- `api.another-domain.com` → `<YOUR_SERVER_IP>`

**Step 5:** Deploy
```bash
./build.sh nginx
docker compose -f docker-compose.prod.yml pull
cd ssl-setup
./deploy-ssl.sh
```

---

## 🔐 SSL Certificate Strategies

### Strategy 1: Individual Certificates (Current Setup)
**Best for:** Few subdomains, explicit control

**Pros:**
- ✅ Easy to set up with HTTP-01 challenge
- ✅ No DNS API credentials needed
- ✅ Each subdomain explicitly listed

**Cons:**
- ⚠️ Must update certificate when adding subdomains
- ⚠️ Can hit Let's Encrypt rate limits with many subdomains

**Example:**
```bash
DOMAINS=(
    "brijeshdev.space"
    "api.brijeshdev.space"
    "admin.brijeshdev.space"
)
```

---

### Strategy 2: Wildcard Certificates (Recommended)
**Best for:** Many subdomains, dynamic scaling

**Pros:**
- ✅ Covers all current and future subdomains
- ✅ No need to update cert when adding subdomains
- ✅ Cleaner configuration

**Cons:**
- ⚠️ Requires DNS-01 challenge (DNS API access)
- ⚠️ Need DNS provider credentials

**Setup for Cloudflare:**
```bash
# 1. Install Cloudflare plugin
sudo apt-get install python3-certbot-dns-cloudflare

# 2. Create credentials file
mkdir -p ~/.secrets
cat > ~/.secrets/cloudflare.ini << EOF
dns_cloudflare_api_token = YOUR_API_TOKEN
EOF
chmod 600 ~/.secrets/cloudflare.ini

# 3. Get wildcard certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d brijeshdev.space \
  -d '*.brijeshdev.space' \
  --email bkushwaha.dev@gmail.com
```

**Supported DNS Providers:**
- Cloudflare (most popular)
- AWS Route53
- Google Cloud DNS
- DigitalOcean
- Namecheap
- GoDaddy

---

### Strategy 3: Multiple Certificates (Multi-Domain)
**Best for:** Multiple root domains with separate certs

**Setup:**
```bash
# Get cert for first domain
sudo certbot certonly --nginx \
  -d brijeshdev.space \
  -d '*.brijeshdev.space'

# Get cert for second domain
sudo certbot certonly --nginx \
  -d another-domain.com \
  -d '*.another-domain.com'
```

**Nginx configuration:**
```nginx
# Different server blocks for different domains
server {
    listen 443 ssl http2;
    server_name *.brijeshdev.space brijeshdev.space;
    
    ssl_certificate /etc/letsencrypt/live/brijeshdev.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/brijeshdev.space/privkey.pem;
    
    location / {
        proxy_pass http://$backend_service;
    }
}

server {
    listen 443 ssl http2;
    server_name *.another-domain.com another-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/another-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/another-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://$backend_service;
    }
}
```

---

## 🚀 Common Workflows

### Workflow 1: Quick Subdomain Addition (with wildcard cert)
```bash
# 1. Add service to docker-compose.prod.yml
# 2. Add mapping to nginx config
# 3. Deploy (no SSL update needed!)
./build.sh nginx
./ssl-setup/deploy-ssl.sh
```

### Workflow 2: Add Subdomain (without wildcard)
```bash
# 1. Add service to docker-compose.prod.yml
# 2. Add mapping to nginx config
# 3. Add domain to ssl-setup/domains.conf
# 4. Update SSL and deploy
cd ssl-setup
sudo ./setup-ssl.sh
./deploy-ssl.sh
```

### Workflow 3: Migrate to Wildcard Certificate
```bash
# 1. Setup DNS API credentials
# 2. Get wildcard certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d brijeshdev.space \
  -d '*.brijeshdev.space'

# 3. Update nginx to use wildcard cert
# Edit nginx/conf.d/bsingh-multi-domain.conf:
# ssl_certificate /etc/letsencrypt/live/brijeshdev.space/fullchain.pem;

# 4. Rebuild and deploy
./build.sh nginx
./ssl-setup/deploy-ssl.sh
```

---

## 🧪 Testing Your Configuration

### Test Nginx Configuration
```bash
# Before deploying, test nginx config
docker run --rm \
  -v $(pwd)/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:latest \
  nginx -t
```

### Test SSL Certificate
```bash
# Check certificate details
openssl s_client -connect admin.brijeshdev.space:443 -servername admin.brijeshdev.space

# Check expiry
./ssl-setup/check-ssl.sh
```

### Test Routing
```bash
# Test each domain/subdomain
curl -I https://brijeshdev.space
curl -I https://admin.brijeshdev.space
curl -I https://api.brijeshdev.space
```

---

## 📊 Current Domain Structure

```
brijeshdev.space
├── brijeshdev.space → portfolio:80
├── portfolio.brijeshdev.space → portfolio:80
├── cors-proxy.brijeshdev.space → frontend:80
├── api-cors-proxy.brijeshdev.space → backend:9090
└── getdata-cors-proxy.brijeshdev.space → getdata:9091
```

---

## 🎯 Best Practices

1. **Use Wildcard Certificates** for domains with many subdomains
2. **Keep map directive organized** - group by domain, add comments
3. **Document each mapping** - what service does what
4. **Use consistent naming** - container names match subdomains when possible
5. **Test before deploying** - use `nginx -t` to validate config
6. **Monitor SSL expiry** - run `check-ssl.sh` regularly
7. **Backup nginx configs** - version control is your friend

---

## 🐛 Troubleshooting

### Subdomain Not Routing
```bash
# 1. Check if domain is in server_name
grep "your-subdomain" nginx/conf.d/bsingh-multi-domain.conf

# 2. Check if mapping exists in map directive
# 3. Check DNS resolution
dig your-subdomain.brijeshdev.space

# 4. Check nginx logs
docker logs bsingh-nginx
```

### SSL Certificate Issues
```bash
# Check if cert covers domain
sudo certbot certificates

# If wildcard doesn't cover, ensure DNS is propagated
# Retry certificate expansion
cd ssl-setup
sudo ./setup-ssl.sh
```

### Container Not Found
```bash
# Ensure service is running
docker ps | grep admin

# Check docker network
docker network inspect bsingh-net

# Verify service name matches map
docker compose -f docker-compose.prod.yml ps
```

---

## 📚 Related Files

- [`nginx/conf.d/bsingh-multi-domain.conf`](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/nginx/conf.d/bsingh-multi-domain.conf) - Main nginx configuration
- [`ssl-setup/domains.conf`](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/ssl-setup/domains.conf) - SSL domain list
- [`docker-compose.prod.yml`](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/docker-compose.prod.yml) - Service definitions
- [`build.sh`](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/build.sh) - Build automation
