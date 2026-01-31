# 🔐 SSL/HTTPS Setup Guide


## 🚀 Quick Start

### Prerequisites
1. ✅ DNS A records pointing to your server IP
2. ✅ Ports 80 and 443 open in firewall
3. ✅ Root/sudo access on server
4. ✅ Valid email address for certificate notifications

### Step 1: Update Setup Script

Edit `setup-ssl.sh` and change:
```bash
EMAIL="bkushwaha.dev@gmail.com"
```

# Make scripts executable
chmod +x setup-ssl.sh renew-ssl.sh

# Run SSL setup (requires sudo)
sudo ./setup-ssl.sh
- ✅ Install Certbot
- ✅ Verify DNS configuration
- ✅ Obtain SSL certificates for all domains
- ✅ Configure auto-renewal
- ✅ Create renewal hooks

### Step 3: Update Configuration Files

```bash
# Replace nginx config with SSL version
cp nginx/conf.d/bsingh.conf nginx/conf.d/bsingh.conf.backup
cp nginx/conf.d/bsingh-ssl.conf nginx/conf.d/bsingh.conf

# Use SSL-enabled docker-compose
cp docker-compose.prod.yml docker-compose.prod.yml.backup
cp docker-compose.prod-ssl.yml docker-compose.prod.yml
```

### Step 4: Rebuild & Restart

```bash
# Rebuild nginx image with new config
./build.sh nginx

# Deploy
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Step 5: Verify HTTPS

Visit your domains:
- https://cors-proxy.brijeshdev.space
- https://api-cors-proxy.brijeshdev.space
- https://getdata-cors-proxy.brijeshdev.space

Check:
- ✅ Green padlock in browser
- ✅ HTTP redirects to HTTPS automatically
- ✅ Certificate is valid

---

## 🔧 Configuration Details

### SSL Security Features

The nginx configuration includes industry best practices:

| Feature | Description | Benefit |
|---------|-------------|---------|
| **TLS 1.2 & 1.3** | Latest TLS protocols | Maximum security |
| **Strong Ciphers** | ECDHE-ECDSA/RSA-AES-GCM | Perfect Forward Secrecy |
| **HSTS** | Strict-Transport-Security header | Force HTTPS on clients |
| **OCSP Stapling** | Certificate status caching | Faster SSL handshake |
| **Security Headers** | X-Frame-Options, CSP, etc. | Protection against attacks |
| **HTTP/2** | Modern HTTP protocol | Better performance |

### Certificate Structure

```
/etc/letsencrypt/
├── live/cors-proxy.brijeshdev.space/
│   ├── fullchain.pem      (Certificate + Chain)
│   ├── privkey.pem        (Private Key)
│   └── chain.pem          (CA Chain)
└── renewal/
    └── cors-proxy.brijeshdev.space.conf
```

---

## 🔄 Auto-Renewal

### How It Works

Let's Encrypt certificates expire every **90 days**. Certbot automatically renews them:

1. **Systemd Timer** (Ubuntu/Debian):
   - Runs twice daily: `certbot.timer`
   - Check: `systemctl status certbot.timer`

2. **Cron Job** (Alternative):
   ```bash
   # Add to root's crontab
   0 0,12 * * * /usr/bin/certbot renew --quiet --deploy-hook "docker exec bsingh-nginx nginx -s reload"
   ```

3. **Manual Renewal** (Testing):
   ```bash
   sudo ./renew-ssl.sh
   ```

### Verify Auto-Renewal

```bash
# Test renewal process (dry run)
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

---

## 🛠️ Manual Certificate Operations

### Add New Domain

```bash
# Add to existing certificate
sudo certbot certonly --cert-name cors-proxy.brijeshdev.space \
  -d cors-proxy.brijeshdev.space \
  -d api-cors-proxy.brijeshdev.space \
  -d getdata-cors-proxy.brijeshdev.space \
  -d new-domain.brijeshdev.space  # New domain
```

### Revoke Certificate

```bash
sudo certbot revoke --cert-name cors-proxy.brijeshdev.space
```

### Force Renewal

```bash
sudo certbot renew --force-renewal
docker exec bsingh-nginx nginx -s reload
```

---

## 🔍 Security Grading

Test your SSL configuration:
- **SSL Labs**: https://www.ssllabs.com/ssltest/
  - Target: **A+ rating**
- **Mozilla Observatory**: https://observatory.mozilla.org/

Expected Results:
- ✅ A+ SSL Rating
- ✅ TLS 1.3 Support
- ✅ Perfect Forward Secrecy
- ✅ HSTS Enabled
- ✅ No SSL/TLS vulnerabilities

---

## 🐛 Troubleshooting

### Certificate Acquisition Failed

**Error**: `Failed authorization procedure`

**Fix**:
```bash
# Check DNS
host cors-proxy.brijeshdev.space

# Check port 80 is available
sudo netstat -tlnp | grep :80

# Try standalone mode
sudo certbot certonly --standalone -d cors-proxy.brijeshdev.space
```

### Nginx Won't Start

**Error**: `SSL: error:0200100D:system library:fopen:Permission denied`

**Fix**:
```bash
# Check certificate permissions
ls -la /etc/letsencrypt/live/cors-proxy.brijeshdev.space/

# Ensure docker has access (mount as read-only)
docker compose -f docker-compose.prod.yml up nginx
```

### Auto-Renewal Not Working

**Check**:
```bash
# View systemd timer
systemctl list-timers certbot

# Check logs
sudo journalctl -u certbot.service

# Test renewal
sudo certbot renew --dry-run
```

---

## 🎯 Alternative: Wildcard Certificate

For `*.brijeshdev.space`:

```bash
# Requires DNS validation (not HTTP)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d '*.brijeshdev.space' \
  -d brijeshdev.space
```

You'll need to add TXT records to your DNS.

---

## 📈 Performance Impact

**SSL/TLS Overhead**:
- Initial handshake: ~100ms
- Subsequent requests: ~0ms (session reuse)
- HTTP/2 multiplexing: **Faster than HTTP/1.1**

**Optimizations Included**:
- ✅ Session caching (10m)
- ✅ OCSP stapling (reduces latency)
- ✅ HTTP/2 enabled
- ✅ Strong ciphers only

---

## 📚 Additional Resources

- [Certbot Documentation](https://certbot.eff.org/)
- [Let's Encrypt Best Practices](https://letsencrypt.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Nginx SSL Module](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)

---

## ✅ Quick Verification Checklist

After setup, verify:

- [ ] HTTPS loads on all domains
- [ ] HTTP redirects to HTTPS automatically
- [ ] Green padlock shows in browser
- [ ] Certificate is valid for 90 days
- [ ] Auto-renewal is configured (`certbot renew --dry-run`)
- [ ] Security headers are present (check browser dev tools)
- [ ] SSL Labs grade is A or A+

---

## 💡 Tips

1. **Set Calendar Reminder**: Even with auto-renewal, check certificate status monthly
2. **Monitor Expiry**: Use services like [SSL Checker](https://www.sslshopper.com/ssl-checker.html)
3. **Keep Email Updated**: Let's Encrypt sends expiry warnings to your email
4. **Test After Changes**: Always test nginx config: `docker exec bsingh-nginx nginx -t`

---

**Need help? The setup-ssl.sh script includes detailed logging and error messages.**
