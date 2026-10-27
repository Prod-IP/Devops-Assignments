# Production Lambda E-Commerce

Serverless NestJS e-commerce on AWS Lambda with DynamoDB, EventBridge, SQS, Cognito, Terraform, Bitbucket Pipelines, and Floci local AWS.

## Layout

```
apps/           auth, products, cart, orders, notifications, admin
packages/       common, db, powertools
infrastructure/ Terraform modules + env tfvars
scripts/        Floci seed + smoke tests
```

## Local development (Floci + Serverless Offline)

```bash
cp .env.example .env.local
docker compose up -d floci
# optional CLI: curl -fsSL https://floci.io/install.sh | sh && eval $(floci env)
export AWS_ENDPOINT_URL=http://localhost:4566 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
npm install
npm run infra:seed
# floci snapshot save dev-seed   # optional
npm run dev                      # http://localhost:3000/v1/...
```

Local auth (no Cognito): register/login returns `local.<token>`; pass as `Authorization: Bearer local...`. Cart/orders also accept `x-user-id` when offline.

## Tests

```bash
npm test          # unit + API controller tests (≥80% lines)
npm run test:int  # Floci integration (needs seed)
npm run smoke     # API_BASE_URL=... post-deploy
```

## Deploy (Terraform)

```bash
# one-time remote state
bash infrastructure/bootstrap-state.sh

cd infrastructure
terraform init -backend-config=environments/dev/backend.hcl
terraform apply -var-file=environments/dev/dev.tfvars

# prod
terraform init -backend-config=environments/prod/backend.hcl
terraform apply -var-file=environments/prod/prod.tfvars
```

Upload Lambda zip artifacts to the artifacts bucket keys in `var.artifact_keys` before apply, or wire CI packaging.

## CI/CD (Bitbucket)

See `bitbucket-pipelines.yml`:

1. Lint + unit tests + coverage  
2. Floci integration (develop/main)  
3. Terraform apply dev + smoke  
4. Manual prod deploy (OIDC, no long-lived keys)

Configure repository variables: `AWS_OIDC_ROLE_ARN_DEV`, `AWS_OIDC_ROLE_ARN_PROD`, `DEV_API_BASE_URL`.

## Secrets

SSM paths documented in [infrastructure/SECRETS.md](infrastructure/SECRETS.md).

## Rollback

- Pin Lambda alias `live` to a previous version  
- Or `terraform apply` previous artifact keys / state  
- Prod canary: use CodeDeploy with alarms from the monitoring module

## API (prefix `/v1`)

| Area | Routes |
|------|--------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Products | CRUD `/products`, `POST /products/:id/upload-url` |
| Cart | `/cart`, `/cart/items` |
| Orders | `/orders`, `PATCH /orders/:id/status` (admin) |
| Admin | `/admin/dashboard`, `/admin/users`, `/admin/orders` |
| Health | `GET /health` |
