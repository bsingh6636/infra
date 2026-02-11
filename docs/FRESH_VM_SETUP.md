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

# install nodejs
sudo apt-get update
sudo apt-get install -y nodejs
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

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

---

> [!TIP]
> **Building from Private Repos?**
> If your code is in a private repository, ensure you have added your SSH key locally (`ssh-add`) before running `./build.sh`. See [docs/PRIVATE_REPO_BUILDS.md](PRIVATE_REPO_BUILDS.md) for a detailed guide.
```