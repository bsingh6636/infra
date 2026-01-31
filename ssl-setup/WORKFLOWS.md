# 🔄 Deployment Workflows

## Two Types of Deployments

### 1️⃣ **SSL Setup** (ONE-TIME ONLY - First Time)

**When:** Setting up HTTPS for the first time

**Steps:**
```bash
# On production server (run ONCE)
cd ssl-setup
sudo ./setup-ssl.sh    # Get certificates
./deploy-ssl.sh         # Activate HTTPS
```

**This does:**
- Obtains SSL certificates from Let's Encrypt
- Replaces `nginx/conf.d/bsingh.conf` with HTTPS version
- Updates `docker-compose.prod.yml` with SSL mounts
- Rebuilds and restarts services

**After this, you NEVER need to do SSL setup again!**

---

### 2️⃣ **Regular Deployments** (NORMAL - Every Time)

**When:** 
- Deploying code changes
- Updating services
- Regular updates

**Steps:**
```bash
# On production server (your normal workflow)
cd /path/to/bsingh-infra

# Pull latest code
git pull

# Build images (if code changed)
./build.sh --parallel    # or ./build.sh <service-name>

# Deploy
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**No SSL steps needed!** HTTPS continues working.

---

## 🗂️ File Structure Explained

### **Active Configuration** (what nginx actually uses)

```
nginx/conf.d/
└── bsingh.conf    ← ONE file only (currently HTTP, will be HTTPS after SSL setup)
```

**Important:**
- Nginx loads **ALL** `.conf` files in this directory
- Keep only ONE active config here
- Currently: HTTP version
- After SSL setup: HTTPS version (automatically replaced by `deploy-ssl.sh`)

### **SSL Templates** (backup/reference)

```
ssl-setup/
├── bsingh-ssl.conf              ← HTTPS template
└── docker-compose.prod-ssl.yml  ← Docker compose template
```

**These are templates, NOT active configs.**

---

## 📋 What deploy-ssl.sh Does (ONE-TIME)

```bash
./deploy-ssl.sh
```

1. **Backs up** current `nginx/conf.d/bsingh.conf` → `bsingh.conf.backup.TIMESTAMP`
2. **Replaces** `nginx/conf.d/bsingh.conf` with HTTPS version from `ssl-setup/`
3. **Backs up** `docker-compose.prod.yml` → `docker-compose.prod.yml.backup.TIMESTAMP`
4. **Replaces** `docker-compose.prod.yml` with SSL version
5. **Rebuilds** nginx image
6. **Restarts** all services

**After this runs once, the HTTPS config is permanently in place.**

---

## 🔄 Certificate Auto-Renewal (Automatic)

**Happens automatically every 60 days - you do nothing!**

The `renew-ssl.sh` script auto-runs via:
- Systemd timer (Ubuntu/Debian)
- OR Cron job (if systemd not available)

**Manual check (optional):**
```bash
sudo certbot renew --dry-run
./ssl-setup/check-ssl.sh
```

---

## 📊 Comparison

| Action | SSL Setup | Regular Deployment |
|--------|-----------|-------------------|
| **Frequency** | Once (first time) | Every code update |
| **When** | Setting up HTTPS | Normal deployments |
| **Location** | `ssl-setup/` | Project root |
| **Commands** | `setup-ssl.sh`<br>`deploy-ssl.sh` | `./build.sh`<br>`docker compose up -d` |
| **Touches nginx config?** | ✅ Yes (replaces with HTTPS) | ❌ No |
| **Touches docker-compose?** | ✅ Yes (adds SSL volumes) | ❌ No |
| **Requires sudo?** | ✅ Yes (for certbot) | ❌ No |
| **Time** | ~5-8 minutes | ~3-5 minutes |

---

## ✅ Clean State After SSL Setup

```
bsingh-infra/
├── nginx/conf.d/
│   └── bsingh.conf                  ← HTTPS version (active)
│
├── docker-compose.prod.yml          ← SSL-enabled (active)
│
└── ssl-setup/                       ← Tools folder
    ├── bsingh-ssl.conf              ← Template
    ├── docker-compose.prod-ssl.yml  ← Template
    ├── setup-ssl.sh                 ← Already ran
    ├── deploy-ssl.sh                ← Already ran
    ├── check-ssl.sh                 ← Use anytime
    └── add-domain.sh                ← For new domains
```

---

## 🎯 Common Scenarios

### Scenario: Code Update

```bash
# Regular deployment - NO SSL steps!
git pull
./build.sh backend  # or whichever service changed
docker compose -f docker-compose.prod.yml up -d
```

HTTPS keeps working! ✅

---

### Scenario: Adding New Domain

```bash
# One-time per domain
sudo ./ssl-setup/add-domain.sh new-domain.brijeshdev.space

# Edit nginx config to add server block
vim nginx/conf.d/bsingh.conf

# Redeploy
./ssl-setup/deploy-ssl.sh  # or regular deployment
```

---

### Scenario: Nginx Config Change

```bash
# Edit the ACTIVE config
vim nginx/conf.d/bsingh.conf

# Regular rebuild & deploy
./build.sh nginx
docker compose -f docker-compose.prod.yml up -d
```

No SSL steps needed! ✅

---

## 💡 Key Takeaways

1. **SSL setup = ONE-TIME**
   - Run `setup-ssl.sh` once to get certificates
   - Run `deploy-ssl.sh` once to activate HTTPS
   - Never run again unless adding domains

2. **nginx/conf.d/ = ONE active .conf file**
   - Keep only `bsingh.conf` here
   - Templates live in `ssl-setup/`

3. **Regular deployments = Normal workflow**
   - Just `./build.sh` and `docker compose up -d`
   - HTTPS continues working
   - No SSL commands needed

4. **Certificates auto-renew**
   - No manual intervention
   - Check status: `./ssl-setup/check-ssl.sh`

---

## 🆘 "Do I need to...?"

| Question | Answer |
|----------|--------|
| Run `setup-ssl.sh` again? | ❌ No - only once ever |
| Run `deploy-ssl.sh` for every deployment? | ❌ No - only once after `setup-ssl.sh` |
| Worry about certificate renewal? | ❌ No - auto-renews |
| Use SSL commands for code updates? | ❌ No - regular deployment works |
| Keep multiple .conf files in nginx/conf.d/? | ❌ No - only ONE active config |

**TL;DR: After initial SSL setup, forget about it! Regular deployments work normally.** 🎉
