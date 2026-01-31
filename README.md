# CORS-Proxy Infrastructure

Production-ready, multi-platform Docker infrastructure for deploying CORS proxy services.

## 🚀 Quick Links

- **[Infrastructure Setup & Deployment](infra/)** - Main documentation
- **[Build Guide](infra/docs/BUILD_GUIDE.md)** - Multi-platform builds
- **[Azure Deployment](infra/docs/DEPLOY_AZURE.md)** - Cloud deployment

## 📦 What's Included

This repository contains Docker infrastructure for:
- Multi-platform image builds (AMD64 + ARM64)
- Production deployment configuration
- Nginx reverse proxy with custom domain support
- Automated build scripts

## 🏗️ Structure

```
bsingh-infra/
├── infra/                       # Main infrastructure
│   ├── README.md               # Setup & deployment docs
│   ├── build.sh                # Build automation script
│   ├── docker-compose.yml      # Development
│   ├── docker-compose.prod.yml # Production
│   ├── nginx/                  # Reverse proxy config
│   └── docs/                   # Detailed guides
│       ├── BUILD_GUIDE.md
│       ├── DEPLOY_AZURE.md
│       └── buildkit.toml
└── README.md                   # This file
```

## ⚡ Quick Start

```bash
cd infra/

# Development
docker compose up -d

# Production
./build.sh --parallel
# Then deploy to cloud (see infra/docs/DEPLOY_AZURE.md)
```

## 🌐 Live Services

- Frontend: `cors-proxy.brijeshdev.space`
- Backend API: `api-cors-proxy.brijeshdev.space`
- GetData: `getdata-cors-proxy.brijeshdev.space`

## 📖 Full Documentation

See [infra/README.md](infra/README.md) for complete setup and deployment instructions.
