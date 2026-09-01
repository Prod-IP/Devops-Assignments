# Microservices Deployment: Node.js + PM2 + Nginx on Ubuntu EC2

> **Target:** Ubuntu 22.04 EC2 instance  
> **Stack:** Node.js 20 · PM2 (cluster mode) · Nginx (reverse proxy)  
> **Services:** user-service :3001 · product-service :3002 · order-service :3003

---

## Table of Contents

1. [EC2 Security Group Rules](#1-ec2-security-group-rules)
2. [Connect & Update Server](#2-connect--update-server)
3. [Install Node.js via NVM](#3-install-nodejs-via-nvm)
4. [Install PM2 Globally](#4-install-pm2-globally)
5. [Install Nginx](#5-install-nginx)
6. [Create Project Structure](#6-create-project-structure)
7. [Create User Service](#7-create-user-service)
8. [Create Product Service](#8-create-product-service)
9. [Create Order Service](#9-create-order-service-calls-product-service)
10. [Create PM2 Ecosystem Config](#10-create-pm2-ecosystem-config)
11. [Install npm Dependencies](#11-install-npm-dependencies)
12. [Configure Nginx Reverse Proxy](#12-configure-nginx-reverse-proxy)
13. [Start Services with PM2](#13-start-services-with-pm2)
14. [Enable Auto-Start on Reboot](#14-enable-auto-start-on-reboot)
15. [Verify Everything Works](#15-verify-everything-works)
16. [Crash Recovery Demo](#16-crash-recovery-demo)
17. [PM2 & Nginx Logs](#17-pm2--nginx-logs)
18. [Bonus: HTTPS with Let's Encrypt](#18-bonus-https-with-lets-encrypt)
19. [Bonus: Zero-Downtime Reload](#19-bonus-zero-downtime-reload)

---



## 1. EC2 Security Group Rules

In the AWS Console → EC2 → Security Groups, set **Inbound Rules**:


| Type  | Protocol | Port | Source    | Purpose            |
| ----- | -------- | ---- | --------- | ------------------ |
| SSH   | TCP      | 22   | Your IP   | Server access      |
| HTTP  | TCP      | 80   | 0.0.0.0/0 | Public web traffic |
| HTTPS | TCP      | 443  | 0.0.0.0/0 | TLS (bonus step)   |


> **Do NOT open ports 3001, 3002, or 3003.** They are internal only, accessed via Nginx.

---



## 2. Connect & Update Server

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Update system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

---



## 3. Install Node.js via NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load NVM into current shell session
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# Install Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x
```

---



## 4. Install PM2 Globally

```bash
npm install -g pm2

# Verify
pm2 --version
```

---



## 5. Install Nginx

```bash
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify
sudo systemctl status nginx
curl localhost   # Should return Nginx welcome page
```

---



## 6. Create Project Structure

```bash
mkdir -p ~/microservices/{user-service,product-service,order-service}
cd ~/microservices
```

---



## 7. Create User Service

```bash
cat > ~/microservices/user-service/index.js << 'EOF'
const express = require('express');
const app = express();
const PORT = 3001;

app.use(express.json());

const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob',   email: 'bob@example.com'   },
];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service', uptime: process.uptime(), pid: process.pid });
});

app.get('/api/users', (req, res) => {
  res.json({ service: 'user-service', data: users });
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ service: 'user-service', data: user });
});

app.listen(PORT, () => {
  console.log(`[user-service] Running on port ${PORT} | PID: ${process.pid}`);
});
EOF
```

```bash
cat > ~/microservices/user-service/package.json << 'EOF'
{
  "name": "user-service",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF
```

---



## 8. Create Product Service

```bash
cat > ~/microservices/product-service/index.js << 'EOF'
const express = require('express');
const app = express();
const PORT = 3002;

app.use(express.json());

const products = [
  { id: 1, name: 'Laptop',  price: 999,  stock: 50 },
  { id: 2, name: 'Phone',   price: 499,  stock: 120 },
  { id: 3, name: 'Tablet',  price: 299,  stock: 75 },
];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'product-service', uptime: process.uptime(), pid: process.pid });
});

app.get('/api/products', (req, res) => {
  res.json({ service: 'product-service', data: products });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ service: 'product-service', data: product });
});

app.listen(PORT, () => {
  console.log(`[product-service] Running on port ${PORT} | PID: ${process.pid}`);
});
EOF
```

```bash
cat > ~/microservices/product-service/package.json << 'EOF'
{
  "name": "product-service",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF
```

---



## 9. Create Order Service (calls Product Service)

```bash
cat > ~/microservices/order-service/index.js << 'EOF'
const express = require('express');
const axios   = require('axios');
const app     = express();
const PORT    = 3003;

app.use(express.json());

const PRODUCT_SERVICE = 'http://localhost:3002';

const orders = [
  { id: 1, userId: 1, productId: 2, quantity: 1 },
  { id: 2, userId: 2, productId: 1, quantity: 2 },
];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service', uptime: process.uptime(), pid: process.pid });
});

app.get('/api/orders', (req, res) => {
  res.json({ service: 'order-service', data: orders });
});

// Service-to-service: fetch product details for an order
app.get('/api/orders/:id', async (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const { data } = await axios.get(`${PRODUCT_SERVICE}/api/products/${order.productId}`);
    res.json({ service: 'order-service', data: { ...order, product: data.data } });
  } catch (err) {
    res.status(503).json({ error: 'product-service unavailable', order });
  }
});

app.listen(PORT, () => {
  console.log(`[order-service] Running on port ${PORT} | PID: ${process.pid}`);
});
EOF
```

```bash
cat > ~/microservices/order-service/package.json << 'EOF'
{
  "name": "order-service",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "axios":   "^1.6.0",
    "express": "^4.18.2"
  }
}
EOF
```

---



## 10. Create PM2 Ecosystem Config

```bash
cat > ~/microservices/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name:          'user-service',
      script:        './user-service/index.js',
      instances:     2,
      exec_mode:     'cluster',
      watch:         false,
      max_memory_restart: '200M',
      restart_delay: 1000,
      max_restarts:  10,
      env: {
        NODE_ENV: 'production',
        PORT:     3001,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  '/var/log/pm2/user-service-error.log',
      out_file:    '/var/log/pm2/user-service-out.log',
    },
    {
      name:          'product-service',
      script:        './product-service/index.js',
      instances:     2,
      exec_mode:     'cluster',
      watch:         false,
      max_memory_restart: '200M',
      restart_delay: 1000,
      max_restarts:  10,
      env: {
        NODE_ENV: 'production',
        PORT:     3002,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  '/var/log/pm2/product-service-error.log',
      out_file:    '/var/log/pm2/product-service-out.log',
    },
    {
      name:          'order-service',
      script:        './order-service/index.js',
      instances:     1,
      exec_mode:     'fork',
      watch:         false,
      max_memory_restart: '200M',
      restart_delay: 1000,
      max_restarts:  10,
      env: {
        NODE_ENV: 'production',
        PORT:     3003,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  '/var/log/pm2/order-service-error.log',
      out_file:    '/var/log/pm2/order-service-out.log',
    },
  ],
};
EOF
```

```bash
# Create PM2 log directory
sudo mkdir -p /var/log/pm2
sudo chown ubuntu:ubuntu /var/log/pm2
```

---



## 11. Install npm Dependencies

```bash
cd ~/microservices/user-service    && npm install
cd ~/microservices/product-service && npm install
cd ~/microservices/order-service   && npm install
cd ~/microservices
```

---



## 12. Configure Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/sites-available/microservices << 'EOF'
upstream user_service {
    server 127.0.0.1:3001;
    keepalive 32;
}

upstream product_service {
    server 127.0.0.1:3002;
    keepalive 32;
}

upstream order_service {
    server 127.0.0.1:3003;
    keepalive 32;
}

server {
    listen 80;
    server_name _;    # Replace _ with your domain or EC2 public IP

    access_log /var/log/nginx/microservices-access.log;
    error_log  /var/log/nginx/microservices-error.log;

    # User Service
    location /api/users/ {
        proxy_pass         http://user_service;
        proxy_http_version 1.1;
        proxy_set_header   Connection      "";
        proxy_set_header   Host            $host;
        proxy_set_header   X-Real-IP       $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    # Product Service
    location /api/products/ {
        proxy_pass         http://product_service;
        proxy_http_version 1.1;
        proxy_set_header   Connection      "";
        proxy_set_header   Host            $host;
        proxy_set_header   X-Real-IP       $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    # Order Service
    location /api/orders/ {
        proxy_pass         http://order_service;
        proxy_http_version 1.1;
        proxy_set_header   Connection      "";
        proxy_set_header   Host            $host;
        proxy_set_header   X-Real-IP       $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    # Health check endpoints (optional direct access)
    location /health/users {
        proxy_pass http://user_service/health;
    }
    location /health/products {
        proxy_pass http://product_service/health;
    }
    location /health/orders {
        proxy_pass http://order_service/health;
    }
}
EOF
```

```bash
# Enable the config and disable default site
sudo ln -s /etc/nginx/sites-available/microservices /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---



## 13. Start Services with PM2

```bash
cd ~/microservices

pm2 start ecosystem.config.js

# Check status
pm2 status
pm2 list
```

Expected output — all services should show **online**:

```
┌────┬──────────────────┬─────────┬─────────┬──────────┬────────┐
│ id │ name             │ mode    │ status  │ cpu      │ memory │
├────┼──────────────────┼─────────┼─────────┼──────────┼────────┤
│ 0  │ user-service     │ cluster │ online  │ 0%       │ 50mb   │
│ 1  │ user-service     │ cluster │ online  │ 0%       │ 50mb   │
│ 2  │ product-service  │ cluster │ online  │ 0%       │ 50mb   │
│ 3  │ product-service  │ cluster │ online  │ 0%       │ 50mb   │
│ 4  │ order-service    │ fork    │ online  │ 0%       │ 50mb   │
└────┴──────────────────┴─────────┴─────────┴──────────┴────────┘
```

---



## 14. Enable Auto-Start on Reboot

```bash
# Generate the startup command (run the output of this command as sudo)
pm2 startup

# PM2 will print something like:
# sudo env PATH=$PATH:/home/ubuntu/.nvm/versions/node/v20.x.x/bin \
#   /home/ubuntu/.nvm/versions/node/v20.x.x/lib/node_modules/pm2/bin/pm2 \
#   startup systemd -u ubuntu --hp /home/ubuntu
#
# COPY and RUN that exact command.

# Then freeze the current process list
pm2 save

# Verify systemd service is enabled
sudo systemctl status pm2-ubuntu
```

---



## 15. Verify Everything Works

```bash
EC2_IP="<YOUR_EC2_PUBLIC_IP>"

# Via Nginx (port 80) — what clients use
curl http://$EC2_IP/api/users
curl http://$EC2_IP/api/users/1
curl http://$EC2_IP/api/products
curl http://$EC2_IP/api/products/2
curl http://$EC2_IP/api/orders
curl http://$EC2_IP/api/orders/1    # Uses service-to-service call internally

# Health endpoints
curl http://$EC2_IP/health/users
curl http://$EC2_IP/health/products
curl http://$EC2_IP/health/orders

# Confirm internal ports are NOT publicly accessible (should timeout/refuse)
curl http://$EC2_IP:3001   # Should fail — not in Security Group
curl http://$EC2_IP:3002   # Should fail
curl http://$EC2_IP:3003   # Should fail
```

---



## 16. Crash Recovery Demo



### Demonstrate service isolation

```bash
# Stop user-service — products and orders must keep working
pm2 stop user-service

curl http://$EC2_IP/api/products    # Still works
curl http://$EC2_IP/api/orders      # Still works
curl http://$EC2_IP/api/users       # Returns 502 (expected — service is down)

# PM2 auto-restart: force-crash the process
pm2 delete user-service
pm2 start ecosystem.config.js --only user-service

# Watch PM2 restart a service after crash
kill $(pm2 pid user-service)        # Kill one worker
pm2 status                          # PM2 shows restart count +1, status: online
```



### Watch auto-restart in real time

```bash
pm2 logs user-service --lines 20
# Open another terminal and run:
kill -9 $(pm2 pid user-service)
# PM2 restarts it automatically — visible in logs
```

---



## 17. PM2 & Nginx Logs



### PM2 Logs

```bash
pm2 logs                            # Stream all service logs
pm2 logs user-service               # Single service
pm2 logs --lines 50                 # Last 50 lines
pm2 logs --err                      # Errors only

# Log files on disk
ls /var/log/pm2/
tail -f /var/log/pm2/user-service-out.log
tail -f /var/log/pm2/user-service-error.log

# PM2 log rotation (run once)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```



### Nginx Logs

```bash
sudo tail -f /var/log/nginx/microservices-access.log
sudo tail -f /var/log/nginx/microservices-error.log

# Combined view
sudo tail -f /var/log/nginx/microservices-access.log /var/log/nginx/microservices-error.log
```

---



## 18. Bonus: HTTPS with Let's Encrypt

> Requires a real domain name pointed to your EC2 IP via DNS A record.

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (replace yourdomain.com)
sudo certbot --nginx -d yourdomain.com

# Certbot will:
# 1. Verify domain ownership
# 2. Obtain certificate from Let's Encrypt
# 3. Auto-update /etc/nginx/sites-available/microservices for port 443
# 4. Set up HTTP → HTTPS redirect

# Verify auto-renewal
sudo certbot renew --dry-run

# Test HTTPS
curl https://yourdomain.com/api/users
```

---



## 19. Bonus: Zero-Downtime Reload

PM2 cluster mode enables rolling restarts — no dropped requests.

```bash
# Reload all services without downtime (cluster mode only)
pm2 reload all

# Reload a single service
pm2 reload user-service
pm2 reload product-service

# Compare: restart vs reload
# pm2 restart = stop + start (brief downtime)
# pm2 reload  = rolling restart, one worker at a time (zero downtime)

# Scale up on the fly
pm2 scale user-service 4      # Scale to 4 instances
pm2 scale user-service 2      # Scale back down

# Monitor CPU/memory in real time
pm2 monit
```

---



## Quick Reference — Common PM2 Commands


| Command                         | Description                         |
| ------------------------------- | ----------------------------------- |
| `pm2 start ecosystem.config.js` | Start all services                  |
| `pm2 status` / `pm2 list`       | Show process table                  |
| `pm2 stop <name>`               | Stop a service                      |
| `pm2 restart <name>`            | Restart (with brief downtime)       |
| `pm2 reload <name>`             | Zero-downtime reload (cluster only) |
| `pm2 delete <name>`             | Remove from PM2                     |
| `pm2 logs`                      | Stream all logs                     |
| `pm2 monit`                     | Real-time CPU/memory monitor        |
| `pm2 save`                      | Save process list for reboot        |
| `pm2 startup`                   | Generate systemd startup script     |
| `pm2 scale <name> <n>`          | Change instance count live          |


