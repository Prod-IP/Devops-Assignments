#!/usr/bin/env bash
# Idempotent deploy: build :latest images into Minikube, apply manifests, wait, tunnel.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NS="microservices"
TUNNEL_LOG="${ROOT_DIR}/.minikube-tunnel.log"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1"
    exit 1
  fi
}

build_image() {
  local name="$1"
  local ctx="${ROOT_DIR}/${name}"

  if [[ ! -f "${ctx}/Dockerfile" ]]; then
    error "Missing Dockerfile at ${ctx}/Dockerfile"
    exit 1
  fi

  info "Building ${name}:latest into Minikube..."
  if ! (cd "${ctx}" && minikube image build -t "${name}:latest" .); then
    error "Failed to build ${name}:latest"
    exit 1
  fi
}

require_cmd minikube
require_cmd kubectl

if ! minikube status >/dev/null 2>&1; then
  error "Minikube is not running. Start it with: minikube start"
  exit 1
fi

# Prefer `minikube image build` — works with docker AND containerd runtimes.
build_image user-service
build_image order-service

info "Applying Kubernetes manifests via Kustomize (idempotent)..."
kubectl apply -k "${ROOT_DIR}/k8s/"

info "Restarting deployments to pick up new :latest images..."
kubectl rollout restart deployment/order-service -n "${NS}"
kubectl rollout restart deployment/user-service -n "${NS}"

info "Waiting for order-service rollout..."
kubectl rollout status deployment/order-service -n "${NS}" --timeout=180s

info "Waiting for user-service rollout..."
kubectl rollout status deployment/user-service -n "${NS}" --timeout=180s

if pgrep -f "minikube tunnel" >/dev/null 2>&1; then
  warn "minikube tunnel already running — skipping"
else
  info "Starting minikube tunnel in background (may prompt for sudo)..."
  nohup minikube tunnel >"${TUNNEL_LOG}" 2>&1 &
  echo $! > "${ROOT_DIR}/.minikube-tunnel.pid"
  sleep 3
fi

info "Waiting for LoadBalancer EXTERNAL-IP..."
EXTERNAL_IP=""
for _ in $(seq 1 60); do
  EXTERNAL_IP="$(kubectl get svc user-service -n "${NS}" \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  if [[ -z "${EXTERNAL_IP}" ]]; then
    EXTERNAL_IP="$(kubectl get svc user-service -n "${NS}" \
      -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  fi
  if [[ -n "${EXTERNAL_IP}" && "${EXTERNAL_IP}" != "pending" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "${EXTERNAL_IP}" || "${EXTERNAL_IP}" == "pending" ]]; then
  warn "EXTERNAL-IP not assigned yet. Check: kubectl get svc user-service -n ${NS}"
  warn "Ensure minikube tunnel is running: minikube tunnel"
  warn "Then curl: http://<EXTERNAL-IP>/api"
  exit 0
fi

info "Deploy complete!"
echo ""
echo "  Namespace : ${NS}"
echo "  EXTERNAL-IP: ${EXTERNAL_IP}"
echo ""
echo "  Health : curl http://${EXTERNAL_IP}/health"
echo "  API    : curl http://${EXTERNAL_IP}/api"
echo ""
echo "  Smoke tests: ./scripts/smoke-test.sh"
echo ""
