#!/bin/bash
# user_data.sh — runs as root on first EC2 boot
# Server bootstrap only: installs Node (latest LTS), PM2, Nginx.
# App code is deployed separately via deploy.sh (rsync + npm install + pm2 start).
set -euo pipefail
exec > /var/log/user_data.log 2>&1

echo "=== [1/5] System update ==="
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git build-essential rsync

echo "=== [2/5] Install Node.js (latest LTS) via NodeSource ==="
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs
node --version
npm --version

# Upgrade npm itself to latest
npm install -g npm@latest

echo "=== [3/5] Install PM2 (latest) ==="
npm install -g pm2@latest
pm2 --version

echo "=== [4/5] Install and enable Nginx ==="
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

echo "=== [5/5] Prepare app directory and PM2 systemd unit ==="
APP_DIR="/home/ubuntu/microservices"
mkdir -p "$APP_DIR"
chown -R ubuntu:ubuntu "$APP_DIR"

# Create PM2 log directory
mkdir -p /var/log/pm2
chown -R ubuntu:ubuntu /var/log/pm2

# Register PM2 as a systemd service for the ubuntu user.
# This only creates the unit file — pm2 save is called by deploy.sh
# after the app is running so the process list is persisted correctly.
env PATH="$PATH:/usr/bin" pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "=== user_data.sh complete — server is ready for deploy.sh ==="
