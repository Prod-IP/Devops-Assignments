#!/usr/bin/env bash
# Idempotent Helm destroy: uninstall release, delete namespace, remove images, stop tunnel.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NS="microservices"
RELEASE="microservices"
PID_FILE="${ROOT_DIR}/.minikube-tunnel.pid"
TUNNEL_LOG="${ROOT_DIR}/.minikube-tunnel.log"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

if command -v helm >/dev/null 2>&1; then
  info "Uninstalling Helm release '${RELEASE}' (ignore-not-found)..."
  helm uninstall "${RELEASE}" -n "${NS}" 2>/dev/null || true
else
  warn "helm not found — skipping helm uninstall"
fi

info "Deleting namespace '${NS}' (ignore-not-found)..."
kubectl delete namespace "${NS}" --ignore-not-found=true --wait=true

if command -v minikube >/dev/null 2>&1 && minikube status >/dev/null 2>&1; then
  info "Removing images from Minikube (ignore missing)..."
  minikube image rm user-service:latest 2>/dev/null || true
  minikube image rm order-service:latest 2>/dev/null || true
else
  warn "Minikube not running — skipping image cleanup"
fi

info "Stopping minikube tunnel (ignore if not running)..."
if [[ -f "${PID_FILE}" ]]; then
  TUNNEL_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${TUNNEL_PID}" ]]; then
    kill "${TUNNEL_PID}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
fi
pkill -f "minikube tunnel" 2>/dev/null || true
rm -f "${TUNNEL_LOG}"

info "Destroyed. Cluster is clean."
