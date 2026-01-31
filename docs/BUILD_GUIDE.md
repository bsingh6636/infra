# Quick Build Reference

## 🚀 Fastest Build Options

### Build ALL Images (Recommended for Production)
```bash
# FASTEST: Parallel build (3-4 minutes) + AUTO PUSH to Docker Hub
./build.sh --parallel

# Sequential build (8-12 minutes) + AUTO PUSH
./build.sh
```

> **Note**: By default, all builds **automatically push** to Docker Hub. You'll see `ℹ Push: true` in the output.

### Build Specific Images
```bash
# Build just nginx (auto-pushed)
./build.sh nginx

# Build backend and frontend only (auto-pushed)
./build.sh backend frontend
```

### Build Without Pushing (Testing)
```bash
# Build locally, skip Docker Hub upload
./build.sh --no-push nginx

# Parallel build, no push (for testing)
./build.sh --parallel --no-push
```

### Platform-Specific Builds (50% Faster)
```bash
# For cloud servers (AWS, Azure, GCP) - auto-pushed
./build.sh -p linux/amd64 all

# For Mac M1/M2 or AWS Graviton - auto-pushed
./build.sh -p linux/arm64 all
```

---

## 📤 **Push Behavior**

| Command | Builds | Pushes to Docker Hub? |
|---------|--------|----------------------|
| `./build.sh` | ✅ Yes | ✅ **Yes (automatic)** |
| `./build.sh --parallel` | ✅ Yes | ✅ **Yes (automatic)** |
| `./build.sh --no-push` | ✅ Yes | ❌ No (local only) |
| `docker compose build` | ✅ Yes | ❌ No (need `docker compose push`) |

### When Builds Push:
- Images are built AND pushed in **one command**
- You'll see: `ℹ Push: true` at the start
- No need to run separate push command
- Images go to: `bsingh6636/bsingh-<image>:latest`

### Manual Push (if needed):
```bash
# If you built with --no-push and want to push later:
docker push bsingh6636/bsingh-nginx:latest
docker push bsingh6636/bsingh-backend:latest
docker push bsingh6636/bsingh-frontend:latest
docker push bsingh6636/bsingh-getdata:latest
```

---

## ⚡ Performance Optimizations Enabled

- ✅ **Docker BuildKit** - Modern build engine
- ✅ **Layer Caching** - Reuses unchanged layers
- ✅ **Registry Cache** - Pulls cache from Docker Hub
- ✅ **Parallel Builds** - 4 images simultaneously
- ✅ **Multi-threading** - npm install uses all CPU cores

---

## 📊 Speed Comparison

| Method | Platform | Time | Best For |
|--------|----------|------|----------|
| **Parallel Multi-platform** | AMD64 + ARM64 | 3-4 min | Production (universal) |
| **Sequential Multi-platform** | AMD64 + ARM64 | 8-12 min | First-time setup |
| **Parallel Single-platform** | AMD64 only | 2-3 min | Testing/Development |
| **Sequential Single-platform** | AMD64 only | 4-6 min | Slow networks |

---

## 🛠️ Common Commands

```bash
# First time setup
./build.sh --setup

# Build & push all images (parallel, fastest)
./build.sh --parallel

# Build single image only
./build.sh nginx

# Build for AMD64 servers only (faster)
./build.sh -p linux/amd64 --parallel

# Test build without pushing
./build.sh --no-push nginx

# List available images
./build.sh --list
```

---

## 💡 Pro Tips

1. **Use `--parallel` for production builds** - 3x faster
2. **Single platform for testing** - 50% faster iteration
3. **BuildKit cache speeds up rebuilds** - Second build 2-3x faster
4. **Parallel builds use more RAM** - Ensure 8GB+ available

---

## 🔧 BuildKit Advanced Config (Optional)

For maximum performance, create `~/.docker/buildkit.toml`:

```toml
[worker.oci]
  max-parallelism = 8  # Use all CPU cores
```

Then rebuild builder:
```bash
./build.sh --setup
```
