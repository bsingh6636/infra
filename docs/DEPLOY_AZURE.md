# Quick Deploy to Azure VM

## Prerequisites ✅
- Docker installed on Azure VM
- Repository cloned at `~/bsingh-infra`
- You are SSH'd into your Azure VM

cd ~/bsingh-infra/
```

### Step 2: Create Environment File
# Copy example and edit with your secrets
cp .env.example .env
nano .env
```

**Add your production values:**
```bash
NODE_ENV=production
DATABASE_URL=your-production-database-url
API_KEY=your-api-key
# Add any other secrets your apps need
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

### Step 3: Pull Application Images
```bash
# Login to Docker Hub
docker login

# Pull application images (Nginx is built locally for SSL)
docker compose -f docker-compose.prod.yml pull backend frontend getdata portfolio
```

### Step 4: Setup SSL & Deploy
SSL configuration is handled separately. Please refer to:
👉 **[ssl-setup/README.md](../ssl-setup/README.md)**

Quick summary:
1. Edit `ssl-setup/domains.conf`
2. Run `sudo ./ssl-setup/setup-ssl.sh`
3. Run `./ssl-setup/deploy-ssl.sh`

---

## ✅ Verify Deployment

### Check Container Status
```bash
# See all running containers
docker ps

# You should see 5 containers:
# - bsingh-nginx
# - bsingh-backend
# - bsingh-frontend
# - bsingh-getdata
# - bsingh-portfolio
```

### Check Logs
```bash
# View all logs
docker compose -f docker-compose.prod.yml logs

# Follow logs in real-time
docker compose -f docker-compose.prod.yml logs -f
```

### Test Services (HTTPS)
```bash
# Test from inside the VM
curl -k https://localhost/          # Frontend
curl -k https://localhost/api/      # Backend

# Get your VM's public IP
curl ifconfig.me

# Then test from your browser:
# https://<your-domain>/
# https://cors-proxy.brijeshdev.space
```

---

## 🔧 Management Commands

### Stop All Services
```bash
docker compose -f docker-compose.prod.yml down
```

### Restart All Services
```bash
docker compose -f docker-compose.prod.yml restart
# OR for a full recreation
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Update Deployment (All Services)
```bash
# 1. Pull latest app images
docker compose -f docker-compose.prod.yml pull backend frontend getdata portfolio

# 2. Re-deploy with SSL script
./ssl-setup/deploy-ssl.sh
```

### Update & Restart Specific Service
```bash
# Example: Update only Backend
docker compose -f docker-compose.prod.yml pull backend
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

### Remove Everything (including volumes)
```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## 🐛 Troubleshooting

### Containers Not Starting?
```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs

# Check specific container
docker logs bsingh-backend
```

### Port Already in Use?
```bash
# See what's using port 80
sudo lsof -i :80

# Stop conflicting service (e.g., apache)
sudo systemctl stop apache2
```

### SSL Issues?
```bash
# Check certificate status
./ssl-setup/check-ssl.sh
```

---

---
## ➕ Adding New Services

To add a new service (e.g., `admin-dashboard` on port `3000`), follow these steps:

### 1. Update `docker-compose.yml` (Local) & `docker-compose.prod.yml` (Prod)
Add your service block:
```yaml
  admin:
    image: your-username/admin-dashboard:latest
    container_name: bsingh-admin
    networks:
      - bsingh-net
    environment:
      - PORT=3000
```

### 2. Update Nginx Config (`nginx/conf.d/bsingh.conf`)
Add a new server block to route traffic:
```nginx
server {
    listen 80;
    server_name admin.brijeshdev.space;

    location / {
        proxy_pass http://admin:3000;  # Container name & port
        # ... standard proxy headers ...
    }
}
```

### 3. Deploy
```bash
# 1. Add new domain to ssl-setup/domains.conf
# 2. Update certificates & deploy
sudo ./ssl-setup/setup-ssl.sh
./ssl-setup/deploy-ssl.sh
```

---

## 📊 Your Services

Once running, access at:

| Service | URL |
|---------|-----|
| **Frontend** | `https://cors-proxy.brijeshdev.space` |
| **Backend API** | `https://api-cors-proxy.brijeshdev.space` |
| **GetData API** | `https://getdata-cors-proxy.brijeshdev.space` |
| **Portfolio** | `https://portfolio.brijeshdev.space` |

---

## 🎯 Complete One-Liner

If `.env` is ready, deploy everything in one command:

```bash
cd ~/bsingh-infra/ && \
docker login && \
docker compose -f docker-compose.prod.yml pull backend frontend getdata && \
cd ssl-setup && \
sudo ./setup-ssl.sh && \
./deploy-ssl.sh
```

