#!/usr/bin/env bash
# Idempotent Helm deploy: build images → helm upgrade --install → tunnel.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHART_DIR="${ROOT_DIR}/helm/microservices"
NS="microservices"
RELEASE="microservices"
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
require_cmd helm

if ! minikube status >/dev/null 2>&1; then
  error "Minikube is not running. Start it with: minikube start"
  exit 1
fi

build_image user-service
build_image order-service

info "Updating Helm chart dependencies..."
helm dependency update "${CHART_DIR}"

if pgrep -f "minikube tunnel" >/dev/null 2>&1; then
  warn "minikube tunnel already running — skipping"
else
  info "Starting minikube tunnel in background (may prompt for sudo)..."
  nohup minikube tunnel >"${TUNNEL_LOG}" 2>&1 &
  echo $! > "${ROOT_DIR}/.minikube-tunnel.pid"
  sleep 3
fi

info "Installing/upgrading Helm release '${RELEASE}' (idempotent)..."
helm upgrade --install "${RELEASE}" "${CHART_DIR}" \
  --namespace "${NS}" \
  --create-namespace \
  --wait \
  --timeout 5m

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

info "Helm deploy complete!"
echo ""
echo "  Release    : ${RELEASE}"
echo "  Namespace  : ${NS}"
echo "  EXTERNAL-IP: ${EXTERNAL_IP}"
echo ""
echo "  Health : curl http://${EXTERNAL_IP}/health"
echo "  API    : curl http://${EXTERNAL_IP}/api"
echo ""
echo "  Smoke tests: ./helm/scripts/smoke-test.sh"
echo ""
