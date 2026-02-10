# Migration Guide: Switch to Multi-Domain Configuration

This guide walks you through migrating from the current nginx configuration to the new production-ready multi-domain setup.

---

## 📋 What's Changing?

### Current Setup
- ✅ Individual server blocks for each subdomain
- ✅ Repetitive SSL configuration
- ✅ Hard to add new subdomains (lots of copying)

### New Setup  
- ✅ **Single map directive** for all routing
- ✅ **Two server blocks** (HTTP redirect + HTTPS)
- ✅ **Add new subdomains** in seconds (just one line!)
- ✅ **Supports multiple root domains** easily

---

## 🚀 Migration Steps

### Step 1: Backup Current Configuration

```bash
cd /Users/brijeshkumarkushwaha/Documents/Brijesh/infra

# Backup current nginx config
cp nginx/conf.d/bsingh.conf nginx/conf.d/bsingh.conf.backup

# Backup SSL config
cp ssl-setup/domains.conf ssl-setup/domains.conf.backup
```

### Step 2: Choose Your Migration Path

**Option A: Clean Switch** (Recommended for testing first)
- Use the new config file alongside the old one
- Test before fully switching

**Option B: Replace Existing**
- Replace the old config completely
- Faster, but less safe

---

## Option A: Clean Switch (Recommended)

### 1. The new configuration is already created at:
```
nginx/conf.d/bsingh-multi-domain.conf
```

### 2. Temporarily disable old config
```bash
# Rename old config (nginx ignores files without .conf extension)
mv nginx/conf.d/bsingh.conf nginx/conf.d/bsingh.conf.disabled
```

### 3. Test the new configuration
```bash
# Test nginx config syntax
docker run --rm \
  -v $(pwd)/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:latest \
  nginx -t
```

### 4. Rebuild nginx with new config
```bash
./build.sh nginx
```

### 5. Deploy and test
```bash
# Deploy with SSL
cd ssl-setup
./deploy-ssl.sh

# Test all your domains
curl -I https://brijeshdev.space
curl -I https://cors-proxy.brijeshdev.space
curl -I https://api-cors-proxy.brijeshdev.space
curl -I https://getdata-cors-proxy.brijeshdev.space
```

### 6. If everything works, delete old config
```bash
rm nginx/conf.d/bsingh.conf.disabled
```

### 7. If there are issues, rollback
```bash
# Restore old config
mv nginx/conf.d/bsingh.conf.disabled nginx/conf.d/bsingh.conf
rm nginx/conf.d/bsingh-multi-domain.conf

# Rebuild and redeploy
./build.sh nginx
cd ssl-setup
./deploy-ssl.sh
```

---

## Option B: Replace Existing

### 1. Replace the configuration
```bash
# Backup first!
cp nginx/conf.d/bsingh.conf nginx/conf.d/bsingh.conf.backup

# Replace with new config
mv nginx/conf.d/bsingh-multi-domain.conf nginx/conf.d/bsingh.conf
```

### 2. Test, rebuild, and deploy
```bash
# Test config
docker run --rm \
  -v $(pwd)/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:latest \
  nginx -t

# Rebuild nginx
./build.sh nginx

# Deploy
cd ssl-setup
./deploy-ssl.sh
```

---

## 🧪 Verification Checklist

After migration, verify all services are working:

### HTTP to HTTPS Redirect
```bash
# Should redirect to HTTPS
curl -I http://brijeshdev.space
# Look for: "HTTP/1.1 301 Moved Permanently"
# Location: https://brijeshdev.space
```

### All Subdomains Accessible
```bash
# Test all current subdomains
curl -I https://brijeshdev.space
curl -I https://portfolio.brijeshdev.space
curl -I https://cors-proxy.brijeshdev.space
curl -I https://api-cors-proxy.brijeshdev.space
curl -I https://getdata-cors-proxy.brijeshdev.space

# All should return HTTP/1.1 200 OK or appropriate response
```

### SSL Certificate Valid
```bash
# Check SSL status
cd ssl-setup
./check-ssl.sh

# Verify certificate covers all domains
sudo certbot certificates
```

### Backend Routing Working
```bash
# Make actual requests (not just headers)
curl https://cors-proxy.brijeshdev.space
curl https://api-cors-proxy.brijeshdev.space/health  # adjust path
```

### Check Nginx Logs
```bash
# No errors in logs
docker logs bsingh-nginx --tail 50

# Should see successful proxy passes
```

---

## 🎯 Post-Migration Benefits

### Before (Old Config)
To add a new subdomain `admin.brijeshdev.space`:
1. Copy entire server block (20+ lines) for HTTP
2. Copy entire server block (40+ lines) for HTTPS
3. Update SSL certificate list
4. Rebuild nginx
5. Update SSL, deploy

**Total changes: 60+ lines across multiple sections**

### After (New Config)
To add a new subdomain `admin.brijeshdev.space`:
1. Add ONE line to map: `admin.brijeshdev.space "admin:3000";`
2. Add domain to `server_name` lists (if not using wildcard)
3. Rebuild nginx, deploy

**Total changes: 1-3 lines!**

---

## 🔄 Quick Reference: Map Directive

The map directive is the heart of the new configuration:

```nginx
map $host $backend_service {
    # Format: "domain/subdomain"    "container:port";
    
    # Main domain
    brijeshdev.space                     "portfolio:80";
    
    # Subdomains
    cors-proxy.brijeshdev.space          "frontend:80";
    api-cors-proxy.brijeshdev.space      "backend:9090";
    
    # To add new subdomain, just add one line:
    admin.brijeshdev.space               "admin:3000";
    # That's it! ✨
}
```

When a request comes to `admin.brijeshdev.space`:
1. Nginx matches `$host` (the domain in the request)
2. Sets `$backend_service` to `"admin:3000"`
3. Proxies to `http://admin:3000`

---

## 💡 Pro Tips

### Tip 1: Use Wildcard Certificates
Instead of adding each subdomain to your SSL cert, use a wildcard:

```bash
# Get wildcard cert (requires DNS API)
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d brijeshdev.space \
  -d '*.brijeshdev.space'
```

Now ANY subdomain automatically has SSL! 🎉

### Tip 2: Organize Your Map
Add comments to group services:

```nginx
map $host $backend_service {
    # ===== Core Services =====
    brijeshdev.space                "portfolio:80";
    cors-proxy.brijeshdev.space     "frontend:80";
    
    # ===== APIs =====
    api-cors-proxy.brijeshdev.space "backend:9090";
    
    # ===== Tools =====
    admin.brijeshdev.space          "admin:3000";
}
```

### Tip 3: Keep the Old Config Accessible
Don't delete `bsingh.conf.backup` - you might want to reference it later.

---

## 🐛 Troubleshooting Migration Issues

### Issue: "upstream not found" Error
**Symptom:** Nginx can't find the backend service

**Solution:**
```bash
# Check if service name in map matches container name
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Update map to match exact container names
```

### Issue: SSL Certificate Error
**Symptom:** Browser shows SSL error after migration

**Solution:**
```bash
# Check if nginx is using correct certificate path
docker exec bsingh-nginx cat /etc/nginx/conf.d/bsingh-multi-domain.conf | grep ssl_certificate

# Ensure certificate exists
docker exec bsingh-nginx ls -la /etc/letsencrypt/live/cors-proxy.brijeshdev.space/
```

### Issue: 404 Not Found on All Subdomains
**Symptom:** All requests return 404

**Solution:**
```bash
# Check if server_name includes your domains
docker exec bsingh-nginx nginx -T | grep server_name

# Ensure domains are listed in both HTTP and HTTPS blocks
```

### Issue: Infinite Redirect Loop
**Symptom:** Browser says "too many redirects"

**Solution:**
```bash
# Ensure HTTP block redirects to HTTPS
# Ensure HTTPS block DOESN'T redirect
# Check proxy_set_header X-Forwarded-Proto is set
```

---

## 📚 Next Steps After Migration

1. **Test adding a new subdomain** - Try the quick workflow!
2. **Consider wildcard certificates** - Simplify SSL management
3. **Read the Multi-Domain Guide** - Learn advanced patterns
4. **Update your documentation** - Note which config you're using

---

## 🔗 Related Documentation

- [Multi-Domain Management Guide](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/docs/MULTI_DOMAIN_GUIDE.md)
- [New Configuration File](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/nginx/conf.d/bsingh-multi-domain.conf)
- [SSL Setup Guide](file:///Users/brijeshkumarkushwaha/Documents/Brijesh/infra/ssl-setup/README.md)

---

## ✅ Migration Completion Checklist

- [ ] Backed up current configuration
- [ ] Created new configuration file
- [ ] Tested nginx configuration syntax
- [ ] Rebuilt nginx image
- [ ] Deployed to production
- [ ] Verified HTTP to HTTPS redirect
- [ ] Tested all existing subdomains
- [ ] Checked SSL certificates
- [ ] Reviewed nginx logs for errors
- [ ] Removed old configuration (optional)
- [ ] Updated team documentation

**Once all items are checked, your migration is complete! 🎉**
