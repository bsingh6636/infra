This project is focused on building a Docker-based infrastructure that supports multiple frontend and backend services.

All Docker images will be built locally during development. The same images and configuration should be reusable on any cloud-hosted Linux machine by simply pulling the repository and restarting the containers.

The setup must:
- Support multiple independent frontend applications
- Support multiple independent backend (API) services
- Use Docker and Docker Compose for orchestration
- Be cloud-ready and portable (local → VM → cloud)
- Avoid environment-specific assumptions
- Follow best practices for containerization and service isolation

The goal is to create a production-style infrastructure that can be easily deployed, scaled, and maintained across different machines without rewriting configuration.
