# CORS-Proxy Infrastructure

![SSL Status](https://img.shields.io/badge/SSL-Secure%20%26%20Encrypted-success)
![Docker](https://img.shields.io/badge/Docker-Multi--Platform-blue)
![Multi-Domain](https://img.shields.io/badge/Multi--Domain-Production%20Ready-green)

Production-ready, scalable multi-domain Docker infrastructure with map-based routing for deploying services across AWS, Azure, GCP, and any cloud platform.

---

## 🚀 Quick Start

### Local Development
```bash
docker compose up -d
```

### Production Deployment (Fresh Azure VM)
```bash
# Complete step-by-step guide available:
# See docs/FRESH_VM_SETUP.md

# Quick version:
./build.sh --parallel          # Build & push images (local machine)
# Then on Azure VM:
cd ssl-setup
sudo ./setup-ssl.sh           # SSL certificates (first time)
./deploy-ssl.sh               # Deploy with HTTPS
```

---

## ✨ Key Features

- ✅ **Map-based multi-domain routing** - Add subdomains in 1 line vs 60+ lines
- ✅ **Scalable architecture** - Unlimited domains & subdomains
- ✅ **Multi-platform builds** - Works on Intel, ARM, AWS, Azure, GCP
- ✅ **Wildcard SSL support** - Secure all subdomains automatically
- ✅ **Parallel builds** - 3-4x faster than sequential (29 sec cached!)
- ✅ **Production-ready** - HSTS, security headers, auto-restart
- ✅ **Comprehensive docs** - Fresh VM setup to adding new services

---

## 📚 Documentation

### Getting Started
- [**Fresh VM Setup Guide**](docs/FRESH_VM_SETUP.md) - Complete Azure/VPS deployment from scratch
- [**Migration Guide**](docs/MIGRATION_GUIDE.md) - Switch to new multi-domain config

### Managing Infrastructure
- [**Multi-Domain Guide**](docs/MULTI_DOMAIN_GUIDE.md) - Add domains & subdomains
- [**Add New Service**](docs/ADD_NEW_SERVICE.md) - Add new applications to the stack
- [**SSL Setup**](ssl-setup/README.md) - HTTPS certificate management
- [**Security Checklist**](.gemini/antigravity/brain/1cba08ad-e101-4881-a2f5-9daca98be6de/security_checklist.md) - Keep your repo safe

### Advanced
- [**Wildcard Subdomain Config**](docs/WILDCARD_SUBDOMAIN_CONFIG.md) - Handle random subdomains
- [**Build Guide**](docs/BUILD_GUIDE.md) - Custom build configurations
- [**Private Repo Builds**](docs/PRIVATE_REPO_BUILDS.md) - Build images from private repositories

---

## 🏗️ Project Structure

```
bsingh-infra/
├── README.md                      # This file
├── build.sh                       # Multi-platform build automation (6 services)
├── docker-compose.yml             # Development environment
├── docker-compose.prod.yml        # Production deployment
├── .env.example                   # Environment variables template
├── nginx/                         # Nginx reverse proxy
│   ├── Dockerfile
│   └── conf.d/
│       ├── bsingh.conf           # Legacy config
│       └── bsingh-multi-domain.conf  # ⭐ New map-based routing
├── ssl-setup/                     # SSL/HTTPS Automation
│   ├── setup-ssl.sh              # Get Let's Encrypt certificates
│   ├── deploy-ssl.sh             # Deploy with HTTPS
│   ├── check-ssl.sh              # Verify certificates
│   ├── domains.conf              # SSL domain configuration
│   └── domains-multi.conf        # Multi-domain SSL template
└── docs/                          # Comprehensive documentation
    ├── FRESH_VM_SETUP.md
    ├── MULTI_DOMAIN_GUIDE.md
    ├── MIGRATION_GUIDE.md
    ├── ADD_NEW_SERVICE.md
    └── WILDCARD_SUBDOMAIN_CONFIG.md
```

---

## 🌐 Live Domains

| Domain | Service | Status |
|--------|---------|--------|
| `https://brijeshdev.space` | Portfolio | ✅ |
| `https://portfolio.brijeshdev.space` | Portfolio | ✅ |
| `https://cors-proxy.brijeshdev.space` | Frontend App | ✅ |
| `https://api-cors-proxy.brijeshdev.space` | Backend API | ✅ |
| `https://getdata-cors-proxy.brijeshdev.space` | GetData Service | ✅ |
| `https://ranju.brijeshdev.space` | Bae Portfolio | ✅ |

**Wildcard DNS:** `*.brijeshdev.space` → Auto-redirects undefined subdomains to main domain

---

## 🔧 Common Commands

### Build Images
```bash
# Build all services (6 images: nginx, backend, frontend, getdata, portfolio, bae-portfolio)
./build.sh --parallel              # Parallel build (fastest, 3-4 min first time, 30s cached)
./build.sh                         # Sequential build

# Build specific service
./build.sh nginx                   # Just nginx
./build.sh backend frontend        # Multiple services

# Platform options
./build.sh -p linux/amd64 all      # Single platform (faster dev builds)
./build.sh --no-push nginx         # Local build only (don't push to Docker Hub)

# Help
./build.sh --help
```

### Development
```bash
# Start services
docker compose up -d               # All services
docker compose up -d backend       # Specific service

# View logs
docker compose logs -f             # All services
docker compose logs -f nginx       # Specific service

# Stop services
docker compose down                # All services
docker compose stop backend        # Specific service

# Rebuild
docker compose build               # Rebuild changed services
docker compose build --no-cache    # Force rebuild
```

### Production (with SSL)
```bash
# Deploy or update
cd ssl-setup
./deploy-ssl.sh                    # Deploy all services with HTTPS

# SSL management
sudo ./setup-ssl.sh                # Get/renew SSL certificates
./check-ssl.sh                     # Check certificate status
sudo certbot renew                 # Manual renewal (auto-renews normally)

# Service management
docker compose -f docker-compose.prod.yml restart          # Restart all
docker compose -f docker-compose.prod.yml restart nginx    # Restart specific
docker compose -f docker-compose.prod.yml logs -f          # View logs
docker compose -f docker-compose.prod.yml pull             # Pull latest images
```

---

## 📦 Docker Images

All images support **multi-platform** (AMD64 + ARM64):

- `bsingh6636/bsingh-nginx:latest` - Reverse proxy with SSL
- `bsingh6636/bsingh-backend:latest` - Backend API (EduCors-Helper)
- `bsingh6636/bsingh-frontend:latest` - Frontend App (EduCors-Helper)
- `bsingh6636/bsingh-getdata:latest` - GetData Service (EduCors-Helper)
- `bsingh6636/bsingh-portfolio:latest` - Portfolio Website
- `bsingh6636/bsingh-bae-portfolio:latest` - Bae Portfolio (cuddly-octo-funicular)

**Total:** 6 services, all cloud-ready

---

## ⚡ Performance

### Build Performance
| Build Type | Time | Description |
|------------|------|-------------|
| **First build (parallel)** | ~3-4 min | Building from scratch, all platforms |
| **Cached build (parallel)** | ~30 sec | No code changes, just manifest updates |
| **Sequential build** | ~8-12 min | One image at a time |
| **Single platform** | ~2 min | Faster for local development |

### Features
- ✅ Multi-platform builds (works on Mac, Windows, Linux, ARM, x86)
- ✅ Parallel builds (build 6 images simultaneously)
- ✅ BuildKit caching (speeds up repeated builds)
- ✅ Registry cache support (pull cache from Docker Hub)
- ✅ Layer caching (reuse unchanged layers)

---

## 🛠️ Configuration

### Environment Variables
```bash
# Create from template
cp .env.example .env

# Edit with your production values
nano .env
```

**Important variables:**
```bash
# API Keys
STRIPE_API_KEY=your_stripe_api_key
SENDGRID_API_KEY=your_sendgrid_api_key

# Database
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASS=your_db_password
```

**Note:** `.env` is in `.gitignore` - never commit secrets!

### Adding a New Subdomain
**Super simple with map-based routing:**

```nginx
# Edit nginx/conf.d/bsingh-multi-domain.conf
# Just add one line:
admin.brijeshdev.space  "admin:3000";
```

**See [docs/ADD_NEW_SERVICE.md](docs/ADD_NEW_SERVICE.md) for complete guide**

### Adding a New Root Domain
See [docs/MULTI_DOMAIN_GUIDE.md](docs/MULTI_DOMAIN_GUIDE.md#adding-a-new-root-domain)

---

## 🌍 Multi-Domain Architecture

### Traditional Config (Old)
```nginx
# Adding one subdomain = 60+ lines of code
server { listen 80; ... }
server { listen 443; ... }
# SSL configuration, proxy settings, headers...
# Repeat for EVERY subdomain! 😰
```

### Map-Based Config (New) ⭐
```nginx
# Adding one subdomain = 1 line!
map $host $backend_service {
    new-subdomain.domain.com  "service:port";
}
```

**Benefits:**
- 1 line to add subdomain vs 60+ lines
- Centralized SSL configuration
- Easy to maintain
- Scales to unlimited domains

---

## 🐛 Troubleshooting

### Port 80/443 in use
```bash
sudo systemctl stop nginx apache2
docker compose up -d
```

### Containers not starting
```bash
# Check logs
docker compose logs

# Check status
docker ps -a

# Check specific service
docker logs bsingh-backend
```

### Can't access domain
```bash
# Check DNS
dig +short yourdomain.com

# Check if nginx is running
docker ps | grep nginx

# Check nginx logs
docker logs bsingh-nginx

# Test locally
curl -I http://localhost
```

### SSL errors
```bash
# Check certificates
sudo certbot certificates

# Renew manually
sudo certbot renew

# Check SSL setup
cd ssl-setup
./check-ssl.sh
```

### Build failures
```bash
# Check build logs
cat /tmp/build-*.log

# Try single platform
./build.sh -p linux/amd64 nginx

# Clean rebuild
docker builder prune -a
./build.sh nginx
```

**More help:** [docs/FRESH_VM_SETUP.md#troubleshooting](docs/FRESH_VM_SETUP.md)

---

## 📖 Deployment Workflow

**Typical workflow for making changes:**

### 1. Update Application Code
```bash
# Make changes in your app repositories:
# - EduCors-Helper (backend/frontend/getdata)
# - myPortfolio
# - cuddly-octo-funicular

# Commit and push
git add .
git commit -m "Your changes"
git push origin main
```

### 2. Build & Push Images
```bash
# On your local machine
cd ~/Documents/Brijesh/infra
./build.sh --parallel    # Builds from latest GitHub code
```

### 3. Deploy on Server
```bash
# SSH into your Azure VM
ssh azureuser@your-vm-ip

# Pull latest images
cd ~/infra
docker compose -f docker-compose.prod.yml pull

# Restart services
docker compose -f docker-compose.prod.yml up -d
```

**For infrastructure changes** (nginx, domains, SSL):
```bash
# Local machine
git add .
git commit -m "Infrastructure changes"
git push

# Azure VM
cd ~/infra
git pull
cd ssl-setup
./deploy-ssl.sh
```

---

## 🔒 Security

- ✅ **HTTPS enforced** - All HTTP traffic redirected to HTTPS
- ✅ **HSTS enabled** - Strict Transport Security headers
- ✅ **SSL/TLS** - Let's Encrypt certificates, auto-renewal
- ✅ **Security headers** - X-Frame-Options, X-Content-Type-Options, etc.
- ✅ **Secrets management** - `.env` in `.gitignore`, never committed
- ✅ **Updated .gitignore** - Blocks SSH keys, SSL private keys, credentials

**See:** [Security Checklist](.gemini/antigravity/brain/1cba08ad-e101-4881-a2f5-9daca98be6de/security_checklist.md)

---

## 🤝 Contributing

When adding new services:
1. Add to `docker-compose.prod.yml`
2. Add routing in `nginx/conf.d/bsingh-multi-domain.conf` (1 line!)
3. Add to `ssl-setup/domains.conf`
4. Build and deploy

**See:** [docs/ADD_NEW_SERVICE.md](docs/ADD_NEW_SERVICE.md)

---

## 📝 License

This infrastructure is designed for deploying the following projects:
- [EduCors-Helper](https://github.com/bsingh6636/EduCors-Helper) - CORS proxy service
- [myPortfolio](https://github.com/bsingh6636/myPortfolio) - Portfolio website
- [cuddly-octo-funicular](https://github.com/bsingh6636/cuddly-octo-funicular) - Bae Portfolio

---

**Built with ❤️ for universal cloud deployment**

**Supports:** AWS · Azure · GCP · DigitalOcean · Any Linux VPS
