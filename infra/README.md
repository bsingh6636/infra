# bsingh-infra Infrastructure

Multi-platform Docker infrastructure for deploying services to **any cloud** (AWS, Azure, GCP) or local Docker host.

## ✨ Features

- 🌍 **Universal Compatibility**: Works on Mac (M1/M2/Intel), Linux, Windows, AWS, Azure, GCP
- 🚀 **Multi-Platform Images**: Single build runs on both AMD64 and ARM64 architectures  
- ⚡ **Automated Builds**: Simple script for building all or selective images
- 🔄 **Multiple Workflows**: Development (build from source) or Production (pull from Docker Hub)

---

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- **Docker Hub Account** for pushing/pulling images
- **SSH Key for GitHub** to access the private `EduCors-Helper` repository

---

## 🛠️ Quick Start

### Option 1: Using Build Script (Recommended)

```bash
cd infra/

# Setup buildx (first time only)
./build.sh --setup

# Build all images for all platforms
./build.sh

# Build specific images
./build.sh nginx backend

# Build in parallel (faster)
./build.sh --parallel

# Build for specific platform only
./build.sh -p linux/amd64 all          # For typical servers
./build.sh -p linux/arm64 all          # For Mac M1/M2, AWS Graviton
```

### Option 2: Using Docker Compose

```bash
# Build all images
docker compose build

# Push to Docker Hub
docker compose push
```

---

## 🌐 Deployment Workflows

### **Development Workflow** (Build from Source)

Use this on your local machine for development and testing.

#### 1. Setup
```bash
# Clone repository
git clone <your-repo-url>
cd infra/

# Create .env file
cp .env.example .env
nano .env  # Add your secrets

# Verify GitHub SSH access
ssh -T git@github.com
```

#### 2. Build & Run
```bash
# Using build script (multi-platform)
./build.sh

# OR using docker compose (single platform)
docker compose up -d --build
```

---

### **Production Workflow** (Pull from Docker Hub)

Two-part process: Build locally → Deploy to cloud server

#### Part A: Build & Push (On Your Local Machine)

```bash
cd infra/

# Login to Docker Hub
docker login

# Build multi-platform images using script
./build.sh                    # Builds and pushes all images

# OR build in parallel (faster)
./build.sh --parallel

# OR using docker compose (single platform only)
docker compose build
docker compose push
```

#### Part B: Deploy to Cloud Server

Works on **AWS EC2**, **Azure VM**, **GCP Compute Engine**, or any Linux server.

##### 1. Server Setup (One-time)

```bash
# Install Docker (if not installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose Plugin
sudo apt update
sudo apt install -y docker-compose-plugin

# Add your user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
# Logout and login again for this to take effect

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

##### 2. Clone Repository

```bash
# Clone infra repo
git clone https://github.com/bsingh6636/infra.git
cd infra/infra/

# Create production .env file
cp .env.example .env
nano .env  # Add production secrets
```

##### 3. Deploy

```bash
# Login to Docker Hub
docker login
# Enter username: bsingh6636
# Enter password: <your-docker-hub-password>

# Pull and start containers
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Verify containers are running
docker ps

# Check logs if needed
docker compose -f docker-compose.prod.yml logs -f
```

---

## 📦 Available Images

All images support **linux/amd64** and **linux/arm64** platforms:

| Image | Description | Docker Hub |
|-------|-------------|------------|
| **nginx** | Reverse proxy & load balancer | `bsingh6636/bsingh-nginx:latest` |
| **backend** | Backend API service | `bsingh6636/bsingh-backend:latest` |
| **frontend** | Frontend web application | `bsingh6636/bsingh-frontend:latest` |
| **getdata** | GetData API service | `bsingh6636/bsingh-getdata:latest` |

---

## 🔧 Build Script Usage

The `build.sh` script provides flexible build options:

```bash
# Show help
./build.sh --help

# List available images
./build.sh --list

# Setup buildx (first time)
./build.sh --setup

# Build all images
./build.sh

# Build specific images
./build.sh nginx backend

# Build for AMD64 only (typical cloud servers)
./build.sh -p linux/amd64

# Build for ARM64 only (Mac M1/M2, AWS Graviton)
./build.sh -p linux/arm64

# Build in parallel (4x faster)
./build.sh --parallel

# Build without pushing (testing)
./build.sh --no-push nginx
```

---

## 🌍 Platform Support

### Multi-Platform Images Work On:

| Platform | Architecture | Use Cases |
|----------|--------------|-----------|
| **AWS EC2** | AMD64 | General purpose instances |
| **AWS Graviton** | ARM64 | Cost-optimized ARM instances (30% cheaper) |
| **Azure VMs** | AMD64 | Standard virtual machines |
| **GCP Compute** | AMD64/ARM64 | Compute Engine instances |
| **Mac M1/M2/M3** | ARM64 | Local development |
| **Mac Intel** | AMD64 | Local development |
| **Linux Servers** | AMD64 | Ubuntu, Debian, RHEL, etc. |
| **Windows** | AMD64 | Docker Desktop |
| **Raspberry Pi** | ARM64 | Edge/IoT deployments |

---

## 🚀 Accessing Services

Once deployed, services are available at:

| Service | Local | Cloud Server |
|---------|-------|--------------|
| **Frontend** | `http://localhost/` | `http://<server-ip>/` |
| **Backend API** | `http://localhost/api/` | `http://<server-ip>/api/` |
| **GetData API** | `http://localhost/getdata/` | `http://<server-ip>/getdata/` |

---

## 🔍 Troubleshooting

### Build Issues

**Problem**: Platform mismatch error
```bash
Error: no matching manifest for linux/amd64
```

**Solution**: Rebuild with multi-platform support
```bash
./build.sh --setup
./build.sh
```

---

**Problem**: Build taking too long

**Explanation**: Multi-platform builds are slower because:
- Building for 2 architectures (AMD64 + ARM64)
- Installing dependencies twice
- Uploading layers to Docker Hub

**Speed up**:
```bash
# Build for single platform
./build.sh -p linux/amd64 all

# Or build in parallel
./build.sh --parallel
```

---

### Deployment Issues

**Problem**: Permission denied on server

**Solution**:
```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Logout and login again

# Or use sudo
sudo docker compose -f docker-compose.prod.yml up -d
```

---

**Problem**: Port already in use

**Solution**:
```bash
# Check what's using port 80
sudo lsof -i :80

# Stop conflicting service (e.g., apache)
sudo systemctl stop apache2
```

---

## 📝 Environment Variables

Edit `.env` file with your configuration:

```bash
# Example .env
NODE_ENV=production
DATABASE_URL=your-database-url
API_KEY=your-api-key
PORT=3000
```

---

## 🔄 Updating Services

### On Local Machine (Development)
```bash
# Rebuild and restart
docker compose down
docker compose up -d --build
```

### On Cloud Server (Production)
```bash
# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Restart containers
docker compose -f docker-compose.prod.yml up -d
```

---

## 📚 Additional Commands

```bash
# View logs
docker compose logs -f

# Stop all services
docker compose down

# Remove all containers and volumes
docker compose down -v

# Check container status
docker ps

# Execute command in container
docker exec -it bsingh-backend sh
```

---

## 🎯 Best Practices

1. **Always use multi-platform builds for production** - Ensures compatibility
2. **Use parallel builds** when building all images - Saves time
3. **Single platform builds for testing** - Faster iteration
4. **Keep .env out of git** - Already in .gitignore
5. **Use docker-compose.prod.yml on servers** - Cleaner, no build context needed

---

## 💡 Tips

- **Cost Optimization**: Use ARM64 images on AWS Graviton instances (30% cheaper)
- **Faster Deploys**: Pre-build images and push to Docker Hub
- **Local Testing**: Use `--no-push` to test builds without pushing
- **Debug Builds**: Add `--progress=plain` to docker build commands for detailed output
