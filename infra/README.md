# CORS-Proxy Infrastructure

Multi-platform Docker infrastructure for deploying CORS proxy services across AWS, Azure, GCP, and any cloud platform.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Docker Hub account (for pushing images)
- Access to `bsingh6636/EduCors-Helper` repository

### Local Development
```bash
cd infra/
docker compose up -d
```

**Services:**
- Frontend: http://localhost:80
- Backend API: http://localhost:3000
- GetData: http://localhost:3001

### Production Deployment

**Build & Push Images:**
```bash
cd infra/
./build.sh --parallel  # 3-4 minutes for all images
```

**Deploy on Cloud VM:**
```bash
cd ~/infra/infra/
docker login
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**Your services are now live!**

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [Build Guide](docs/BUILD_GUIDE.md) | Multi-platform builds, performance tips |
| [Azure Deployment](docs/DEPLOY_AZURE.md) | Step-by-step cloud deployment |
| [BuildKit Config](docs/buildkit.toml) | Advanced performance tuning |

---

## 🏗️ Project Structure

```
infra/
├── README.md                    # You are here
├── build.sh                     # Multi-platform build script
├── docker-compose.yml           # Development environment
├── docker-compose.prod.yml      # Production deployment
├── .env.example                 # Environment template
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

| Domain | Service | Port |
|--------|---------|------|
| `cors-proxy.brijeshdev.space` | Frontend | 80 |
| `api-cors-proxy.brijeshdev.space` | Backend API | 3000 |
| `getdata-cors-proxy.brijeshdev.space` | GetData | 3000 |

---

## 🔧 Common Commands

### Build Images
```bash
./build.sh --parallel              # Build all (fastest)
./build.sh nginx                   # Build specific image
./build.sh -p linux/amd64 all      # Single platform (faster)
./build.sh --no-push nginx         # Local build only
```

### Manage Services
```bash
# Development
docker compose up -d               # Start
docker compose logs -f             # View logs
docker compose down                # Stop

# Production
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml restart
```

---

## 📦 Docker Images

All images support **AMD64 + ARM64** platforms:

- `bsingh6636/bsingh-nginx:latest`
- `bsingh6636/bsingh-backend:latest`
- `bsingh6636/bsingh-frontend:latest`
- `bsingh6636/bsingh-getdata:latest`

---

## 🔥 Performance Features

- ✅ Multi-platform builds (Mac, AWS, Azure, GCP)
- ✅ Parallel builds (3x faster)
- ✅ BuildKit caching (faster rebuilds)
- ✅ Registry cache support
- ✅ Optimized for production

**Build Time:**
- Sequential: ~8-12 minutes
- Parallel: ~3-4 minutes

---

## 🛠️ Configuration

### Environment Variables
Copy `.env.example` to `.env` and configure:

```bash
NODE_ENV=production
DATABASE_URL=your-database-url
API_KEY=your-api-key
```

### Domain Configuration
Edit `nginx/conf.d/bsingh.conf` to update domains:

```nginx
server_name your-domain.com;
```

Then rebuild:
```bash
./build.sh nginx
```

---

## 🐛 Troubleshooting

### Port 80 Already in Use
```bash
sudo systemctl stop nginx apache2
docker compose up -d
```

### Containers Not Starting
```bash
docker compose logs
docker ps -a
```

### Images Not Pulling
```bash
docker login
docker compose pull
```

See [DEPLOY_AZURE.md](docs/DEPLOY_AZURE.md) for more troubleshooting.

---

## 📄 License

MIT License - See LICENSE file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

---

**Built with ❤️ for universal cloud deployment**
