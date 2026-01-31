# 🚀 Ready to Deploy SSL - Complete Checklist

You said you're ready! Here's your complete deployment guide.

---

## ✅ Pre-Flight Checklist

Before you start, verify:

- [ ] **DNS configured**: All domains have A records pointing to your server IP
  ```bash
  host cors-proxy.brijeshdev.space
  host api-cors-proxy.brijeshdev.space
  host getdata-cors-proxy.brijeshdev.space
  ```

- [ ] **Ports open**: Server firewall allows ports 80 and 443
  ```bash
  sudo ufw status  # or check your firewall
  ```

- [ ] **Email updated**: Edit `setup-ssl.sh` and change:
  ```bash
  EMAIL="your-email@example.com"  # ← YOUR REAL EMAIL
  ```

- [ ] **SSH access**: You can connect to your production server

---

## 🎯 Deployment Steps (3 Easy Steps!)

### Step 1: Get SSL Certificates (One-Time)

```bash
# SSH into your production server
ssh user@your-server

# Navigate to project
cd /path/to/bsingh-infra/ssl-setup

# Make scripts executable (first time only)
chmod +x *.sh

# Obtain SSL certificates from Let's Encrypt
sudo ./setup-ssl.sh
```

**What this does:**
- Installs Certbot
- Validates your DNS
- Obtains SSL certificates for all 3 domains
- Sets up auto-renewal
- Takes ~2-3 minutes

---

### Step 2: Activate HTTPS (Automated)

```bash
# Still in ssl-setup directory
./deploy-ssl.sh
```

**What this does:**
- Backs up your current configs
- Deploys SSL nginx configuration
- Deploys SSL docker-compose
- Rebuilds nginx with new config
- Restarts all services with HTTPS enabled
- Takes ~3-5 minutes

---

### Step 3: Verify It Works

Visit your domains:
- https://cors-proxy.brijeshdev.space ✓
- https://api-cors-proxy.brijeshdev.space ✓
- https://getdata-cors-proxy.brijeshdev.space ✓

**Check for:**
1. 🔒 Green padlock in browser address bar
2. ✓ Valid certificate (click padlock to view)
3. 🔄 HTTP redirects to HTTPS automatically
   - Try: http://cors-proxy.brijeshdev.space (should redirect)

**Test SSL grade:**
- Visit: https://www.ssllabs.com/ssltest/
- Enter your domain
- Expected grade: **A or A+**

---

## 🎉 Done! What's Next?

### Monitor Your Certificates

```bash
# Check certificate status anytime
./check-ssl.sh
```

Shows:
- All domains
- Expiry date (90 days from now)
- Auto-renewal status
- DNS configuration

### Auto-Renewal is Already Setup ✓

Your certificates will automatically renew:
- Certificate lifetime: 90 days
- Auto-renewal runs: Every 60 days
- No manual action needed!

**Verify auto-renewal:**
```bash
sudo certbot renew --dry-run
```

---

## 🔧 Future: Adding New Domains

When you need to add a new domain later:

```bash
# 1. Configure DNS (A record)
# Point new-domain.brijeshdev.space → your server IP

# 2. Add to certificate
sudo ./add-domain.sh new-domain.brijeshdev.space

# 3. Add nginx server block
# Edit ../nginx/conf.d/bsingh.conf
# Copy one of the existing server blocks and update domain name

# 4. Redeploy
./deploy-ssl.sh
```

---

## ⚠️ Troubleshooting

### "DNS not configured" error
**Problem:** Domain doesn't resolve to your server
**Fix:** 
```bash
host your-domain.com  # Should show your server IP
# If not, update your DNS A records and wait 5-10 minutes
```

### "Port 80 already in use"
**Problem:** Another service is using port 80
**Fix:**
```bash
sudo systemctl stop nginx apache2  # Stop system nginx
docker compose down  # Stop docker containers
# Then run setup-ssl.sh again
```

### Certificate not trusted in browser
**Problem:** Browser shows "Not Secure"
**Fix:**
1. Wait 1-2 minutes for certificate propagation
2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
3. Clear browser cache
4. Check certificate with: `sudo certbot certificates`

### Nginx won't start after deployment
**Problem:** Configuration error
**Fix:**
```bash
# Test nginx config
docker exec bsingh-nginx nginx -t

# Check logs
docker compose logs nginx

# Restore backup if needed
cp nginx/conf.d/bsingh.conf.backup.* nginx/conf.d/bsingh.conf
```

---

## 📊 File Structure After Deployment

```
bsingh-infra/
├── nginx/conf.d/
│   ├── bsingh.conf              ← HTTPS config (active)
│   └── bsingh.conf.backup.*     ← HTTP backup
├── docker-compose.prod.yml      ← SSL-enabled (active)
├── docker-compose.prod.yml.backup.* ← Backup
└── ssl-setup/
    ├── README.md               ← Full documentation
    ├── setup-ssl.sh           ← Already ran
    ├── deploy-ssl.sh          ← Already ran
    ├── check-ssl.sh           ← Use anytime
    ├── add-domain.sh          ← For future domains
    └── renew-ssl.sh           ← Auto-runs, manual option
```

---

## 🆘 Need Help?

1. **Check certificate status:**
   ```bash
   ./check-ssl.sh
   ```

2. **View detailed logs:**
   ```bash
   sudo journalctl -u certbot.service
   docker compose logs nginx
   ```

3. **Read full docs:**
   - [README.md](README.md) - Overview and quick start
   - [SSL_SETUP.md](SSL_SETUP.md) - Detailed documentation

---

## 🎯 Success Criteria

After deployment, you should have:

- [x] All domains accessible via HTTPS
- [x] Green padlock in browser
- [x] HTTP automatically redirects to HTTPS
- [x] SSL grade A or A+ on SSL Labs
- [x] Certificates valid for 90 days
- [x] Auto-renewal configured and tested

**If all checkboxes are checked, you're DONE! 🎉**

Your infrastructure now has **industry-grade, free SSL/HTTPS** that auto-renews forever.

---

**Last updated**: Ready for deployment on your command!
