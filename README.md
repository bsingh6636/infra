# CORS-Proxy Infrastructure

![SSL Status](https://img.shields.io/badge/SSL-Secure%20%26%20Encrypted-success)
![Docker](https://img.shields.io/badge/Docker-Multi--Platform-blue)

Production-ready, multi-platform Docker infrastructure for deploying CORS proxy services across AWS, Azure, GCP, and any cloud platform.

## 🚀 Quick Start

### Local Development
```bash
docker compose up -d
```

### Production Deployment
```bash
# 1. Build & push multi-platform images (backend/frontend/getdata)
./build.sh --parallel

# 2. Deploy on cloud VM with SSL
cd ssl-setup
sudo ./setup-ssl.sh    # First time only
./deploy-ssl.sh        # Deploy updates
```

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [**SSL Setup**](ssl-setup/README.md) | **Free HTTPS certificates with Let's Encrypt** |
| [Build Guide](docs/BUILD_GUIDE.md) | Multi-platform builds, performance optimization |
| [Azure Deployment](docs/DEPLOY_AZURE.md) | Step-by-step cloud deployment guide |

---

## 🏗️ Project Structure

```
bsingh-infra/
├── README.md                    # This file
├── build.sh                     # Multi-platform build automation
├── docker-compose.yml           # Development environment
├── docker-compose.prod.yml      # Production deployment
├── .env.example                 # Environment variables template
├── nginx/                       # Nginx reverse proxy
│   ├── Dockerfile
│   └── conf.d/
│       └── bsingh.conf         # Domain routing config
├── ssl-setup/                   # SSL/HTTPS Automation
│   ├── setup-ssl.sh            # Get certificates
│   ├── deploy-ssl.sh           # Activate HTTPS
│   └── ...
└── docs/                        # Documentation
    ├── BUILD_GUIDE.md
    ├── DEPLOY_AZURE.md
    └── buildkit.toml
```

---

## 🌐 Live Domains

| Domain | Service |
|--------|---------|
| `https://cors-proxy.brijeshdev.space` | Frontend App |
| `https://api-cors-proxy.brijeshdev.space` | Backend API |
| `https://getdata-cors-proxy.brijeshdev.space` | GetData Service |

---

## 🔧 Common Commands

### Build Images
```bash
./build.sh --parallel              # Build all (fastest, 3-4 min)
./build.sh nginx                   # Build specific image
./build.sh -p linux/amd64 all      # Single platform (faster)
./build.sh --no-push nginx         # Local build only
```

### Development
```bash
docker compose up -d               # Start all services
docker compose logs -f             # View logs
docker compose down                # Stop all services
```

### Production (with SSL)
```bash
# Deploy or update services
./ssl-setup/deploy-ssl.sh

# Check certificate status
./ssl-setup/check-ssl.sh

# Restart services
docker compose -f docker-compose.prod.yml restart
```

---

## 📦 Docker Images

Multi-platform support (AMD64 + ARM64):

- `bsingh6636/bsingh-nginx:latest`
- `bsingh6636/bsingh-backend:latest`
- `bsingh6636/bsingh-frontend:latest`
- `bsingh6636/bsingh-getdata:latest`

---

## ⚡ Performance

- ✅ Multi-platform builds (Mac, AWS, Azure, GCP compatible)
- ✅ Parallel builds (3x faster)
- ✅ BuildKit caching
- ✅ Registry cache support

**Build Times:**
- Sequential: ~8-12 minutes
- Parallel: ~3-4 minutes

---

## 🛠️ Configuration

### Environment Variables
```bash
cp .env.example .env
# Edit .env with your production values
```

### Custom Domains
Edit `nginx/conf.d/bsingh.conf`:
```nginx
server_name your-domain.com;
```

Then rebuild nginx:
```bash
./build.sh nginx
```

---

## 🐛 Troubleshooting

**Port 80 in use:**
```bash
sudo systemctl stop nginx apache2
docker compose up -d
```

**Containers not starting:**
```bash
docker compose logs
docker ps -a
```

See [docs/DEPLOY_AZURE.md](docs/DEPLOY_AZURE.md) for more help.

---

**Built with ❤️ for universal cloud deployment**
