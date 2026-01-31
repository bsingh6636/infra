# Quick Build Reference

## 🚀 Fastest Build Options

### Build ALL Images (Recommended for Production)
```bash
# FASTEST: Parallel build (3-4 minutes)
./build.sh --parallel

# Sequential build (8-12 minutes)
./build.sh
```

### Build Specific Images
```bash
# Build just nginx
./build.sh nginx

# Build backend and frontend only
./build.sh backend frontend
```

### Platform-Specific Builds (50% Faster)
```bash
# For cloud servers (AWS, Azure, GCP)
./build.sh -p linux/amd64 all

# For Mac M1/M2 or AWS Graviton
./build.sh -p linux/arm64 all
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
