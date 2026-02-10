# 🚀 Adding a New Service Guide

Complete step-by-step guide for adding a new service to your infrastructure.

---

## 📋 Overview

Adding a new service involves 4 main steps:
1. **Add to Docker Compose** - Define the service
2. **Add to Nginx Routing** - Configure domain routing
3. **Add to SSL Certificate** - Include in SSL domains
4. **Build & Deploy** - Push image and deploy

**Example:** We'll add a service called `bsingh` at `bsingh.brijeshdev.space`

---

## Step 1: Add to Docker Compose

### File: `docker-compose.prod.yml`

Add your new service at the end of the services section:

```yaml
  bsingh:
    image: bsingh6636/bsingh-bsingh:latest
    container_name: bsingh-bsingh
    networks:
      - bsingh-net
    env_file:
      - .env
    restart: unless-stopped
```

**Also update nginx dependencies** (line 17-22):
```yaml
  nginx:
    depends_on:
      - backend
      - frontend
      - getdata
      - portfolio
      - bae-portfolio
      - bsingh  # Add your new service here
```

---

## Step 2: Add to Nginx Routing

### File: `nginx/conf.d/bsingh-multi-domain.conf`

Add routing in the `map` directive (around line 17):

```nginx
map $host $backend_service {
    default                              "redirect";
    
    brijeshdev.space                     "portfolio:80";
    portfolio.brijeshdev.space           "portfolio:80";
    cors-proxy.brijeshdev.space          "frontend:80";
    api-cors-proxy.brijeshdev.space      "backend:9090";
    getdata-cors-proxy.brijeshdev.space  "getdata:9091";
    bsingh.brijeshdev.space              "bsingh:80";  # ← Add this line
}
```

**Format:** `subdomain.domain.com  "container-name:port";`

**Port guide:**
- Most web apps: `:80`
- Backend APIs: `:9090` or `:3000` (depends on your app)
- Custom port: Use whatever your app listens on

---

## Step 3: Add to SSL Certificate

### File: `ssl-setup/domains.conf`

Add your subdomain to the DOMAINS array:

```bash
DOMAINS=(
    "cors-proxy.brijeshdev.space"
    "api-cors-proxy.brijeshdev.space"
    "getdata-cors-proxy.brijeshdev.space"
    "brijeshdev.space"
    "portfolio.brijeshdev.space"
    "bsingh.brijeshdev.space"  # ← Add this line
)
```

---

## Step 4: Build & Deploy

### A. Build Docker Image (Local Machine)

If you need to build from a different repo:

```bash
# Update build.sh if needed
# Or build manually:
docker build -t bsingh6636/bsingh-bsingh:latest ./path/to/bsingh
docker push bsingh6636/bsingh-bsingh:latest
```

### B. Deploy on Azure VM

```bash
# 1. SSH into VM
ssh azureuser@<YOUR_VM_IP>

# 2. Pull latest configuration
cd ~/infra
git pull origin main

# 3. Pull the new Docker image
docker pull bsingh6636/bsingh-bsingh:latest

# 4. Update SSL certificate (add new subdomain)
cd ssl-setup
sudo ./setup-ssl.sh

# 5. Deploy all services
./deploy-ssl.sh
```

---

## ✅ Verification

### Check Service Status
```bash
# Check if container is running
docker ps | grep bsingh

# Check logs
docker logs bsingh-bsingh

# Check nginx routing
docker exec bsingh-nginx nginx -t
```

### Test Access
```bash
# Test from VM
curl -I https://bsingh.brijeshdev.space

# Should return HTTP/2 200 OK
```

### Test in Browser
Open `https://bsingh.brijeshdev.space` - should load your service!

---

## 🎯 Quick Checklist

Before deploying, verify you've:

- [ ] Added service to `docker-compose.prod.yml`
- [ ] Updated nginx dependencies in docker-compose
- [ ] Added routing in `nginx/conf.d/bsingh-multi-domain.conf`
- [ ] Added domain to `ssl-setup/domains.conf`
- [ ] Built and pushed Docker image
- [ ] Added DNS A record (if not using wildcard)
- [ ] Committed changes to Git
- [ ] Deployed on Azure VM
- [ ] Updated SSL certificate
- [ ] Tested the subdomain

---

## 📊 File Locations Summary

| What to Update | File Path | What to Add |
|----------------|-----------|-------------|
| Service Definition | `docker-compose.prod.yml` | Service block + dependency |
| Nginx Routing | `nginx/conf.d/bsingh-multi-domain.conf` | Map entry |
| SSL Domains | `ssl-setup/domains.conf` | Domain in DOMAINS array |
| Docker Image | DockerHub | Build & push image |

---

## 🔧 Advanced: Custom Configuration

### Custom Port
If your service runs on a different port (e.g., 3000):

```nginx
bsingh.brijeshdev.space  "bsingh:3000";
```

### Environment Variables
Add to `.env` on Azure VM:
```bash
BSINGH_API_KEY=your_key
BSINGH_DB_HOST=localhost
```

### Custom Volume Mounts
In `docker-compose.prod.yml`:
```yaml
  bsingh:
    image: bsingh6636/bsingh-bsingh:latest
    volumes:
      - ./bsingh-data:/app/data
    environment:
      - NODE_ENV=production
```

---

## 🐛 Troubleshooting

### Service Not Starting
```bash
# Check logs
docker logs bsingh-bsingh

# Check if image exists
docker images | grep bsingh

# Restart service
docker compose -f docker-compose.prod.yml restart bsingh
```

### Can't Access Subdomain
```bash
# Check DNS
dig +short bsingh.brijeshdev.space

# Check nginx routing
docker exec bsingh-nginx cat /etc/nginx/conf.d/bsingh-multi-domain.conf | grep bsingh

# Check SSL certificate
sudo certbot certificates
```

### SSL Error
```bash
# Verify domain is in SSL certificate
sudo certbot certificates

# If missing, update SSL
cd ~/infra/ssl-setup
sudo ./setup-ssl.sh
```

---

## 📝 Example: Complete Workflow

### Adding "admin" service at admin.brijeshdev.space

**1. docker-compose.prod.yml:**
```yaml
  admin:
    image: bsingh6636/bsingh-admin:latest
    container_name: bsingh-admin
    networks:
      - bsingh-net
    restart: unless-stopped
```

**2. nginx/conf.d/bsingh-multi-domain.conf:**
```nginx
admin.brijeshdev.space  "admin:80";
```

**3. ssl-setup/domains.conf:**
```bash
DOMAINS=(
    # ... existing domains ...
    "admin.brijeshdev.space"
)
```

**4. Deploy:**
```bash
git push origin main
# On Azure VM:
cd ~/infra && git pull
cd ssl-setup && sudo ./setup-ssl.sh && ./deploy-ssl.sh
```

**Done!** Access at `https://admin.brijeshdev.space` 🎉

---

## 🔄 Removing a Service

To remove a service:

1. Remove from `docker-compose.prod.yml`
2. Remove from nginx map in `bsingh-multi-domain.conf`
3. Optionally remove from `domains.conf` (SSL will still work)
4. Redeploy: `./ssl-setup/deploy-ssl.sh`
5. Remove DNS record (optional)

---

**Need help?** Check the other guides:
- [Multi-Domain Guide](MULTI_DOMAIN_GUIDE.md)
- [Fresh VM Setup](FRESH_VM_SETUP.md)
- [Migration Guide](MIGRATION_GUIDE.md)
