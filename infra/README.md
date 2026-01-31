# bsingh-infra

This project contains the Docker-based infrastructure for deploying multiple frontend and backend services.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   [Docker](https://docs.docker.com/get-docker/)
*   [Docker Compose](https://docs.docker.com/compose/install/)
*   [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

### SSH Key for Private Repositories

This project builds services from a private Git repository (`EduCors-Helper`). For Docker to be able to clone this repository, you must have an SSH key configured on your machine that has access to the repository.

1.  [Generate a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent) if you don't have one.
2.  [Add the SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account).

## Configuration

This project uses environment variables for configuration.

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Open the `.env` file and replace the placeholder values with your actual secrets and configuration.

## Running the Infrastructure

To build and start all the services, run the following command from this directory (`infra/`):

```bash
docker-compose up -d --build
```

*   `--build`: This flag forces Docker to rebuild the images, which is necessary when you have pushed new code to your application repositories.
*   `-d`: This flag runs the containers in detached mode (in the background).

To stop the services, run:

```bash
docker-compose down
```

## Services

Once the infrastructure is running, the following services will be available:

*   **Frontend**: The main web application.
    *   URL: `http://localhost/`
*   **Backend API**: The main backend API.
    *   URL: `http://localhost/api/`
*   **GetData API**: The `getdata` service.
    *   URL: `http://localhost/getdata/`

## How to Add a New Service

This setup is designed to be easily extensible. To add a new service:

1.  **Add the service to `docker-compose.yml`**:
    *   Add a new service definition, specifying its Git repository as the `build.context`.
    *   Ensure the new service is added to the `bsingh-net` network.
2.  **Update Nginx Configuration (`nginx/conf.d/bsingh.conf`)**:
    *   Add a new `location` block to proxy requests to your new service. Choose a unique path for your service (e.g., `/api/new-service/`).
3.  **Rebuild and restart the services**:
    ```bash
    docker-compose up -d --build
    ```
