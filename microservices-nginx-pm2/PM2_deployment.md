# Task: Microservices Deployment Using Nginx & PM2

Deploy a **microservices-based Node.js application** on an Ubuntu EC2 instance using **PM2** for process management and **Nginx** as a reverse proxy.

### Requirements

Create at least **3 independent Node.js microservices**:

  * User Service — port 3001
  * Product Service — port 3002
  * Order Service — port 3003

Run and manage all services using **PM2**.

Create a single ecosystem.config.js for managing all services.

Configure PM2 to automatically restart failed services and start them after server reboot.

Configure **Nginx as a reverse proxy/API gateway**.

Route requests based on URL paths:

  * /api/users/* → User Service
  * /api/products/* → Product Service
  * /api/orders/* → Order Service

Do not expose ports 3001, 3002, or 3003 publicly.

Configure appropriate EC2 Security Group rules.

Add /health endpoints to every service.

Verify that each service is accessible through Nginx.

Demonstrate that stopping/crashing one service does not affect the other services.

Configure and demonstrate PM2 crash recovery.

Configure and verify PM2 and Nginx logs.

Configure the services to start automatically after an EC2 reboot.

Add basic service-to-service communication, e.g. Order Service communicating with Product Service.

### Bonus

Configure HTTPS using Let's Encrypt.
Implement PM2 cluster mode and demonstrate zero/minimal-downtime deployment.