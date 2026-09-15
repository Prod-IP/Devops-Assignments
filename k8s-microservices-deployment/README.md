# K8s Microservices — User → Order Service Demo

Shareable demo: **user-service** calls **order-service** inside Kubernetes by **DNS name** (CoreDNS + ClusterIP) — never by pod IP.

```
Client ── GET /api ──► user-service (LoadBalancer :80)
                            │
                            ▼
                       user-service Pod (:3000)
                            │
            http://order-service:4000/orders   ← CoreDNS
                            │
                            ▼
                  order-service (ClusterIP :4000)
                            │
                            ▼
                       order-service Pod (:4000)
```

## Why this demo exists

Focus: **how one service calls another inside the cluster**.

| Piece | Role |
|-------|------|
| `user-service` | Public orchestrator — **LoadBalancer** |
| `order-service` | Internal backend — **ClusterIP only** |
| ConfigMap | Injects `ORDER_SERVICE_URL=http://order-service:4000` |
| NetworkPolicy | order-service only accepts traffic from user-service pods |

## Quick start

```bash
minikube start
minikube addons enable metrics-server   # optional, for HPA

cd k8s-microservices-deployment

./scripts/destroy.sh       # clean old service1/service2 deploy if any
./scripts/deploy.sh        # build :latest → apply -k → tunnel
./scripts/smoke-test.sh
```

### Hit the API

```bash
curl http://<EXTERNAL-IP>/health
curl http://<EXTERNAL-IP>/api
```

Example `/api` response:

```json
{
  "user": {
    "name": "user-service",
    "message": "Hello from User Service",
    "id": 1,
    "email": "alice@example.com"
  },
  "orders": {
    "name": "order-service",
    "message": "Hello from Order Service",
    "items": [
      { "id": 1, "item": "Widget", "quantity": 3 },
      { "id": 2, "item": "Gadget", "quantity": 1 }
    ],
    "timestamp": "..."
  },
  "combined": "user-service → order-service communicated via K8s DNS!"
}
```

## Layout

```
k8s-microservices-deployment/
├── user-service/          # Public — calls order-service
├── order-service/         # Internal — GET /orders
├── k8s/
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── limitrange.yaml
│   ├── configmap.yaml
│   ├── user-service-*.yaml
│   ├── order-service-*.yaml
│   ├── hpa-*.yaml
│   ├── pdb-*.yaml
│   └── networkpolicy.yaml
├── scripts/
│   ├── deploy.sh
│   ├── destroy.sh
│   └── smoke-test.sh
├── .gitignore
└── README.md
```

## Scripts (idempotent)

| Script | Behavior |
|--------|----------|
| `deploy.sh` | `minikube image build` → `user-service:latest` + `order-service:latest` → `kubectl apply -k` → restart → tunnel |
| `destroy.sh` | Delete namespace + remove images + stop tunnel |
| `smoke-test.sh` | 10 read-only checks |

### Images: `:latest` + `imagePullPolicy: Never`

Uses **`minikube image build`** (works with Docker *and* containerd).  
Avoid `eval $(minikube docker-env)` + `docker build` when Minikube uses containerd.

## How service-to-service calls work

1. Service `order-service` → CoreDNS: `order-service.microservices.svc.cluster.local`
2. Same-namespace short name: `order-service`
3. user-service reads `ORDER_SERVICE_URL` from ConfigMap
4. `GET /api` → `fetch(`${ORDER_SERVICE_URL}/orders`)`
5. kube-proxy load-balances ClusterIP across ready order-service pods

```bash
POD=$(kubectl get pod -n microservices -l app=user-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n microservices "$POD" -- node -e \
  'fetch("http://order-service:4000/orders").then(r=>r.json()).then(console.log)'
```

## Production practices

Namespace, **ResourceQuota**, LimitRange, ConfigMap, dedicated ServiceAccounts (`automountServiceAccountToken: false`), requests/limits, liveness/readiness probes, hardened `securityContext`, graceful SIGTERM, RollingUpdate (`maxUnavailable: 0`), HPA, PDB, NetworkPolicy, alpine non-root images, Kustomize.

## Publish as a new GitHub repo

```bash
cd Project_tasks/k8s-microservices-deployment
git init
git add .
git commit -m "Initial commit: user-service → order-service K8s DNS demo"
gh repo create k8s-microservices-deployment --public --source=. --remote=origin --push
```

## Notes

- **NetworkPolicy** needs a supporting CNI; smoke test still verifies order-service is ClusterIP-only.
- **HPA** needs metrics-server to scale on CPU.
- Re-deploy after code changes: `./scripts/deploy.sh`
