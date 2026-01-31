# bsingh-infra Infrastructure

This project contains the Docker-based infrastructure for deploying multiple frontend and backend services.

## Deployment Workflows

There are two primary workflows for running this infrastructure:

1.  **Development Workflow**: Build images directly from source code. Ideal for local development and testing.
2.  **Production Workflow**: Pull pre-built images from Docker Hub. This is the recommended, faster, and more secure method for deploying to a live server.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- **Docker Hub Account** for pushing and pulling images.
- **SSH Key for GitHub** to clone the private `EduCors-Helper` repository during development builds.

---

## Method 1: Development Workflow (Build from Source)

Use this method on your local machine to build services directly from the Git source.

### 1. Initial Setup
- **Clone this repository**: `git clone <your-repo-url>`
- **Create `.env` file**: In the `infra/` directory, copy `.env.example` to `.env` and fill it with your development secrets.
  ```bash
  cp .env.example .env
  nano .env
  ```
- **Verify SSH Access**: Ensure your SSH key has access to the `EduCors-Helper` repository (`ssh -T git@github.com`).

### 2. Build and Run
From the `infra/` directory, run:
```bash
docker compose up -d --build
```
This command uses the `docker-compose.yml` file to clone the `EduCors-Helper` repo, build the service images, and start the containers.

---

## Method 2: Production Workflow (via Docker Hub)

This is a two-part process. First, you build and push images from your local machine. Second, you pull and run those images on your production server.

### Part A: Build and Push Images (On Your Local Machine)

1.  **Log in to Docker Hub**:
    *   You will be prompted for your Docker Hub username and password.
    ```bash
    docker login
    ```

2.  **Build the Tagged Images**:
    *   This command reads `docker-compose.yml`, builds each service, and tags the images for Docker Hub.
    ```bash
    docker compose build
    ```

3.  **Push the Images to Docker Hub**:
    *   This uploads the final images to your private repository on Docker Hub.
    ```bash
    docker compose push
    ```

### Part B: Deploy to Server (On Your Linux VM)

1.  **Initial Server Setup**:
    - Install Docker, Docker Compose, and Git on your server.
    - Clone this `bsingh-infra` repository.
    - Navigate into the `infra/` directory.
    - Create and configure your production `.env` file (`cp .env.example .env && nano .env`).

2.  **Log in to Docker Hub on the Server**:
    *   The server needs to log in to have permission to *pull* your private images.
    ```bash
    docker login
    ```

3.  **Pull and Run the Images**:
    *   This command uses the separate `docker-compose.prod.yml` file, which only pulls images and does not build anything.
    ```bash
    docker compose -f docker-compose.prod.yml pull
    docker compose -f docker-compose.prod.yml up -d
    ```
    Your services will now be running on your server.

---

## Services

Once running, the services are available at:

- **Frontend**: `http://localhost/` (or your server's IP)
- **Backend API**: `http://localhost/api/` (or `http://<server-ip>/api/`)
- **GetData API**: `http://localhost/getdata/` (or `http://<server-ip>/getdata/`)
