#!/usr/bin/env bash
# deploy.sh — End-to-end deployment script
#
# Usage:
#   ./deploy.sh [init|apply|deploy|full|destroy|status|verify]
#
#   init     — terraform init only
#   apply    — terraform init + apply (provisions EC2)
#   deploy   — rsync code to server + restart PM2 services (server must exist)
#   full     — apply + deploy (provision + deploy code in one shot)
#   status   — show PM2 status on the server
#   verify   — curl all health endpoints through Nginx
#   destroy  — terraform destroy (tears down all AWS resources)
#
# Requirements (run from your local machine):
#   - terraform installed
#   - aws cli configured (aws configure)
#   - rsync installed
#   - SSH key added to ssh-agent or key path set in KEY_PATH
#
# Configuration — edit these or export them as env vars before running:

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
APP_DIR="$SCRIPT_DIR"

SSH_USER="${SSH_USER:-ubuntu}"
KEY_PATH="${KEY_PATH:-~/.ssh/id_rsa}"          # path to your PEM/private key
REMOTE_APP_DIR="/home/ubuntu/microservices"

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()     { echo -e "${BLUE}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────────────

get_server_ip() {
  cd "$INFRA_DIR"
  terraform output -raw public_ip 2>/dev/null || error "Run './deploy.sh apply' first to provision the server."
}

wait_for_ssh() {
  local ip=$1
  log "Waiting for SSH to become available at $ip ..."
  for i in $(seq 1 30); do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY_PATH" \
        "$SSH_USER@$ip" "echo ok" &>/dev/null; then
      success "SSH is ready."
      return 0
    fi
    echo -n "."
    sleep 10
  done
  error "SSH did not become available after 5 minutes."
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_init() {
  log "Initialising Terraform..."
  cd "$INFRA_DIR"
  [[ ! -f terraform.tfvars ]] && warn "terraform.tfvars not found — copy terraform.tfvars.example and fill in values."
  terraform init
  success "Terraform initialised."
}

cmd_apply() {
  cmd_init
  log "Applying Terraform (this provisions EC2, VPC, Security Groups)..."
  cd "$INFRA_DIR"
  terraform apply -auto-approve
  echo ""
  success "Infrastructure provisioned."
  echo ""
  terraform output
}

cmd_deploy() {
  local server_ip
  server_ip=$(get_server_ip)
  log "Deploying code to $server_ip ..."

  wait_for_ssh "$server_ip"

  log "Syncing microservices code..."
  rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'infra' \
    -e "ssh -i $KEY_PATH -o StrictHostKeyChecking=no" \
    "$APP_DIR/microservices/"      "$SSH_USER@$server_ip:$REMOTE_APP_DIR/microservices/"
  rsync -avz --progress \
    -e "ssh -i $KEY_PATH -o StrictHostKeyChecking=no" \
    "$APP_DIR/ecosystem.config.js" "$SSH_USER@$server_ip:$REMOTE_APP_DIR/"
  rsync -avz --progress \
    -e "ssh -i $KEY_PATH -o StrictHostKeyChecking=no" \
    "$APP_DIR/nginx.conf"          "$SSH_USER@$server_ip:/tmp/nginx-microservices.conf"

  log "Installing npm dependencies on server..."
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$server_ip" bash << 'REMOTE'
    set -e
    cd /home/ubuntu/microservices
    npm install --prefix microservices/user-service    microservices/user-service/
    npm install --prefix microservices/product-service microservices/product-service/
    npm install --prefix microservices/order-service   microservices/order-service/

    # Apply Nginx config
    sudo cp /tmp/nginx-microservices.conf /etc/nginx/sites-available/microservices
    sudo ln -sf /etc/nginx/sites-available/microservices /etc/nginx/sites-enabled/microservices
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl reload nginx

    # Create PM2 log dir
    sudo mkdir -p /var/log/pm2 && sudo chown ubuntu:ubuntu /var/log/pm2

    # Start or reload services
    if pm2 list | grep -q 'user-service'; then
      echo "Reloading existing PM2 processes (zero-downtime)..."
      pm2 reload ecosystem.config.js
    else
      echo "Starting PM2 processes for the first time..."
      pm2 start ecosystem.config.js
      pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | bash || true
    fi
    pm2 save
    pm2 status
REMOTE

  success "Deployment complete."
  echo ""
  cmd_verify
}

cmd_full() {
  cmd_apply
  echo ""
  log "Waiting 90s for user_data.sh to finish bootstrapping the server..."
  sleep 90
  cmd_deploy
}

cmd_status() {
  local server_ip
  server_ip=$(get_server_ip)
  log "PM2 status on $server_ip:"
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$SSH_USER@$server_ip" "pm2 status"
}

cmd_verify() {
  local server_ip
  server_ip=$(get_server_ip)
  log "Verifying endpoints via Nginx on http://$server_ip ..."
  echo ""

  endpoints=(
    "/health/users"
    "/health/products"
    "/health/orders"
    "/api/users"
    "/api/products"
    "/api/orders"
    "/api/orders/1"
  )

  all_ok=true
  for path in "${endpoints[@]}"; do
    http_code=$(curl -s -o /tmp/resp.json -w "%{http_code}" "http://$server_ip$path" || echo "000")
    if [[ "$http_code" == "200" ]]; then
      success "GET $path → $http_code"
    else
      warn    "GET $path → $http_code  (may still be starting up)"
      all_ok=false
    fi
  done

  echo ""
  if $all_ok; then
    success "All endpoints are healthy."
  else
    warn "Some endpoints failed — wait 30s and re-run: ./deploy.sh verify"
  fi
}

cmd_destroy() {
  warn "This will DESTROY all AWS resources (EC2, VPC, subnets, security groups, EIP)."
  read -rp "Type 'yes' to confirm: " confirm
  [[ "$confirm" != "yes" ]] && { log "Aborted."; exit 0; }
  cd "$INFRA_DIR"
  terraform destroy -auto-approve
  success "All resources destroyed."
}

# ── Entrypoint ────────────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 [init|apply|deploy|full|status|verify|destroy]"
  echo ""
  echo "  init     terraform init"
  echo "  apply    provision EC2 + VPC + Security Groups"
  echo "  deploy   sync code & restart PM2 on existing server"
  echo "  full     apply + deploy in one shot"
  echo "  status   show PM2 process list on the server"
  echo "  verify   curl all health + API endpoints"
  echo "  destroy  tear down all AWS resources"
  exit 1
}

COMMAND="${1:-full}"
case "$COMMAND" in
  init)    cmd_init    ;;
  apply)   cmd_apply   ;;
  deploy)  cmd_deploy  ;;
  full)    cmd_full    ;;
  status)  cmd_status  ;;
  verify)  cmd_verify  ;;
  destroy) cmd_destroy ;;
  *)       usage       ;;
esac
