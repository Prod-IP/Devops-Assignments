# Helm — User → Order Microservices

Umbrella Helm chart that deploys the same stack as raw `k8s/` manifests:

**user-service** (LoadBalancer) → `http://order-service:4000/orders` (ClusterIP + CoreDNS)

```
helm/
├── README.md
├── scripts/
│   ├── deploy.sh
│   ├── destroy.sh
│   └── smoke-test.sh
└── microservices/                 # umbrella chart
    ├── Chart.yaml
    ├── values.yaml
    ├── templates/                 # ResourceQuota, LimitRange, NetworkPolicy
    └── charts/
        ├── user-service/          # subchart
        └── order-service/         # subchart
```

## Prerequisites

```bash
minikube start
minikube addons enable metrics-server   # optional, for HPA
helm version                            # Helm 3
```

## Quick start

From the **repo root** (`k8s-microservices-deployment/`):

```bash
./helm/scripts/deploy.sh
./helm/scripts/smoke-test.sh
./helm/scripts/destroy.sh
```

Or manually:

```bash
# Build images into Minikube
(cd user-service && minikube image build -t user-service:latest .)
(cd order-service && minikube image build -t order-service:latest .)

# Package local subcharts
helm dependency update ./helm/microservices

# Install (idempotent)
minikube tunnel &   # LoadBalancer EXTERNAL-IP
helm upgrade --install microservices ./helm/microservices \
  --namespace microservices --create-namespace --wait --timeout 5m

curl http://$(kubectl get svc user-service -n microservices -o jsonpath='{.status.loadBalancer.ingress[0].ip}')/api
```

## Stable DNS

Subcharts set `fullnameOverride` so Service names stay:

| Service | Type | DNS |
|---------|------|-----|
| `user-service` | LoadBalancer | public entry |
| `order-service` | ClusterIP | `http://order-service:4000` |

ConfigMap injects `ORDER_SERVICE_URL=http://order-service:4000` — same as the Kustomize path.

## Useful Helm commands

```bash
# Dry-run / render templates
helm template microservices ./helm/microservices -n microservices

# Lint
helm lint ./helm/microservices

# Status / history
helm status microservices -n microservices
helm history microservices -n microservices

# Upgrade after values change
helm upgrade microservices ./helm/microservices -n microservices --wait

# Rollback
helm rollback microservices -n microservices

# Uninstall release only (keep namespace)
helm uninstall microservices -n microservices
```

## Override values

```bash
# Example: scale user-service
helm upgrade microservices ./helm/microservices -n microservices \
  --set user-service.replicaCount=3 \
  --set user-service.hpa.maxReplicas=15

# Or use a values file
helm upgrade microservices ./helm/microservices -n microservices -f my-values.yaml
```

## vs raw Kustomize (`k8s/`)

| | `k8s/` | `helm/` |
|---|--------|---------|
| Apply | `kubectl apply -k k8s/` | `helm upgrade --install ...` |
| Config | edit YAML | `values.yaml` / `--set` |
| Rollback | `kubectl rollout undo` | `helm rollback` |
| Packaging | many files | one chart + subcharts |

Same apps, same DNS, same production knobs — pick the deploy style you want.
