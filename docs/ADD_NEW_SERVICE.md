# ➕ How to Add a New Service

This guide explains how to add a new microservice or web app to the infrastructure.

## 1. Local Development (`docker-compose.yml`)

Add your service to `docker-compose.yml` for local testing.

```yaml
  new-service:
    build:
      context: ./new-service  # or git url
    image: bsingh6636/bsingh-new-service:latest
    container_name: bsingh-new-service
    networks:
      - bsingh-net
    environment:
      - PORT=3000
```

## 2. Production Configuration (`docker-compose.prod.yml`)

Add the service to `docker-compose.prod.yml`. This uses the pre-built image from Docker Hub.

```yaml
  new-service:
    image: bsingh6636/bsingh-new-service:latest  # Must match build.sh image name
    container_name: bsingh-new-service
    restart: unless-stopped
    networks:
      - bsingh-net
    environment:
      - NODE_ENV=production
      - PORT=3000
```

## 3. Update Build Script (`build.sh`)

You need to tell the build script how to build this new service.

1.  **Add to Image List**:
    Update the `list_images` function:
    ```bash
    echo "  • new-service"
    ```

2.  **Define Build Context**:
    Update the `get_context` case statement:
    ```bash
    new-service) echo "$GITHUB_REPO#main:NewServiceDir" ;; 
    # OR for a separate repo:
    # new-service) echo "git@github.com:user/repo.git#main" ;;
    ```

3.  **Update "all" list (Optional)**:
    Add it to the default `all` list in the argument parsing section:
    ```bash
    all) IMAGES=(nginx backend frontend getdata portfolio new-service); shift ;;
    ```

## 4. Nginx Routing (`nginx/conf.d/bsingh.conf`)

Add a server block to route traffic to your new service.

**For a Subdomain (e.g., `new.brijeshdev.space`):**

```nginx
server {
    listen 80;
    server_name new.brijeshdev.space;

    location / {
        proxy_pass http://new-service:3000;  # Match container_name & port
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 5. SSL Setup

1.  **Update DNS**: Add an A record for `new.brijeshdev.space` pointing to your server IP.
2.  **Add to Config**: Edit `ssl-setup/domains.conf` and add the new domain to the `DOMAINS` array.
3.  **Update Certificates**:
    ```bash
    sudo ./ssl-setup/setup-ssl.sh
    ```
4.  **Deploy**:
    ```bash
    ./ssl-setup/deploy-ssl.sh
    ```

## 6. Deploy Everything

1.  **Build and Push**:
    ```bash
    ./build.sh new-service
    ```
2.  **Pull and Start on Server**:
    ```bash
    docker compose -f docker-compose.prod.yml pull new-service
    docker compose -f docker-compose.prod.yml up -d new-service
    # If you changed Nginx config:
    docker compose -f docker-compose.prod.yml restart nginx
    ```
