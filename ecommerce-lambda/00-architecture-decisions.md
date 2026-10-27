# Architecture Decision Record — AWS Lambda Platform

> Pre-development decisions. Resolve these before writing a single line of production code.

**Status:** Finalized for NestJS Lambdalith  
**Audience:** Engineering leads, DevOps, Backend team  
**Platform choice:** One NestJS app → one Lambda (`@vendia/serverless-express`). All later recommendations assume this.

---

## Table of Contents

1. [Function Granularity — Lambdalith vs Per-Route vs Per-Resource](#1-function-granularity)
2. [API Exposure — API Gateway vs Function URLs vs ALB](#2-api-exposure)
3. [Auth & SSO — Cognito vs Alternatives](#3-auth--sso)
4. [Traceability — Powertools, X-Ray, OpenTelemetry](#4-traceability)
5. [CI/CD Pipeline — Design Before First Commit](#5-cicd-pipeline)
6. [Local Development — Serverless Offline vs Floci vs Both](#6-local-development)
7. [Common Layer vs Modules](#7-common-layer-vs-modules)
8. [Validation — Zod, Powertools Parser, or Middy](#8-validation--zod-powertools-parser-or-middy)
9. [Skills.md — Cursor Agent Skills for This Platform](#9-skillsmd--cursor-agent-skills-for-this-platform)
10. [Downstream Protection — Reserved Concurrency](#10-downstream-protection--reserved-concurrency)
11. [Decision Summary Table](#11-decision-summary)

---

## 1. Function Granularity

> **Question:** Monolith API (NestJS Lambdalith) OR one function per route OR one function per resource/controller?

### ✅ Final decision: NestJS Lambdalith (single Lambda)

The entire NestJS application runs as **one** Lambda via `@vendia/serverless-express`. Nest owns routing, guards, pipes, and interceptors.

```
Client ──► Lambda Function URL ──► ONE Lambda
                                      └── NestJS App
                                            ├── UsersModule
                                            ├── OrdersModule
                                            └── ProductsModule
```

**Pros (why we chose it)**
- ✅ Familiar NestJS patterns — DI, guards, pipes, interceptors all work as-is
- ✅ Single deployment unit — one artifact, one deploy target
- ✅ Shared DB connection pool reused across all routes on warm instances
- ✅ Local dev = normal Nest (`npm run start:dev`)
- ✅ Simpler CI/CD — one zip, one smoke URL

**Cons (accepted trade-offs)**
- ❌ Larger bundle → slower cold starts (mitigate: esbuild + ARM64; optional provisioned concurrency later)
- ❌ One noisy route can starve concurrency for others
- ❌ One bad deploy affects all routes
- ❌ No per-route reserved concurrency / IAM (see §4, §10 for compensations)
- ❌ Powertools full stack is a poor fit (see §4)

Keep Nest **modules** clean (`UsersModule`, `OrdersModule`, …) so a later split into per-resource Lambdas is a packaging change, not a rewrite.

### Alternatives considered (not chosen)

| Option | When it would win | Why not now |
|--------|-------------------|-------------|
| **B — One function per route** | Extreme isolation / compliance | Config explosion; lose Nest DI |
| **C — One function per resource** | Multi-team domains, precise concurrency/IAM | More ops; we optimize for Nest velocity instead |

### ⚠️ What not to bolt onto the Lambdalith

| Pattern | Verdict on monolith |
|---------|---------------------|
| Full **Powertools** (Tracer/Metrics/Parser middleware) | ❌ Don’t — use Nest interceptors (§4) |
| **reservedConcurrency** as per-route downstream shield | ❌ Don’t — use SQS workers + in-process limits (§10) |
| **API Gateway** for path routing | ❌ Don’t need — Nest routes; use Function URL (§2) |
| **Step Functions** inside the Nest process | ❌ Don’t — the Lambdalith calls `StartExecution`. States live in ASL. See [17-step-functions.md](./17-step-functions.md) |
| **Lambda@Edge / CloudFront Functions** as the API | ❌ Don’t — edge rewrites the request in front of CloudFront. Nest stays in-region. See [18-edge-functions.md](./18-edge-functions.md) |

```yaml
# serverless.yml — Nest Lambdalith
functions:
  api:
    handler: src/lambda.handler
    url: true                    # Function URL (see §2)
    timeout: 29
    memorySize: 1024
    # optional soft account brake — NOT per-route protection:
    # reservedConcurrency: 100

  # Optional: async workers OUTSIDE the monolith for fragile APIs (§10)
  partnerNotifyWorker:
    handler: src/workers/partner-notify.handler
    reservedConcurrency: 5
    events:
      - sqs:
          arn: !GetAtt PartnerNotifyQueue.Arn
          batchSize: 1
```

```typescript
// src/lambda.ts — single entry
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import express from 'express';
import { AppModule } from './app.module';

let handler: ReturnType<typeof serverlessExpress>;

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  app.enableCors();
  await app.init();
  return serverlessExpress({ app: expressApp });
}

export const main = async (event: unknown, context: unknown) => {
  handler ??= await bootstrap();
  return handler(event, context);
};
```

---

## 2. API Exposure

> **Question:** API Gateway (REST vs HTTP) OR ALB OR Function URLs?

### Options Compared

| | REST API Gateway | HTTP API Gateway | ALB | Function URL |
|---|---|---|---|---|
| **Cost** | $3.50/M req | $1.00/M req | $0.008/LCU-hr | $0.20/M req ✅ |
| **Auth (Cognito/JWT)** | ✅ Native | ✅ Native | Manual | Manual (Nest guard) ✅ |
| **WAF support** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ (use CloudFront+WAF if needed) |
| **Custom domain** | ✅ | ✅ | ✅ | Via CloudFront / custom domain on URL |
| **Path routing to many Lambdas** | ✅ | ✅ | ✅ | ❌ N/A — one function |
| **Cold start overhead** | ~10ms | ~1ms | ~1ms | ~0ms ✅ |

### Why API Gateway is optional on a Nest Lambdalith

Nest already owns `/users`, `/orders`, … . A Gateway `ANY /{proxy+}` → one Lambda adds cost and latency without multi-function routing value.

| Need | Use |
|------|-----|
| HTTPS into Nest | **Lambda Function URL** (default) |
| Edge JWT / WAF / API keys / stages | Add **HTTP API** or **CloudFront + WAF** later |
| Multi-Lambda path split later | Introduce HTTP API when you leave the monolith |

### ✅ Final decision: Lambda Function URL (no API Gateway by default)

```yaml
functions:
  api:
    handler: src/lambda.handler
    url:
      cors:
        allowedOrigins: ['https://app.example.com']
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id']
        allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
```

**Add HTTP API Gateway later only if** you need native Cognito JWT at the edge (before Lambda), WAF-on-API, usage plans, or you split into multiple Lambdas.

`url: true` with no `authorizer` creates `AuthType=NONE` (public). Invoking a Function URL always needs **both** `lambda:InvokeFunctionUrl` **and** `lambda:InvokeFunction` on the resource policy — missing the second statement returns HTTP 403. AWS's production default is `AuthType=AWS_IAM` (SigV4), with CloudFront Origin Access Control in front. Nest JWT on a public URL is a deliberate trade-off; pair it with WAF via CloudFront, throttling, and in-code auth. Never leave `NONE` with no application auth.

---

## 3. Auth & SSO

> **Question:** Cognito, Auth0, or custom JWT? What about enterprise SSO?

### Options

```
┌──────────────────────────────────────────────────────────────┐
│  Auth Options                                                │
│                                                              │
│  Cognito User Pools     → AWS-native, free tier, OIDC/SAML  │
│  Cognito + Federation   → Enterprise SSO (Google, SAML, AD) │
│  Auth0 / Okta           → Best DX, costly at scale          │
│  Clerk                  → Modern, great DX, per-MAU pricing │
│  Custom JWT             → Full control, full responsibility  │
└──────────────────────────────────────────────────────────────┘
```

### Cognito User Pools — Deep Dive (Function URL + Nest)

```
User                 Cognito User Pool           Lambda Function URL → Nest
 │                          │                           │
 │── login (email/pass) ──► │                           │
 │◄── JWT tokens (3) ───── │                           │
 │                          │                           │
 │── API + Authorization: Bearer <access_token> ──────► │
 │                          │                           │── CognitoAuthGuard
 │                          │                           │   (JWKS verify) ✅
 │◄── API response ──────────────────────────────────── │
```

**Tokens issued:**
- `id_token` — user attributes (email, name, custom claims)
- `access_token` — scopes/groups — **use this for API authorization**
- `refresh_token` — long-lived, renews access tokens

```typescript
// Nest guard verifies JWT (issuer = Cognito pool, audience = app client)
// Controllers read the authenticated user via @CurrentUser()
@UseGuards(CognitoAuthGuard)
@Get('orders')
list(@CurrentUser() user: { sub: string; groups?: string[] }) {
  return this.orders.listForUser(user.sub);
}
```

```yaml
# serverless.yml — Function URL; auth is in Nest, not Gateway
functions:
  api:
    handler: src/lambda.handler
    url: true
    environment:
      COGNITO_ISSUER: https://cognito-idp.${aws:region}.amazonaws.com/${self:custom.userPoolId}
      COGNITO_AUDIENCE: ${self:custom.userPoolClientId}
```

### Enterprise SSO (SAML / OIDC Federation)

```
Corporate AD / Google Workspace / Okta
         │
         │ SAML 2.0 or OIDC
         ▼
Cognito Identity Provider (federation)
         │
         │ issues Cognito JWT
         ▼
Function URL → Nest CognitoAuthGuard → Lambda
```

```bash
# Add enterprise IdP to Cognito (example: Google Workspace)
aws cognito-idp create-identity-provider \
  --user-pool-id us-east-1_abc123 \
  --provider-name Google \
  --provider-type Google \
  --provider-details \
    client_id=<google-client-id>,client_secret=<secret>,authorize_scopes="email openid profile"
```

### Decision Matrix

| Scenario | Recommendation |
|----------|---------------|
| B2C product, own user base | **Cognito User Pools** |
| Enterprise customers with corporate SSO | **Cognito + SAML/OIDC federation** |
| Need advanced auth flows (passwordless, magic link) | **Clerk** or **Auth0** |
| Already on AWS, tight budget | **Cognito** (50k MAU free) |
| Large scale (500k+ MAU) with complex rules | **Auth0** or **Okta** |

### ✅ Final decision: Cognito User Pools + Nest JWT AuthGuard

Because we use a **Function URL** (no API Gateway JWT authorizer), verify Cognito tokens **inside Nest**.

- **Cognito User Pools** — identity, free 50k MAU, SSO-ready via SAML/OIDC federation later
- **Nest `AuthGuard`** — validate JWT against Cognito JWKS (`issuer` + `audience` = app client id)
- **RBAC** — read `cognito:groups` in guards/decorators
- **Optional later:** put HTTP API in front if you want JWT rejected before Lambda cold-start cost

```typescript
// Nest verifies Bearer token — not API Gateway
@UseGuards(CognitoAuthGuard)
@Get('me')
me(@CurrentUser() user: CognitoUser) {
  return user;
}
```

---

## 4. Traceability

> **Question:** How will we trace requests end-to-end? Powertools/X-Ray, OpenTelemetry, Datadog?

### The Three Pillars We Need

```
Logs      → What happened?    (structured JSON per request / route)
Metrics   → How often/fast?   (error rate, duration, cold starts, per-route)
Traces    → Where did it slow? (Lambda → DB → external API)
```

### Options

| Tool | Logs | Metrics | Traces | Fit for Nest Lambdalith |
|------|------|---------|--------|-------------------------|
| **Nest interceptors + structured JSON + X-Ray SDK** | ✅ | ✅ EMF / CW | ✅ | ✅ **Chosen** |
| **Full AWS Powertools middleware** | ✅ | ✅ | ✅ | ❌ Poor — one handler for all routes |
| **OpenTelemetry** | ✅ | ✅ | ✅ | ✅ OK if you need exportability later |
| **Datadog** | ✅ | ✅ | ✅ | Costly |
| **console.log only** | ❌ | ❌ | ❌ | ❌ |

### ✅ Final decision: Nest-native observability (not Powertools-primary)

Powertools assumes discrete Lambda handlers. On a Lambdalith, Nest already has the request lifecycle — use that.

| Pillar | Approach |
|--------|----------|
| **Logs** | Nest logging interceptor → structured JSON (`level`, `route`, `method`, `status`, `correlationId`, `durationMs`) |
| **Metrics** | CloudWatch EMF from interceptor (per-route counts/latency) + Lambda platform metrics |
| **Traces** | Enable X-Ray on the function; instrument AWS SDK; optional subsegments around downstream HTTP |
| **Powertools** | Optional: **Logger only** as a JSON helper. Skip Tracer/Metrics/Parser middleware as the app framework. |
| **Workers** | Thin SQS worker Lambdas *may* use Powertools Parser/Logger — they are discrete handlers |

```typescript
// Nest interceptor — primary observability on the monolith
@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
    req.correlationId = correlationId;
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          console.log(JSON.stringify({
            level: 'INFO',
            msg: 'request',
            correlationId,
            method: req.method,
            route: req.route?.path ?? req.url,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }));
        },
        error: (err) => {
          console.error(JSON.stringify({
            level: 'ERROR',
            msg: err.message,
            correlationId,
            method: req.method,
            route: req.url,
            durationMs: Date.now() - started,
          }));
        },
      }),
    );
  }
}
```

#### Correlation ID — Track request across services

```typescript
// From Nest request → downstream HTTP / SQS
const correlationId = req.correlationId;

// Pass it downstream (SQS message, EventBridge event, HTTP call)
const message = {
  data: orderData,
  _metadata: { correlationId },          // ← always propagate
};
```

#### Enable in serverless.yml (Lambdalith)

```yaml
provider:
  tracing:
    lambda: true          # X-Ray on the Nest Lambda (no API Gateway traces)
  environment:
    LOG_LEVEL: INFO
    SERVICE_NAME: ${self:service}
# No Powertools layer required for the monolith path
```

#### CloudWatch Insights Queries (save these)

```sql
-- Find all errors for a correlation ID
fields @timestamp, level, message, correlationId, error
| filter correlationId = "req-456"
| sort @timestamp asc

-- P99 duration by function
stats pct(@duration, 99) as p99, count() as requests by functionName
| sort p99 desc

-- Cold start rate
stats sum(cold_start) as coldStarts, count() as invocations
| eval coldStartRate = coldStarts/invocations * 100
```

---

## 5. CI/CD Pipeline

> **Question:** Design before writing any code. What does the pipeline look like?

### ✅ Non-Negotiable Pipeline Rules

```
1. No secrets in code or GitHub Actions variables (use OIDC)
2. Every PR runs tests + lint + security scan
3. Dev deploys automatically on merge to develop/main
4. Prod requires manual approval
5. Every deploy has a smoke test
6. Every deploy can be rolled back in < 5 minutes
```

### Branch Strategy

```
feature/xyz ──► develop ──► staging ──► main (prod)
                   │              │          │
                auto-deploy   auto-deploy  manual
                to dev        to staging   to prod
```

### Full Pipeline Definition

```yaml
# .github/workflows/lambda-deploy.yml
name: Lambda CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  AWS_REGION: us-east-1
  NODE_VERSION: '20'

jobs:
  # ── Stage 1: Quality Gate (runs on every PR + push) ────────
  quality:
    name: Lint · Test · Security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'npm' }
      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Unit tests + coverage
        run: npm test -- --coverage --ci
        env:
          CI: true

      - name: Security audit
        run: npm audit --audit-level=high

      - name: SAST scan (Snyk)
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4

  # ── Stage 2: Build & Validate (on push to branches) ────────
  build:
    name: Build · Validate
    needs: quality
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'npm' }
      - run: npm ci

      - name: Build (esbuild)
        run: npm run build

      - name: Validate Serverless config
        run: npx serverless print --stage dev

      - name: Check bundle size
        run: |
          SIZE=$(du -sh dist/ | cut -f1)
          echo "Bundle size: $SIZE"
          # Fail if bundle > 50MB
          [ $(du -sm dist/ | cut -f1) -lt 50 ] || (echo "Bundle too large!" && exit 1)

      - uses: actions/upload-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist/
          retention-days: 7

  # ── Stage 3: Deploy Dev ─────────────────────────────────────
  deploy-dev:
    name: Deploy → Dev
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    environment: development
    concurrency: deploy-dev    # prevent parallel deploys

    permissions:
      id-token: write          # OIDC — no AWS keys stored in GitHub!
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'npm' }

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_DEV }}:role/github-deploy-dev
          aws-region: ${{ env.AWS_REGION }}

      - run: npm ci
      - name: Deploy to dev
        run: npx serverless deploy --stage dev --verbose
        id: deploy

      - name: Smoke test
        run: |
          BASE_URL=$(npx serverless info --stage dev --verbose | grep 'endpoint:' | head -1 | awk '{print $NF}')
          echo "Testing: $BASE_URL"
          curl --fail --max-time 10 "$BASE_URL/health"
          curl --fail --max-time 10 "$BASE_URL/api/version"

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"❌ Dev deploy failed: ${{ github.repository }}@${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

  # ── Stage 4: Deploy Staging (auto on main) ─────────────────
  deploy-staging:
    name: Deploy → Staging
    needs: deploy-dev
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging
    concurrency: deploy-staging

    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'npm' }
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_STAGING }}:role/github-deploy-staging
          aws-region: ${{ env.AWS_REGION }}
      - run: npm ci
      - run: npx serverless deploy --stage staging --verbose
      - name: Integration tests
        run: npm run test:integration -- --env staging

  # ── Stage 5: Deploy Prod (manual approval required) ─────────
  deploy-prod:
    name: Deploy → Prod
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production    # ← GitHub environment with required reviewers
    concurrency: deploy-prod

    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'npm' }
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_PROD }}:role/github-deploy-prod
          aws-region: ${{ env.AWS_REGION }}
      - run: npm ci
      - name: Deploy to prod (canary)
        run: npx serverless deploy --stage prod --verbose

      - name: Post-deploy health check
        run: |
          BASE_URL=$(npx serverless info --stage prod --verbose | grep 'endpoint:' | head -1 | awk '{print $NF}')
          for i in 1 2 3; do
            curl --fail --max-time 10 "$BASE_URL/health" && break || sleep 10
          done

      - name: Notify success
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"✅ Prod deployed: ${{ github.repository }}@${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### OIDC Trust Policy (Set Up Once per Account)

```bash
# Run once per AWS account (dev, staging, prod)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create per-environment deploy role
aws iam create-role \
  --role-name github-deploy-dev \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"},
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
        "StringLike": {"token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:*"}
      }
    }]
  }'
```

### Rollback Runbook

```bash
# Option 1 — Serverless rollback (last deploy)
npx serverless rollback --stage prod

# Option 2 — Lambda alias rollback (immediate, < 30 seconds)
aws lambda update-alias \
  --function-name my-app-prod-api \
  --name live \
  --function-version 42    # last known good version

# Option 3 — Traffic shifting (gradual rollback)
aws lambda update-alias \
  --function-name my-app-prod-api \
  --name live \
  --function-version 42 \
  --routing-config AdditionalVersionWeights={"41"=0.1}  # 10% to old
```

### Pipeline Checklist Before First Commit

```
✅ GitHub environments created: development, staging, production
✅ Production environment: required reviewers added (2 minimum)
✅ OIDC providers created in each AWS account
✅ Deploy roles created with least-privilege policies
✅ Slack/Teams webhook secret added to GitHub
✅ Snyk token added to GitHub secrets
✅ Branch protection rules: require PR + passing CI before merge
✅ Codecov / SonarCloud connected to repo
✅ Serverless Framework config validated (`serverless print`)
```

---

## 6. Local Development

> **Question:** Serverless Offline or Floci — or both?

### Answer: Both — for different purposes

```
┌─────────────────────────────────────────────────────────────────┐
│  Use Serverless Offline for...  │  Use Floci for...             │
│                                 │                               │
│  • Day-to-day HTTP development  │  • Integration tests          │
│  • Hot reload while coding      │  • Testing SQS/SNS/S3 flows  │
│  • Quick iteration on routes    │  • Reproducing prod issues    │
│  • NestJS/Express development   │  • CI pipeline local tests    │
│                                 │  • Testing IAM + full infra   │
└─────────────────────────────────────────────────────────────────┘
```

### Setup: Serverless Offline (Daily Driver)

```bash
npm install --save-dev serverless-offline serverless-plugin-typescript
```

```yaml
# serverless.yml
plugins:
  - serverless-plugin-typescript
  - serverless-offline

custom:
  serverless-offline:
    httpPort: 3000
    lambdaPort: 3002
    noPrependStageInUrl: true
    reloadHandler: true          # hot reload on file change
```

```bash
# Start dev server (hot reload)
npx serverless offline --stage dev

# Test it
curl http://localhost:3000/api/users
```

### Setup: Floci (Integration Testing)

```yaml
# docker-compose.yml
services:
  floci:
    image: floci/floci:latest
    ports:
      - "4566:4566"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
    environment:
      FLOCI_STORAGE_MODE: hybrid
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_floci/health"]
      interval: 5s
      retries: 5
```

```bash
# Start Floci
docker compose up -d floci

# Export env vars — all AWS SDK calls go to Floci automatically
eval $(floci env)

# Create local resources (run once, or use floci snapshot restore)
npm run seed:local
```

```typescript
// npm run seed:local → scripts/seed-local.ts
import { DynamoDB, SQS, S3 } from 'aws-sdk';

const dynamo = new DynamoDB({ endpoint: 'http://localhost:4566' });
const sqs    = new SQS({ endpoint: 'http://localhost:4566' });
const s3     = new S3({ endpoint: 'http://localhost:4566' });

await dynamo.createTable({ TableName: 'users-dev', ... }).promise();
await sqs.createQueue({ QueueName: 'orders-dev' }).promise();
await s3.createBucket({ Bucket: 'assets-dev' }).promise();

// Save snapshot for instant restore
// floci snapshot save dev-seed
```

### Recommended `.env.local`

```bash
# .env.local — loaded by dotenv in local dev, NEVER committed
NODE_ENV=development
AWS_ENDPOINT_URL=http://localhost:4566    # Floci
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1

# Local service config
USERS_TABLE=users-dev
ORDERS_TABLE=orders-dev
ORDERS_QUEUE_URL=http://localhost:4566/000000000000/orders-dev
ASSETS_BUCKET=assets-dev

# Auth (mock locally)
JWT_SECRET=local-dev-only-secret
COGNITO_ENDPOINT=http://localhost:4566   # Floci supports Cognito
```

### Zero-Config AWS Client (works locally + deployed)

```typescript
// src/config/aws-clients.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';

// AWS_ENDPOINT_URL is set in .env.local → Floci
// In Lambda on AWS → not set → uses real AWS
const clientConfig = {
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
};

export const dynamoClient = new DynamoDBClient(clientConfig);
export const sqsClient    = new SQSClient(clientConfig);
```

### npm Scripts

```json
{
  "scripts": {
    "dev":             "serverless offline --stage dev",
    "dev:debug":       "serverless offline --stage dev --inspect",
    "infra:start":     "docker compose up -d floci",
    "infra:stop":      "docker compose down",
    "infra:seed":      "ts-node scripts/seed-local.ts",
    "infra:snapshot":  "floci snapshot save dev-seed",
    "infra:restore":   "floci snapshot restore dev-seed",
    "test":            "jest",
    "test:int":        "jest --testPathPattern=integration",
    "test:int:local":  "eval $(floci env) && jest --testPathPattern=integration"
  }
}
```

### Makefile (Convenience Wrapper)

```makefile
.PHONY: dev infra test

dev: infra
	npx serverless offline --stage dev

infra:
	docker compose up -d floci
	eval $$(floci env) && npm run infra:seed

test:
	npm test

test-integration:
	eval $$(floci env) && npm run test:int

seed:
	eval $$(floci env) && npm run infra:seed

snapshot:
	floci snapshot save dev-seed-$(shell date +%Y%m%d)
```

---

## 7. Common Layer vs Modules

> **Question:** What goes into a common Lambda layer? What should stay in application modules?

### Mental model (Nest Lambdalith)

One deployable Lambda; **Nest modules** are the domain boundaries. Shared code is normal TS libs bundled with esbuild — a Lambda Layer is optional, not the default.

```
src/
├── lambda.ts                 ← single Lambda entry
├── app.module.ts
├── common/                   ← shared Nest module (filters, interceptors, auth guard)
├── users/                    ← UsersModule (controller, service, zod schemas)
├── orders/                   ← OrdersModule
├── products/                 ← ProductsModule
└── workers/                  ← optional thin SQS handlers (separate functions)

# Optional packages/ if monorepo grows:
packages/common, packages/db
```

### ✅ Put in `src/common` (or `packages/common`)

| Category | Examples |
|----------|----------|
| **Observability** | `ObservabilityInterceptor`, correlation ID middleware |
| **Auth** | `CognitoAuthGuard`, current-user decorator |
| **Stable helpers** | error filter, response shapes, Zod pipe wrapper |
| **Data access primitives** | DynamoDB client factory, base repository |

**Lambda Layer:** usually **skip** for the monolith (esbuild bundles deps). Add a layer only if bundle size / cold start forces sharing heavy native deps — not for Nest domain code.

### ✅ Keep in domain Nest modules (`src/<domain>`)

| Category | Examples |
|----------|----------|
| Controllers / services | `OrdersController`, `OrdersService` |
| Domain Zod schemas | `CreateOrderSchema` |
| Domain providers | payment client wrappers used only by orders |

### Rules of thumb

1. **Domain logic → Nest module**, not a Lambda Layer.  
2. **Secrets never in layers or code** — SSM / Secrets Manager.  
3. Design modules so a future per-resource split is packaging, not a rewrite.  
4. Optional **worker Lambdas** under `src/workers` stay thin; they can share `src/common` via bundle.

### ✅ Final decision

| Shared | Domain |
|--------|--------|
| `src/common` (+ optional `packages/db`) | `src/users`, `src/orders`, `src/products`, … as Nest modules |

---

## 8. Validation — Zod, Powertools Parser, or Middy

> **Question:** Zod schemas via Powertools Parser, or a Middy validator?

### ✅ Final decision (Lambdalith): Zod + Nest pipe only

```
Schema language:  Zod
HTTP (Nest):      ZodValidationPipe / DTO schemas on controllers
SQS workers:      Zod.safeParse in the thin worker (or Powertools Parser if you prefer)
Middy validator:  No
Powertools Parser on Nest HTTP:  No
```

```typescript
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
});

// Nest controller — pipe validates body against Zod
@Post()
create(@Body(new ZodValidationPipe(CreateOrderSchema)) body: z.infer<typeof CreateOrderSchema>) {
  return this.orders.create(body);
}
```

| Rule | Choice |
|------|--------|
| Schema library | **Zod** |
| Nest HTTP | **Zod pipe** |
| Optional SQS workers | Zod in worker (Parser optional) |
| Middy validator | **No** |

---

## 9. Skills.md — Cursor Agent Skills for This Platform

> **Question:** What are my `SKILL.md` / skills files?

### What they are

A **Cursor Agent Skill** is a folder with a `SKILL.md` that teaches the AI a repeatable workflow. Not Lambda runtime — team/AI process docs.

| Kind | Location | Scope |
|------|----------|--------|
| **Personal / built-in** | `~/.cursor/skills-cursor/` | All projects |
| **Project** | `<repo>/.cursor/skills/<name>/SKILL.md` | Shared via git |

### ✅ Final decision: project skills aligned to Nest Lambdalith

| Skill | Teaches |
|-------|---------|
| `lambda-adr` | This ADR (Lambdalith + Function URL + Nest observability) |
| `lambda-local-floci` | Floci + Nest local / Serverless Offline |
| `lambda-deploy-cicd` | OIDC deploy, smoke against Function URL, rollback |
| `lambda-observability` | Nest interceptor logs + X-Ray (not Powertools-primary) |
| `lambda-security` | Cognito Nest guard, Zod pipes, SSM secrets |

---

## 10. Downstream Protection — Reserved Concurrency

> **Question:** As we consume downstream APIs (external **or** same-app / internal), how do we protect them with reserved concurrency limits?

### What it means on a Nest Lambdalith

Reserved concurrency is **per Lambda function**. We have **one** HTTP Lambda → one cap for every Nest route. That cannot protect payment without also throttling product browse.

```
❌ Wrong expectation
   reservedConcurrency: 20 on api  → “only checkout is limited”
   Reality: entire Nest app limited to 20 concurrent invokes

✅ Monolith pattern
   api (Nest) → enqueue fragile work to SQS
   partnerNotifyWorker reservedConcurrency: 5  → protects partner
   + in-process circuit breaker / semaphore on sync HTTP calls from Nest
```

### ✅ Final decision (Lambdalith-compatible)

1. **Do not** use `reservedConcurrency` on the Nest `api` function as a per-route downstream shield. Optional high soft cap only as an account runaway brake.  
2. **Async fragile calls** → Nest publishes to **SQS**; **worker Lambda** with low `reservedConcurrency`.  
3. **Sync fragile calls** (must stay in request) → in-process **semaphore / circuit breaker**, short timeouts, retries with jitter.  
4. Alarm on worker **Throttles**, Nest **5xx**, downstream latency.  
5. Keep unreserved account concurrency headroom for workers + `api`.

```yaml
functions:
  api:
    handler: src/lambda.handler
    url: true
    # reservedConcurrency: 100   # optional account brake only

  partnerNotifyWorker:
    handler: src/workers/partner-notify.handler
    reservedConcurrency: 5       # THIS protects the partner API
    events:
      - sqs:
          arn: !GetAtt PartnerNotifyQueue.Arn
          batchSize: 1
```

```typescript
// Sync path inside Nest — limit parallel outbound calls (example sketch)
const inventoryGate = new Semaphore(10); // max 10 in-flight inventory calls per instance

async function callInventory(payload: unknown) {
  await inventoryGate.acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(process.env.INVENTORY_URL!, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`inventory ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
    inventoryGate.release();
  }
}
```

### Reserved vs provisioned

| Setting | On Nest Lambdalith |
|---------|-------------------|
| **Reserved concurrency** | Useful on **workers**; blunt on `api` |
| **Provisioned concurrency** | Optional on `api` if cold start SLA hurts (costs $) |

---

## 11. Decision Summary — NestJS Lambdalith platform

| # | Question | Final decision | Rationale |
|---|----------|----------------|-----------|
| 1 | **Function granularity** | **NestJS Lambdalith** (one Lambda + Nest modules) | Velocity, Nest DI/guards, single deploy |
| 2 | **API exposure** | **Lambda Function URL** (no API Gateway by default) | Nest owns routing; Gateway adds little value |
| 3 | **Auth / SSO** | **Cognito User Pools + Nest JWT AuthGuard** | No Gateway authorizer; verify JWKS in Nest |
| 4 | **Traceability** | **Nest interceptors + structured JSON + X-Ray** | Powertools-primary is a bad fit on a monolith |
| 5 | **CI/CD** | **GitHub Actions + OIDC** | One artifact → Function URL smoke → staged promote |
| 6 | **Local dev** | **Nest `start:dev` + Floci** (Offline optional) | Normal Nest DX; Floci for AWS deps |
| 7 | **Layer vs modules** | **`src/common` + Nest domain modules**; Layer optional | One bundle; modules = domains |
| 8 | **Validation** | **Zod + Nest Zod pipe** | One schema language at HTTP boundary |
| 9 | **Skills.md** | **Project Cursor skills** matching this Lambdalith ADR | Agents follow Nest-monolith conventions |
| 10 | **Downstream protection** | **SQS workers + reservedConcurrency on workers**; in-process limits for sync | Cap is per function — can’t per-route cap the monolith |

---

## Before Any Development Starts — Checklist

```
Infrastructure
  ✅ AWS accounts created: dev / staging / prod (separate accounts)
  ✅ Cognito User Pool + app client provisioned in dev
  ✅ DynamoDB tables defined in IaC
  ✅ Nest Lambdalith function + Function URL
  ✅ SQS + worker Lambdas (with reservedConcurrency) for fragile downstreams
  ✅ Unreserved account concurrency headroom left

CI/CD
  ✅ GitHub repo + branch protection on main + develop
  ✅ GitHub environments: development, staging, production (required reviewers)
  ✅ OIDC providers + deploy roles in all 3 accounts
  ✅ Secrets: SNYK_TOKEN, SLACK_WEBHOOK, AWS account IDs

Observability
  ✅ Nest ObservabilityInterceptor (structured JSON + correlation ID)
  ✅ X-Ray enabled on the api Lambda (and workers)
  ✅ CloudWatch alarms: errors, duration, worker throttles
  ✅ Log retention (14 days dev, 90 days prod)

Local Dev
  ✅ Floci / docker-compose for local AWS deps
  ✅ npm run start:dev for Nest
  ✅ .env.local documented (not committed)

Code Standards
  ✅ ESLint + Prettier + tsconfig strict
  ✅ Jest coverage threshold (80%+)
  ✅ Zod schemas + Nest Zod pipe on all HTTP inputs
  ✅ Cognito AuthGuard on protected routes
  ✅ Domain Nest modules under src/<domain>; shared under src/common

Cursor / Team process
  ✅ Project SKILL.md files under .cursor/skills/ (adr, floci, cicd, observability, security)
```

---

*Architecture Decision Record — NestJS Lambdalith platform. Resolve checklist before sprint 1.*
