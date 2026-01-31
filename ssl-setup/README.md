# 🔐 SSL/HTTPS Setup

**Industry-grade free SSL certificates using Let's Encrypt**

Automatic HTTPS with HTTP→HTTPS redirects for all your domains.

---

## 📁 What's in This Folder?

| File | Purpose |
|------|---------|
| `setup-ssl.sh` | **Initial setup** - Install and obtain SSL certificates (run once) |
| `deploy-ssl.sh` | **Deploy SSL** - Activate HTTPS configuration (run after setup) |
| `check-ssl.sh` | **Check status** - View certificate info, expiry, and domains |
| `add-domain.sh` | **Add domain** - Add new domain to existing certificate |
| `renew-ssl.sh` | Auto-renewal script for certificate updates |
| `bsingh-ssl.conf` | Nginx configuration with HTTPS enabled |
| `docker-compose.prod-ssl.yml` | Docker Compose with SSL volume mounts |
| `SSL_SETUP.md` | Detailed documentation with troubleshooting |

> **💡 Important:** SSL setup is **ONE-TIME ONLY**. After initial deployment, regular code updates don't need any SSL steps - just your normal `./build.sh` and `docker compose up -d`. See [WORKFLOWS.md](WORKFLOWS.md) for details.

---

## 🚀 Quick Start

### 1. Update Your Email

```bash
# Edit setup-ssl.sh and change this line:
EMAIL="your-email@example.com"  # ← Put your real email here
```

### 2. Run Setup on Your Server

```bash
# SSH into your production server
cd /path/to/bsingh-infra/ssl-setup

# Make scripts executable (first time only)
chmod +x *.sh

# Run setup to obtain SSL certificates (requires sudo)
sudo ./setup-ssl.sh
```

### 3. Deploy SSL Configuration

```bash
# Automated deployment (recommended)
./deploy-ssl.sh

# This will:
# ✓ Backup current configs
# ✓ Deploy SSL nginx config
# ✓ Deploy SSL docker-compose
# ✓ Rebuild nginx image
# ✓ Restart services with HTTPS
```

### 4. Verify

Visit your domains with HTTPS:
- ✅ https://cors-proxy.brijeshdev.space
- ✅ https://api-cors-proxy.brijeshdev.space
- ✅ https://getdata-cors-proxy.brijeshdev.space

Check:
- Green padlock in browser
- HTTP automatically redirects to HTTPS
- Certificate shows as valid

---

## 🔧 Managing Domains

### Check Certificate Status

```bash
./check-ssl.sh
```

Shows:
- All domains in certificate
- Expiry date and days remaining
- Auto-renewal status
- DNS configuration

### Add New Domain

```bash
# 1. Configure DNS first (A record pointing to server IP)

# 2. Add to certificate
sudo ./add-domain.sh new-domain.brijeshdev.space

# 3. Add server block to nginx/conf.d/bsingh.conf

# 4. Redeploy
./deploy-ssl.sh
```

---


## 📋 Prerequisites Checklist

Before running setup:

- [ ] DNS A records configured for all domains
- [ ] Server ports 80 and 443 are open
- [ ] Root/sudo access on server
- [ ] Valid email address for notifications
- [ ] Docker and docker-compose installed

---

## 🔄 Auto-Renewal

Certificates auto-renew every 60 days (they expire at 90 days).

**Verify auto-renewal is working:**
```bash
sudo certbot renew --dry-run
```

**Manual renewal (if needed):**
```bash
sudo ./renew-ssl.sh
```

---

## 🛡️ Security Features

Your SSL setup includes:

✅ **TLS 1.2 & 1.3** - Latest secure protocols  
✅ **Strong Ciphers** - Perfect Forward Secrecy  
✅ **HSTS** - Force HTTPS on clients  
✅ **HTTP/2** - Better performance  
✅ **OCSP Stapling** - Faster SSL handshake  
✅ **Security Headers** - XSS, Clickjacking protection  

**Expected SSL Grade: A+** (test at ssllabs.com)

---

## 🎯 What Happens During Setup?

1. **Installs Certbot** (if not already installed)
2. **Verifies DNS** configuration for all domains
3. **Stops nginx temporarily** to free port 80
4. **Obtains SSL certificates** from Let's Encrypt
5. **Configures auto-renewal** via systemd timer
6. **Creates renewal hooks** to reload nginx
7. **Restarts nginx** container

Total time: **~2-3 minutes**

---

## 🐛 Troubleshooting

### Setup fails with "DNS not configured"
**Fix:** Ensure your domains have A records pointing to server IP
```bash
host cors-proxy.brijeshdev.space
```

### Port 80 already in use
**Fix:** Stop any service using port 80
```bash
sudo systemctl stop nginx apache2
# Or stop docker containers
docker compose down
```

### Permission denied errors
**Fix:** Run with sudo
```bash
sudo ./setup-ssl.sh
```

### Certificate not trusted in browser
**Fix:** Wait 1-2 minutes for certificate propagation, then hard refresh (Ctrl+Shift+R)

---

## 📖 Full Documentation

See [SSL_SETUP.md](SSL_SETUP.md) for:
- Detailed configuration explanations
- Manual certificate operations
- Performance optimization
- Alternative wildcard certificate setup
- Complete troubleshooting guide

---

## 💡 Quick Tips

1. **Test first:** Use `--dry-run` flag to test without getting certificates
2. **Monitor expiry:** Certificates expire in 90 days, auto-renew at 60 days
3. **Keep email updated:** Let's Encrypt sends expiry warnings
4. **Check logs:** `sudo journalctl -u certbot.service`

---

## 🆘 Need Help?

**Common Issues:**
- DNS not resolving → Check A records
- Port 80 blocked → Open firewall, stop conflicting services  
- Certificate errors → Wait for propagation, clear browser cache

**Resources:**
- [Let's Encrypt Docs](https://letsencrypt.org/docs/)
- [Certbot Guide](https://certbot.eff.org/)
- [Test SSL Config](https://www.ssllabs.com/ssltest/)

---

## ✅ Success Checklist

After setup, you should have:

- [x] HTTPS working on all domains
- [x] HTTP → HTTPS redirects working
- [x] Green padlock in browser
- [x] A/A+ SSL grade
- [x] Auto-renewal configured
- [x] Renewal hooks in place

**Your site is now production-ready with industry-grade SSL! 🎉**
