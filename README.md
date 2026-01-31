# CORS-Proxy Infrastructure

Production-ready, multi-platform Docker infrastructure for deploying CORS proxy services across AWS, Azure, GCP, and any cloud platform.

## 🚀 Quick Start

### Local Development
```bash
docker compose up -d
```

### Production Deployment
```bash
# Build & push multi-platform images
./build.sh --parallel

# Deploy on cloud VM
docker login
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
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
└── docs/                        # Documentation
    ├── BUILD_GUIDE.md
    ├── DEPLOY_AZURE.md
    └── buildkit.toml
```

---

## 🌐 Live Domains

| Domain | Service |
|--------|---------|
| `cors-proxy.brijeshdev.space` | Frontend App |
| `api-cors-proxy.brijeshdev.space` | Backend API |
| `getdata-cors-proxy.brijeshdev.space` | GetData Service |

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

### Production
```bash
docker compose -f docker-compose.prod.yml pull     # Pull latest images
docker compose -f docker-compose.prod.yml up -d    # Start production
docker compose -f docker-compose.prod.yml restart  # Restart services
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
