# 🔐 SSL/HTTPS Setup

**Industry-grade free SSL certificates using Let's Encrypt**

## 📂 Files

| File | Purpose |
|------|---------|
| `domains.conf` | **Configuration** - Edit this to manage domains and email |
| `setup-ssl.sh` | **Setup/Update** - Obtains or expands certificates (run as sudo) |
| `deploy-ssl.sh` | **Deploy** - Activates HTTPS configuration |
| `check-ssl.sh` | **Status** - Checks certificate details and expiry |
| `bsingh-ssl.conf` | Nginx HTTPS template |
| `docker-compose.prod-ssl.yml` | SSL-enabled Docker Compose |

---

## 🚀 Quick Start

### 1. Configure
Open `ssl-setup/domains.conf` and set your email and domains:

```bash
EMAIL="your-email@example.com"
DOMAINS=(
    "domain1.com"
    "sub.domain1.com"
)
```

### 2. Setup (or Update)
Run this whenever you change `domains.conf` or for first-time setup:

```bash
cd ssl-setup
sudo ./setup-ssl.sh
```

### 3. Deploy
Activate the SSL configuration:

```bash
./deploy-ssl.sh
```

---

## 🔄 Common Tasks

### Add a New Domain
1. Add the domain to `ssl-setup/domains.conf`.
2. Run `sudo ./setup-ssl.sh` (this will automatically expand the certificate).
3. Run `./deploy-ssl.sh` to update Nginx.

### Check Status
View certificate expiry and domains:
```bash
./check-ssl.sh
```

### Manual Renewal
Certificates renew automatically. To test or force renewal:
```bash
# Test
sudo certbot renew --dry-run

# Force
sudo certbot renew --force-renewal
```
