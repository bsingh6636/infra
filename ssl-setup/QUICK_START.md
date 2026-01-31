# SSL Setup - Quick Reference

## 📂 Files Created

```
ssl-setup/
├── README.md                      # Full guide (start here!)
├── QUICK_START.md                 # This file
├── SSL_SETUP.md                   # Detailed documentation
├── setup-ssl.sh                   # 1️⃣ Initial setup (obtain certificates)
├── deploy-ssl.sh                  # 2️⃣ Deploy HTTPS config
├── check-ssl.sh                   # 📊 Check certificate status
├── add-domain.sh                  # ➕ Add new domains
├── renew-ssl.sh                   # 🔄 Manual renewal
├── bsingh-ssl.conf               # Nginx HTTPS configuration
└── docker-compose.prod-ssl.yml   # Docker Compose with SSL
```

## ⚡ Quick Commands

### On Production Server:

```bash
# 1. Setup SSL (one-time - obtains certificates)
cd ssl-setup
sudo ./setup-ssl.sh

# 2. Deploy configuration (activates HTTPS)
./deploy-ssl.sh
```

### Verify:
- Visit: https://cors-proxy.brijeshdev.space
- Check: Green padlock, HTTP→HTTPS redirect

### Monitor:
```bash
# Check certificate status and expiry
./check-ssl.sh

# Check certificate expiry
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run
```

### Manage Domains:
```bash
# Add new domain to certificate
sudo ./add-domain.sh new-domain.brijeshdev.space

# Then redeploy
./deploy-ssl.sh
```


## 🔑 Key Points

✅ **Free** - Let's Encrypt is 100% free  
✅ **Trusted** - Used by 300M+ websites  
✅ **Auto-Renews** - No manual intervention needed  
✅ **A+ Security** - Industry-grade SSL configuration  
✅ **HTTP/2** - Better performance included  

## 📖 Documentation

1. **Start here**: [ssl-setup/README.md](README.md)
2. **Detailed guide**: [ssl-setup/SSL_SETUP.md](SSL_SETUP.md)
3. **Main project**: [../README.md](../README.md)

## 🎯 Before You Start

Make sure:
- [ ] DNS A records configured
- [ ] Ports 80 & 443 open
- [ ] Updated EMAIL in setup-ssl.sh
- [ ] Have sudo access on server

That's it! The scripts handle everything else automatically.
