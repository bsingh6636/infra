# Quick Deploy to Azure VM

## Prerequisites ✅
- Docker installed on Azure VM
- Repository cloned at `~/bsingh-infra`
- You are SSH'd into your Azure VM

---

## 🚀 Deploy in 3 Steps

### Step 1: Navigate to Project Directory
```bash
cd ~/bsingh-infra/
```

### Step 2: Create Environment File
```bash
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

### Step 3: Pull & Start Containers
```bash
# Login to Docker Hub
docker login
# Username: bsingh6636
# Password: <your-docker-hub-password>

# Pull all images (they'll auto-select AMD64 for your server)
docker compose -f docker-compose.prod.yml pull

# Start all containers in background
docker compose -f docker-compose.prod.yml up -d

# Verify they're running
docker ps
```

---

## ✅ Verify Deployment

### Check Container Status
```bash
# See all running containers
docker ps

# You should see 4 containers:
# - bsingh-nginx
# - bsingh-backend
# - bsingh-frontend
# - bsingh-getdata
```

### Check Logs
```bash
# View all logs
docker compose -f docker-compose.prod.yml logs

# Follow logs in real-time
docker compose -f docker-compose.prod.yml logs -f

# Check specific service
docker compose -f docker-compose.prod.yml logs backend
```

### Test Services
```bash
# Test from inside the VM
curl http://localhost/          # Frontend
curl http://localhost/api/      # Backend
curl http://localhost/getdata/  # GetData

# Get your VM's public IP
curl ifconfig.me

# Then test from your browser:
# http://<your-azure-ip>/
# http://<your-azure-ip>/api/
# http://<your-azure-ip>/getdata/
```

---

## 🔧 Management Commands

### Stop All Services
```bash
docker compose -f docker-compose.prod.yml down
```

### Restart Services
```bash
docker compose -f docker-compose.prod.yml restart
```

### Update to Latest Images
```bash
# Pull latest
docker compose -f docker-compose.prod.yml pull

# Restart with new images
docker compose -f docker-compose.prod.yml up -d
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

### Permission Denied?
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login again, or use sudo:
sudo docker compose -f docker-compose.prod.yml up -d
```

### Images Not Pulling?
```bash
# Make sure you're logged in
docker login

# Try pulling manually
docker pull bsingh6636/bsingh-nginx:latest
```

---

## 📊 Your Services

Once running, access at:

| Service | URL |
|---------|-----|
| **Frontend** | `http://<azure-ip>/` |
| **Backend API** | `http://<azure-ip>/api/` |
| **GetData API** | `http://<azure-ip>/getdata/` |

Replace `<azure-ip>` with your VM's public IP address.

---

## 🎯 Complete One-Liner

If `.env` is ready, deploy everything in one command:

```bash
cd ~/bsingh-infra/ && \
docker login && \
docker compose -f docker-compose.prod.yml pull && \
docker compose -f docker-compose.prod.yml up -d && \
docker ps
```

