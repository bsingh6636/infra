# 🚀 Fresh Azure VM Setup Guide

Complete guide for deploying your infrastructure on a brand new Azure VM from scratch.

---

## 📋 Prerequisites

### On Azure Portal
- ✅ VM created and running
- ✅ Public IP assigned
- ✅ Ports 80 and 443 open in NSG (Network Security Group)
- ✅ SSH access configured

### On Your Local Machine
- ✅ SSH key to access the VM
- ✅ Docker Hub account credentials
- ✅ This repository cloned locally

---

## 🎯 Quick Reference

### One-Shot Deployment (Copy-Paste)
```bash
# 1. SSH into your VM
ssh azureuser@<YOUR_VM_IP>

# 2. Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 3. Clone repository
git clone https://github.com/bsingh6636/infra.git bsingh-infra
cd bsingh-infra

# 4. Create .env file
cp .env.example .env
nano .env  # Add your secrets

# 5. Pull images
docker login
docker compose -f docker-compose.prod.yml pull

# 6. Setup SSL
cd ssl-setup
sudo ./setup-ssl.sh

# 7. Deploy
./deploy-ssl.sh
```

---

## 📖 Detailed Step-by-Step Guide

### Step 1: Connect to Your VM

```bash
# From your local machine
ssh azureuser@<YOUR_VM_IP>

# Or if using SSH key
ssh -i ~/.ssh/azure_key.pem azureuser@<YOUR_VM_IP>
```

**Replace:**
- `azureuser` with your VM username
- `<YOUR_VM_IP>` with your VM's public IP

---

### Step 2: Install Docker & Docker Compose

#### Option A: Automated Install (Recommended)
```bash
# Download Docker installation script
curl -fsSL https://get.docker.com -o get-docker.sh

# Install Docker
sudo sh get-docker.sh

# Add your user to docker group (no sudo needed for docker commands)
sudo usermod -aG docker $USER

# Apply group membership (or logout/login)
newgrp docker

# Verify installation
docker --version
docker compose version
```

#### Option B: Manual Install (Ubuntu 22.04)
```bash
# Update packages
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Setup repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable Docker to start on boot
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

**Verify:**
```bash
docker --version
# Should show: Docker version 24.x.x

docker compose version
# Should show: Docker Compose version v2.x.x
```

---

### Step 3: Clone Your Repository

```bash
# Navigate to home directory
cd ~

# Clone repository
git clone https://github.com/bsingh6636/infra.git bsingh-infra

# Or if using SSH
git clone git@github.com:bsingh6636/infra.git bsingh-infra

# Enter directory
cd bsingh-infra

# Verify files
ls -la
```

---

### Step 4: Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit with your production secrets
nano .env
```

**Add your production values:**
```bash
# API Keys
STRIPE_API_KEY=sk_live_your_actual_stripe_key
SENDGRID_API_KEY=SG.your_actual_sendgrid_key

# Database connection
DB_HOST=your-db-host.com
DB_USER=your_db_user
DB_PASS=your_secure_password
DB_NAME=production_database

# Add any other environment variables your services need
NODE_ENV=production
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

---

### Step 5: Login to Docker Hub

```bash
# Login to pull your private images
docker login

# Enter your Docker Hub credentials
# Username: bsingh6636
# Password: <your-docker-hub-password>
```

---

### Step 6: Pull Application Images

```bash
# Pull all service images from Docker Hub
docker compose -f docker-compose.prod.yml pull

# This will pull:
# - bsingh6636/bsingh-backend:latest
# - bsingh6636/bsingh-frontend:latest
# - bsingh6636/bsingh-getdata:latest
# - bsingh6636/bsingh-portfolio:latest
```

**Note:** Nginx will be built locally during SSL setup (it contains SSL configuration).

---

### Step 7: Install Certbot (for SSL)

```bash
# Update package list
sudo apt-get update

# Install Certbot and nginx plugin
sudo apt-get install -y certbot python3-certbot-nginx

# Verify installation
certbot --version
```

---

### Step 8: Configure Your Domains

#### A. Edit Domain Configuration

```bash
# Navigate to SSL setup directory
cd ssl-setup

# Edit domains configuration
nano domains.conf
```

**Update with your domains:**
```bash
EMAIL="your-email@example.com"
CERT_NAME="cors-proxy.brijeshdev.space"

DOMAINS=(
    "cors-proxy.brijeshdev.space"
    "api-cors-proxy.brijeshdev.space"
    "getdata-cors-proxy.brijeshdev.space"
    "brijeshdev.space"
    "portfolio.brijeshdev.space"
    # Add any additional subdomains here
)
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

#### B. Verify DNS Records

**Before running SSL setup, ensure your DNS is configured:**

```bash
# Check DNS resolution for each domain
dig +short brijeshdev.space
dig +short cors-proxy.brijeshdev.space
dig +short api-cors-proxy.brijeshdev.space

# All should return your Azure VM's public IP
```

**If DNS not configured:**
1. Go to your domain registrar (Namecheap, GoDaddy, Cloudflare, etc.)
2. Add A records:
   - `@` → `<YOUR_VM_IP>` (for brijeshdev.space)
   - `cors-proxy` → `<YOUR_VM_IP>`
   - `api-cors-proxy` → `<YOUR_VM_IP>`
   - `getdata-cors-proxy` → `<YOUR_VM_IP>`
   - `portfolio` → `<YOUR_VM_IP>`
3. Wait for DNS propagation (5-30 minutes)

---

### Step 9: Setup SSL Certificates

```bash
# Make sure you're in ssl-setup directory
cd ~/bsingh-infra/ssl-setup

# Run SSL setup script (requires sudo for certbot)
sudo ./setup-ssl.sh
```

**What this does:**
- ✅ Obtains SSL certificates from Let's Encrypt
- ✅ Stores certificates in `/etc/letsencrypt/`
- ✅ Sets up automatic renewal
- ✅ Builds nginx with SSL configuration

**Expected output:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/cors-proxy.brijeshdev.space/fullchain.pem
```

---

### Step 10: Deploy with New Multi-Domain Configuration

#### Option A: Use New Multi-Domain Config (Recommended)

```bash
# Make sure you're in ssl-setup directory
cd ~/bsingh-infra/ssl-setup

# First, update nginx to use new multi-domain config
cd ~/bsingh-infra/nginx/conf.d

# Rename old config
mv bsingh.conf bsingh.conf.old

# Use new multi-domain config
mv bsingh-multi-domain.conf bsingh.conf

# Go back to ssl-setup
cd ~/bsingh-infra/ssl-setup

# Deploy everything
./deploy-ssl.sh
```

#### Option B: Use Original Config

```bash
# Just deploy as-is
cd ~/bsingh-infra/ssl-setup
./deploy-ssl.sh
```

**What this does:**
- ✅ Builds nginx with SSL configuration
- ✅ Starts all services (nginx, backend, frontend, getdata, portfolio)
- ✅ Configures HTTPS with auto HTTP redirect
- ✅ Sets restart policies

---

### Step 11: Verify Deployment

#### Check Container Status
```bash
# List running containers
docker ps

# You should see 5 containers:
# - bsingh-nginx
# - bsingh-backend
# - bsingh-frontend
# - bsingh-getdata
# - bsingh-portfolio
```

#### Check Container Logs
```bash
# View all logs
docker compose -f ~/bsingh-infra/docker-compose.prod.yml logs

# View specific service logs
docker logs bsingh-nginx
docker logs bsingh-backend
docker logs bsingh-frontend

# Follow logs in real-time
docker logs -f bsingh-nginx
```

#### Test Services Locally
```bash
# Test from inside the VM
curl -I http://localhost
# Should redirect to HTTPS

curl -I https://localhost
# Should return 200 OK (might show certificate warning, that's okay)
```

#### Test from Your Browser
Open your browser and test each domain:
- `https://brijeshdev.space` - Should show portfolio
- `https://cors-proxy.brijeshdev.space` - Should show frontend
- `https://api-cors-proxy.brijeshdev.space` - Should show API
- `https://getdata-cors-proxy.brijeshdev.space` - Should show getdata service

---

### Step 12: Verify SSL Certificates

```bash
cd ~/bsingh-infra/ssl-setup

# Check SSL certificate status
./check-ssl.sh

# Should show:
# - Certificate valid
# - Expiry date (90 days from now)
# - All domains covered
```

---

## 🔄 Updating Your Deployment

### When You Make Changes

#### Option A: Update Specific Service
```bash
# SSH into VM
ssh azureuser@<YOUR_VM_IP>

# Navigate to project
cd ~/bsingh-infra

# Pull latest version from Git
git pull origin main

# Pull updated service image
docker compose -f docker-compose.prod.yml pull backend

# Restart specific service
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

#### Option B: Update All Services
```bash
# SSH into VM
ssh azureuser@<YOUR_VM_IP>

# Navigate to project
cd ~/bsingh-infra

# Pull latest code
git pull origin main

# Pull all images
docker compose -f docker-compose.prod.yml pull

# Deploy
cd ssl-setup
./deploy-ssl.sh
```

#### Option C: Update Nginx Configuration Only
```bash
# SSH into VM
ssh azureuser@<YOUR_VM_IP>

# Navigate to project
cd ~/bsingh-infra

# Pull latest code
git pull origin main

# Rebuild nginx
docker compose -f docker-compose.prod.yml build nginx

# Restart nginx
docker compose -f docker-compose.prod.yml restart nginx
```

---

## 🛡️ Security Hardening (Recommended)

### 1. Setup Firewall (UFW)
```bash
# Install UFW
sudo apt-get install -y ufw

# Allow SSH (IMPORTANT - do this first!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### 2. Setup Automatic Security Updates
```bash
# Install unattended upgrades
sudo apt-get install -y unattended-upgrades

# Enable automatic updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Setup Fail2ban (SSH Protection)
```bash
# Install fail2ban
sudo apt-get install -y fail2ban

# Copy default config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Start service
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status
```

---

## 📊 Monitoring & Maintenance

### Check Service Status
```bash
# Container status
docker ps -a

# Service health
docker compose -f ~/bsingh-infra/docker-compose.prod.yml ps

# System resources
docker stats

# Disk usage
df -h
docker system df
```

### View Logs
```bash
# All services
docker compose -f ~/bsingh-infra/docker-compose.prod.yml logs -f

# Specific service
docker logs -f bsingh-backend

# Last 100 lines
docker logs --tail 100 bsingh-nginx
```

### SSL Certificate Renewal
```bash
# Certificates auto-renew, but to test:
sudo certbot renew --dry-run

# Force renewal (if needed)
sudo certbot renew --force-renewal
```

---

## 🐛 Troubleshooting

### Containers Not Starting
```bash
# Check logs
docker compose -f ~/bsingh-infra/docker-compose.prod.yml logs

# Check specific container
docker logs bsingh-backend

# Check Docker daemon
sudo systemctl status docker
```

### Port Already in Use
```bash
# Check what's using port 80
sudo lsof -i :80

# If apache or nginx running
sudo systemctl stop apache2
sudo systemctl stop nginx
sudo systemctl disable apache2
sudo systemctl disable nginx
```

### SSL Certificate Issues
```bash
# Check certificate
sudo certbot certificates

# Check DNS
dig +short brijeshdev.space

# Check if port 80 is accessible (needed for Let's Encrypt)
curl -I http://brijeshdev.space/.well-known/acme-challenge/test
```

### Can't Access Services
```bash
# Check Azure NSG rules
# Azure Portal → VM → Networking → Check ports 80, 443 are open

# Check local firewall
sudo ufw status

# Check containers are running
docker ps

# Check nginx config
docker exec bsingh-nginx nginx -t
```

---

## 🎯 Post-Deployment Checklist

- [ ] All containers running (`docker ps`)
- [ ] HTTPS working on all domains
- [ ] HTTP redirects to HTTPS
- [ ] SSL certificate valid (`./check-ssl.sh`)
- [ ] No errors in nginx logs
- [ ] Backend API responding
- [ ] Frontend loading correctly
- [ ] Environment variables configured
- [ ] Firewall configured (ports 80, 443, 22)
- [ ] Automatic updates enabled
- [ ] Monitoring setup (optional)

---

## 📚 Useful Commands Reference

```bash
# Start all services
docker compose -f ~/bsingh-infra/docker-compose.prod.yml up -d

# Stop all services
docker compose -f ~/bsingh-infra/docker-compose.prod.yml down

# Restart all services
docker compose -f ~/bsingh-infra/docker-compose.prod.yml restart

# View logs
docker compose -f ~/bsingh-infra/docker-compose.prod.yml logs -f

# Pull latest images
docker compose -f ~/bsingh-infra/docker-compose.prod.yml pull

# Check SSL
cd ~/bsingh-infra/ssl-setup && ./check-ssl.sh

# Update deployment
cd ~/bsingh-infra/ssl-setup && ./deploy-ssl.sh

# Clean up unused Docker resources
docker system prune -a
```

---

## 🚀 Quick Deploy Script (Optional)

Create a deployment script for faster updates:

```bash
# Create script
cat > ~/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Deploying infrastructure..."

cd ~/bsingh-infra

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Pulling Docker images..."
docker compose -f docker-compose.prod.yml pull

echo "🔄 Deploying with SSL..."
cd ssl-setup
./deploy-ssl.sh

echo "✅ Deployment complete!"
docker ps
EOF

# Make executable
chmod +x ~/deploy.sh

# Use it
~/deploy.sh
```

---

## 🌐 Adding New Subdomains (Quick Reference)

Using the new multi-domain configuration:

```bash
# 1. Add DNS A record (in your domain registrar)
# 2. Add to domains.conf
nano ~/bsingh-infra/ssl-setup/domains.conf

# 3. Add to nginx map
nano ~/bsingh-infra/nginx/conf.d/bsingh.conf
# Add line: admin.brijeshdev.space    "admin:3000";

# 4. Update SSL
cd ~/bsingh-infra/ssl-setup
sudo ./setup-ssl.sh

# 5. Add service to docker-compose.prod.yml
nano ~/bsingh-infra/docker-compose.prod.yml

# 6. Deploy
./deploy-ssl.sh
```

---

## 📖 Related Documentation

- [Multi-Domain Guide](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/docs/MULTI_DOMAIN_GUIDE.md) - Managing multiple domains
- [Migration Guide](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/docs/MIGRATION_GUIDE.md) - Switching to new config
- [Main README](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/README.md) - Project overview
- [SSL Setup](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/ssl-setup/README.md) - SSL details

---

**Need help?** Check the troubleshooting section or review the logs!

**Deployment successful?** 🎉 Your infrastructure is now live!
