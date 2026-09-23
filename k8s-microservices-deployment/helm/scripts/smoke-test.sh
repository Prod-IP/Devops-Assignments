#!/usr/bin/env bash
# Read-only smoke tests for Helm-deployed release — safe to re-run.
set -uo pipefail

NS="microservices"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}  $*"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC}  $*"; FAIL=$((FAIL + 1)); }
info() { echo -e "${YELLOW}----${NC} $*"; }

if ! kubectl get ns "${NS}" >/dev/null 2>&1; then
  echo -e "${RED}Namespace '${NS}' not found. Run ./helm/scripts/deploy.sh first.${NC}"
  exit 1
fi

EXTERNAL_IP="$(kubectl get svc user-service -n "${NS}" \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
if [[ -z "${EXTERNAL_IP}" ]]; then
  EXTERNAL_IP="$(kubectl get svc user-service -n "${NS}" \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
fi

if [[ -z "${EXTERNAL_IP}" ]]; then
  echo -e "${RED}No EXTERNAL-IP on user-service. Is minikube tunnel running?${NC}"
  exit 1
fi

BASE="http://${EXTERNAL_IP}"
info "Using EXTERNAL-IP: ${EXTERNAL_IP}"
echo ""

HTTP_CODE="$(curl -s -o /tmp/ms-health1.json -w '%{http_code}' --max-time 5 "${BASE}/health" || echo "000")"
if [[ "${HTTP_CODE}" == "200" ]]; then
  pass "TEST 1  — user-service /health → HTTP 200"
else
  fail "TEST 1  — user-service /health → HTTP ${HTTP_CODE} (expected 200)"
fi

USER_POD="$(kubectl get pod -n "${NS}" -l app=user-service \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [[ -n "${USER_POD}" ]] && kubectl exec -n "${NS}" "${USER_POD}" -- node -e '
fetch("http://order-service:4000/health", { signal: AbortSignal.timeout(5000) })
  .then(r => { if (!r.ok) process.exit(1); return r.json(); })
  .then(j => { console.log(JSON.stringify(j)); })
  .catch(() => process.exit(1));
' >/tmp/ms-health2.json 2>/dev/null; then
  pass "TEST 2  — order-service /health reachable via ClusterIP DNS from user-service pod"
else
  fail "TEST 2  — order-service /health NOT reachable via ClusterIP DNS from user-service pod"
fi

HTTP_CODE="$(curl -s -o /tmp/ms-api.json -w '%{http_code}' --max-time 10 "${BASE}/api" || echo "000")"
if [[ "${HTTP_CODE}" == "200" ]]; then
  pass "TEST 3  — GET /api → HTTP 200"
else
  fail "TEST 3  — GET /api → HTTP ${HTTP_CODE} (expected 200)"
fi

API_BODY="$(cat /tmp/ms-api.json 2>/dev/null || echo "")"

if echo "${API_BODY}" | grep -q '"user"'; then
  pass "TEST 4  — /api response contains \"user\" key"
else
  fail "TEST 4  — /api response missing \"user\" key"
fi

if echo "${API_BODY}" | grep -q '"orders"'; then
  pass "TEST 5  — /api response contains \"orders\" key"
else
  fail "TEST 5  — /api response missing \"orders\" key"
fi

if echo "${API_BODY}" | grep -q '"combined"'; then
  pass "TEST 6  — /api response contains \"combined\" key"
else
  fail "TEST 6  — /api response missing \"combined\" key"
fi

ORDER_TYPE="$(kubectl get svc order-service -n "${NS}" -o jsonpath='{.spec.type}' 2>/dev/null || true)"
ORDER_EXT="$(kubectl get svc order-service -n "${NS}" \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
if [[ "${ORDER_TYPE}" == "ClusterIP" && -z "${ORDER_EXT}" ]]; then
  pass "TEST 7  — order-service is ClusterIP only (not reachable from outside)"
else
  fail "TEST 7  — order-service unexpectedly exposed (type=${ORDER_TYPE}, external=${ORDER_EXT})"
fi

if [[ -n "${USER_POD}" ]] && kubectl exec -n "${NS}" "${USER_POD}" -- node -e '
fetch("http://order-service.microservices.svc.cluster.local:4000/health", { signal: AbortSignal.timeout(5000) })
  .then(r => { if (!r.ok) process.exit(1); })
  .catch(() => process.exit(1));
' >/dev/null 2>&1; then
  pass "TEST 8  — order-service FQDN DNS resolves inside cluster"
else
  fail "TEST 8  — order-service FQDN DNS does NOT resolve inside cluster"
fi

USER_MIN="$(kubectl get hpa user-service-hpa -n "${NS}" -o jsonpath='{.spec.minReplicas}' 2>/dev/null || echo "")"
ORDER_MIN="$(kubectl get hpa order-service-hpa -n "${NS}" -o jsonpath='{.spec.minReplicas}' 2>/dev/null || echo "")"
if [[ "${USER_MIN}" == "2" && "${ORDER_MIN}" == "2" ]]; then
  pass "TEST 9  — HPA exists with minReplicas=2 for both services"
else
  fail "TEST 9  — HPA minReplicas mismatch (user=${USER_MIN}, order=${ORDER_MIN})"
fi

if kubectl get pdb user-service-pdb -n "${NS}" >/dev/null 2>&1 \
  && kubectl get pdb order-service-pdb -n "${NS}" >/dev/null 2>&1; then
  pass "TEST 10 — PDB exists for both services"
else
  fail "TEST 10 — PDB missing for one or both services"
fi

echo ""
echo "─────────────────────────"
TOTAL=$((PASS + FAIL))
echo "Summary: ${PASS}/${TOTAL} tests passed"
echo "─────────────────────────"

rm -f /tmp/ms-health1.json /tmp/ms-health2.json /tmp/ms-api.json 2>/dev/null || true

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
