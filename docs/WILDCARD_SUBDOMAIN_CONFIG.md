# Wildcard Subdomain Configuration Guide

This document explains how random/undefined subdomains are handled in your nginx configuration.

---

## 🎯 Current Configuration

**Undefined subdomains redirect to main domain**

Examples:
- `randomword.brijeshdev.space` → `https://brijeshdev.space`
- `admin123.brijeshdev.space` → `https://brijeshdev.space`
- `anything.brijeshdev.space` → `https://brijeshdev.space`

---

## 🔧 How It Works

### Map Directive (Line 10)
```nginx
map $host $backend_service {
    default "redirect";  # Anything not defined = redirect
    
    # Defined subdomains
    cors-proxy.brijeshdev.space          "frontend:80";
    api-cors-proxy.brijeshdev.space      "backend:9090";
    ...
}
```

### Redirect Logic (Lines 101-103)
```nginx
if ($backend_service = "redirect") {
    return 301 https://brijeshdev.space$request_uri;
}
```

---

## 🎨 Alternative Configurations

### Option 1: Redirect to Main Domain (Current)
```nginx
default "redirect";

# In location block:
if ($backend_service = "redirect") {
    return 301 https://brijeshdev.space$request_uri;
}
```
**Result:** `randomword.brijeshdev.space` → `https://brijeshdev.space`

---

### Option 2: Show 404 Error
```nginx
default "404";

# In location block:
if ($backend_service = "404") {
    return 404 "Subdomain not found";
}
```
**Result:** Shows "404 Not Found" error

---

### Option 3: Show Default Frontend
```nginx
default "frontend:80";

# No special handling needed
```
**Result:** Shows frontend app for all undefined subdomains

---

### Option 4: Custom Landing Page
Create a simple nginx container with a static page:

```nginx
default "landing:80";

# Add to docker-compose.prod.yml:
# landing:
#   image: nginx:alpine
#   volumes:
#     - ./landing-page:/usr/share/nginx/html
```
**Result:** Shows custom "subdomain not found" page

---

## 🔄 Changing Behavior

### To Change to 404 Error:
1. Edit `nginx/conf.d/bsingh-multi-domain.conf`
2. Line 10: Change `default "redirect";` to `default "404";`
3. Lines 101-103: Change to:
   ```nginx
   if ($backend_service = "404") {
       return 404 "Subdomain not found";
   }
   ```
4. Rebuild: `./build.sh nginx && ./ssl-setup/deploy-ssl.sh`

### To Change to Show Frontend:
1. Line 10: Change `default "redirect";` to `default "frontend:80";`
2. Remove the if block (lines 101-103)
3. Rebuild and deploy

---

## 🧪 Testing

```bash
# Test undefined subdomain
curl -I https://randomtest123.brijeshdev.space

# Should see:
HTTP/2 301
location: https://brijeshdev.space/
```

---

## 📋 Defined Subdomains (Won't Redirect)

These subdomains are explicitly mapped and will work normally:
- `brijeshdev.space` → Portfolio
- `portfolio.brijeshdev.space` → Portfolio
- `cors-proxy.brijeshdev.space` → Frontend
- `api-cors-proxy.brijeshdev.space` → Backend API
- `getdata-cors-proxy.brijeshdev.space` → GetData Service

**Only undefined subdomains will redirect!**
