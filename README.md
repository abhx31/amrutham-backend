# Amrutam Telemedicine Backend

Production-oriented backend implemented with Express, TypeScript, PostgreSQL, and Drizzle ORM.

## Current status

The implementation covers the assignment's core API workflows, strict validation, explicit dependency wiring, PostgreSQL transactions and migrations, Redis caching, BullMQ/outbox jobs, email notifications, OpenAPI, observability, security documentation, tests, containerization, AWS Terraform, and a gated deployment workflow. Payment checkout intentionally uses the documented fake gateway; swapping in a real provider remains an external integration rather than an unfinished API.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis with `docker compose up -d postgres redis`.
3. Install dependencies with `npm install`.
4. Apply the committed migrations with `npm run db:migrate`.
5. Start the API with `npm run dev`.
6. Start the outbox worker in another terminal with `npm run worker:dev`.

Use `npm run db:generate` only after changing the Drizzle schema; review and commit the generated SQL rather than generating a new migration during routine setup.

The liveness endpoint is `GET /api/v1/health/live`.

### Bootstrap the first administrator

After migrations, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FIRST_NAME`, and `BOOTSTRAP_ADMIN_LAST_NAME` in the ignored local `.env`, then run:

```bash
npm run admin:bootstrap
```

The command is idempotent for an existing administrator and refuses to promote an existing non-admin account. It creates an active, email-verified administrator with an audit record; mandatory MFA enrollment is still required on first login. Remove the bootstrap values from `.env` after use. In production, run `node dist/src/bootstrap-admin.js` from the API task definition as an access-controlled one-off task with short-lived environment overrides, then delete those overrides. There is intentionally no public bootstrap endpoint.

## Container image and CI

Build the production image once and run either process from the same artifact:

```bash
docker build -t amrutam-backend .
docker run --env-file .env -p 3000:3000 amrutam-backend
docker run --env-file .env amrutam-backend node dist/src/bootstrap-worker.js
```

The final image runs as the non-root `node` user and contains production dependencies plus compiled application code. The GitHub Actions workflow in `.github/workflows/ci.yml` runs locked dependency installation, strict type checking, unit tests, real PostgreSQL concurrency tests, the production build, and a Docker image build on pushes to `main` and pull requests.

## AWS Terraform

`infra/aws` provisions a two-AZ VPC, public ALB, private ECS Fargate API and worker services, ECR, encrypted RDS PostgreSQL, encrypted ElastiCache Redis, Secrets Manager, CloudWatch logs, Container Insights, and API CPU autoscaling.

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan -out=deployment.tfplan
terraform apply deployment.tfplan
```

Create the S3 backend bucket separately with versioning enabled, copy `backend.hcl.example` to `backend.hcl`, and configure AWS credentials through the AWS CLI or workload identity. Desired task counts default to zero so the first apply can create ECR and the supporting infrastructure without trying to pull a nonexistent image. Push the application image to the `ecr_repository_url` output, populate the application secret, set its immutable tag in `container_image_tag`, then set the API and worker desired counts to at least one and apply again.

Terraform creates the Secrets Manager container but deliberately does not create a secret version, keeping values out of Terraform configuration and state. Before starting ECS services, populate `${project}-${environment}/application` with JSON keys for `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `JWT_ACCESS_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `MFA_ENCRYPTION_KEY`, and `METRICS_BEARER_TOKEN`. Add `SMTP_URL` when `email_transport = "smtp"`. `DATABASE_URL` should use a least-privilege runtime role; `MIGRATION_DATABASE_URL` should use a separately controlled schema-owner role available only to the one-off migration task.

Active API tasks require both `certificate_arn` and an HTTPS `app_public_url`; the HTTP listener is intentionally usable only while desired count is zero for infrastructure bootstrap. ECS configures exactly one trusted proxy hop for the ALB. SMTP and tracing can be enabled with `email_transport`, `email_from`, `otel_enabled`, and `otel_traces_endpoint`; the default fake email transport and disabled tracing are low-cost demo defaults, not hardcoded runtime limitations.

The manual `.github/workflows/deploy.yml` workflow uses GitHub OIDC, builds and pushes an immutable commit-SHA image, verifies a one-off migration task, then deploys the API and worker. Configure its GitHub environment variables from Terraform outputs: `AWS_REGION`, `ECR_REPOSITORY` (`ecr_repository_name`), `ECS_CLUSTER` (`ecs_cluster_name`), `ECS_API_SERVICE` (`api_service_name`), `ECS_WORKER_SERVICE` (`worker_service_name`), the three task-family outputs, comma-separated `ECS_PRIVATE_SUBNETS` (`private_subnet_ids`), `ECS_SECURITY_GROUP` (`ecs_security_group_id`), and a separately provisioned `AWS_DEPLOY_ROLE_ARN`. Protect the production GitHub environment with required reviewers.

Development defaults minimize size but still incur AWS charges, notably the NAT gateway, ALB, RDS, ElastiCache, and Fargate. Production should enable deletion protection, Multi-AZ RDS, an ACM certificate, immutable image tags, and environment-specific AWS accounts.

## OpenTelemetry and dashboards

Set `OTEL_ENABLED=true` to enable automatic HTTP, Express, PostgreSQL, Redis, and supported Node.js instrumentation. API and worker traces are exported with OTLP/HTTP protobuf; BullMQ outbox processing also creates explicit spans containing safe event and aggregate identifiers.

Start the local observability stack with:

```bash
npm run observability:up
```

- Grafana: `http://localhost:3001` (`admin` / `admin` for local development)
- Prometheus: `http://localhost:9090`
- Jaeger traces: `http://localhost:16686`
- OTLP/HTTP receiver: `http://localhost:4318`

The provisioned Grafana dashboard shows request throughput, 5xx rate, average latency, uptime, and route/status traffic. Set `METRICS_BEARER_TOKEN` only in the ignored `.env`; Docker Compose materializes it as a secret available only to Prometheus at `/run/secrets/metrics_bearer_token`. The tracked Prometheus configuration reads that file and never contains the token. Rerun `npm run observability:up` after rotating it. For an application running inside Docker, use `http://otel-collector:4318/v1/traces`; from the host use `http://localhost:4318/v1/traces`.

## Redis, BullMQ, and the transactional outbox

PostgreSQL remains the source of truth: domain events are inserted into `outbox_events` in the same transaction as business changes. The worker polls pending rows, adds them to the `amrutam-domain-events` BullMQ queue, and uses the outbox UUID as the BullMQ job ID to deduplicate repeated polling. A row is marked processed only after its handler succeeds. Failed jobs use exponential backoff and increment the database attempt counter.

Password-reset, email-verification, consultation, payment-status, and finalized-prescription events are handled through Nodemailer. `EMAIL_TRANSPORT=fake` uses its JSON transport to construct messages without external delivery and logs only safe metadata. To deliver real mail, set `EMAIL_TRANSPORT=smtp`, configure an `smtp://` or `smtps://` connection in `SMTP_URL`, and use a sender accepted by the provider in `EMAIL_FROM`. Credentials containing reserved URL characters must be percent-encoded. `APP_PUBLIC_URL` controls the client links placed in emails.

The API also uses Redis as a fail-open cache-aside layer for public doctor searches, doctor details, and availability. Cache keys use hashed normalized inputs, short 10-30 second TTLs, and generation-based invalidation after doctor/slot mutations, bookings, and cancellations. PostgreSQL remains authoritative; cache failures fall back to database reads.

`docker compose up -d` now starts PostgreSQL and persistent Redis. Run the API and worker as separate processes with `npm run dev` and `npm run worker:dev`; production equivalents are `npm start` and `npm run worker:start` after building.

## PostgreSQL integration tests

The integration suite uses a separate `amrutam_test` PostgreSQL database on port 5433. It resets only databases whose names end in `_test`, applies every Drizzle SQL migration, and exercises real constraints and concurrent connections.

```bash
npm run test:integration:db
npm run test:integration
```

The suite verifies exclusive slot claiming, cancellation followed by safe rebooking, advisory-lock idempotency, atomic audit/outbox writes, optimistic consultation transitions, one active payment under concurrent initiation, and exactly-once webhook state transition behavior. Override the isolated connection with `TEST_DATABASE_URL` when needed.

## End-to-end application test

The E2E suite runs the real Express application, PostgreSQL migrations, Redis, BullMQ worker, and fake email/payment adapters through the complete user lifecycle. It covers administrator bootstrap and MFA, RBAC, doctor onboarding and approval, availability and booking idempotency, payments, consultation transitions, prescription visibility/finalization, cancellation, audit logs, analytics, health/metrics/OpenAPI, and durable outbox completion.

```bash
npm run test:e2e:services
npm run test:e2e
```

It uses only the guarded `amrutam_test` database and Redis database 15. The Redis test database is flushed before the run; development Redis data in the default database is not touched. Override the service URLs with `TEST_DATABASE_URL` and `TEST_REDIS_URL` when required.

## Performance acceptance tests

The `load-tests` directory contains k6 scenarios for cached public reads, login/refresh writes, and concurrent consultation booking. Their thresholds encode the assignment targets: p95 below 200 ms for reads, p95 below 500 ms for writes, and fewer than 1% unexpected HTTP failures. Follow `load-tests/README.md` to seed disposable data and run the scenarios; a threshold definition is not performance evidence until results are captured from the intended environment.

## OpenAPI documentation

- `GET /api/docs` — interactive Swagger UI documentation.
- `GET /api/openapi.json` — machine-readable OpenAPI 3.1 schema.

Run `npm run openapi:generate` to refresh the committed `docs/openapi.json` artifact after changing the schema. The interactive page loads Swagger UI assets from unpkg; the JSON schema remains available without those browser assets.

Operational endpoints:

- `GET /api/v1/health/live` — process liveness without dependency checks.
- `GET /api/v1/health/ready` — readiness including a PostgreSQL query.
- `GET /metrics` — Prometheus text metrics protected by `METRICS_BEARER_TOKEN`.

## Authentication endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`

Access tokens are returned in the JSON response and sent as `Authorization: Bearer <token>`. Refresh tokens are stored in an HTTP-only, same-site cookie and are rotated whenever refreshed.

### MFA endpoints

- `POST /api/v1/auth/mfa/setup` — create an encrypted TOTP enrollment secret.
- `POST /api/v1/auth/mfa/verify-setup` — activate MFA and return one-time recovery codes.
- `POST /api/v1/auth/mfa/verify-login` — complete a challenged login using TOTP or a recovery code.
- `DELETE /api/v1/auth/mfa` — disable optional patient MFA after password and TOTP verification.

MFA is mandatory for doctors and administrators. Their password login returns a five-minute setup or login challenge instead of access and refresh tokens. TOTP secrets are encrypted using AES-256-GCM, recovery codes are stored only as keyed hashes, and a TOTP time step cannot be reused.

### Account-management endpoints

- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/request-email-verification`
- `POST /api/v1/auth/verify-email`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:sessionId`

Recovery endpoints return the same response whether an email exists or not. Raw reset and verification tokens are stored only as hashes; encrypted delivery tokens are placed into the transactional outbox for the notification worker. Password changes and resets revoke all refresh-token sessions.

## User endpoints

- `GET /api/v1/users/me` — retrieve the authenticated user's account and profile.
- `PATCH /api/v1/users/me/profile` — update the authenticated user's name or phone.
- `GET /api/v1/users` — admin-only cursor-paginated user search and filtering.
- `GET /api/v1/users/:userId` — admin-only user lookup.
- `PATCH /api/v1/users/:userId/status` — admin-only activation or suspension.

Suspending an account revokes all of its refresh tokens. Profile and status changes generate audit records. Roles cannot be changed through these endpoints.

## Profile endpoints

- `GET /api/v1/profiles/me` — retrieve the authenticated user's personal profile.
- `PATCH /api/v1/profiles/me` — update personal profile details.
- `GET /api/v1/profiles/:userId` — admin-only profile lookup.

Profiles support names, phone, date of birth, gender, structured address, and emergency contact. Profiles are created during registration and therefore do not expose separate create or delete endpoints. Updates are audited without copying sensitive profile values into the audit record.

## Doctor endpoints

- `GET /api/v1/doctors` — public verified-doctor search.
- `GET /api/v1/doctors/:doctorId` — public verified-doctor profile.
- `GET /api/v1/doctors/:doctorId/availability` — public future availability.
- `GET /api/v1/doctors/me` — authenticated doctor's own profile.
- `PATCH /api/v1/doctors/me` — authenticated doctor's own professional details.
- `POST /api/v1/doctors/me/availability` — create an owned availability slot.
- `GET /api/v1/doctors/me/availability` — list the authenticated doctor's schedule with status filters.
- `PATCH /api/v1/doctors/me/availability/:slotId` — update an owned available slot.
- `DELETE /api/v1/doctors/me/availability/:slotId` — block an owned available slot.
- `POST /api/v1/doctors` — admin-only doctor onboarding.
- `PATCH /api/v1/doctors/:doctorId/verification` — admin-only verification control.

Role middleware provides coarse access control. Doctor ownership is derived from the authenticated user ID inside the service layer; callers never choose the doctor ID for self-service mutations.

## Consultation endpoints

- `POST /api/v1/consultations` — patient booking; requires `Idempotency-Key`.
- `GET /api/v1/consultations` — actor-scoped consultation list.
- `GET /api/v1/consultations/:consultationId` — participant or admin lookup.
- `PATCH /api/v1/consultations/:consultationId/status` — assigned doctor or admin lifecycle transition.
- `POST /api/v1/consultations/:consultationId/cancel` — owning patient cancellation.

Booking atomically claims an available future slot and creates the consultation, audit record, idempotency response, and outbox event. Status writes require the current version to prevent lost updates.

## Prescription endpoints

- `GET /api/v1/consultations/:consultationId/prescriptions` — participant or admin access.
- `GET /api/v1/prescriptions/:prescriptionId` — participant or admin prescription lookup.
- `POST /api/v1/consultations/:consultationId/prescriptions` — assigned doctor creates a draft.
- `PATCH /api/v1/prescriptions/:prescriptionId` — assigned doctor edits a draft.
- `POST /api/v1/prescriptions/:prescriptionId/finalize` — assigned doctor finalizes a draft.

Only active or completed consultations can receive prescriptions. Patients can see only finalized versions. Finalized prescriptions are immutable; subsequent changes create a new version.

## Payment endpoints

- `POST /api/v1/consultations/:consultationId/payments` — patient-only, idempotent payment initiation.
- `GET /api/v1/consultations/:consultationId/payments` — consultation participant or admin history.
- `GET /api/v1/payments/:paymentId` — participant or admin lookup.
- `POST /api/v1/payments/webhooks/provider` — HMAC-authenticated provider status webhook.
- `POST /api/v1/dev/payments/:paymentId` — admin-only fake-gateway status simulation outside production.

Amounts are derived from the doctor's server-side consultation fee and stored in minor currency units. Provider webhook events are idempotent and enforce `PENDING → SUCCEEDED|FAILED → REFUNDED` lifecycle rules.

`PAYMENT_GATEWAY_MODE=fake` returns test checkout instructions during payment initiation. Fake status simulation is unavailable when `NODE_ENV=production`.

## Additional admin endpoints

- `GET /api/v1/admin/doctors/pending` — unverified doctor onboarding queue.
- `POST /api/v1/admin/users` — create patient or administrator accounts.

Doctor accounts must use the dedicated doctor onboarding endpoint because licence and specialty information are required.

## Audit endpoints

- `GET /api/v1/audit-logs` — admin-only filtered audit history.
- `GET /api/v1/audit-logs/:auditLogId` — admin-only audit record lookup.

Audit logs can be filtered by actor, action, entity, and time range. There are deliberately no public mutation endpoints for audit records.

## Admin analytics endpoints

- `GET /api/v1/admin/analytics/overview` — user, consultation, and payment KPIs.
- `GET /api/v1/admin/analytics/consultations` — daily consultation trends.
- `GET /api/v1/admin/analytics/doctors` — doctor utilization rankings.
- `GET /api/v1/admin/analytics/payments` — daily payment and refund trends.

Analytics routes require the `ADMIN` role. They default to the previous 30 days, accept ISO-8601 `from` and `to` query parameters, and reject ranges over 366 days. Results contain aggregate operational data rather than patient-level clinical information.

The full implementation plan is available in `docs/amrutam-backend-plan.pdf`.

The concise 2-4 page architecture submission is `docs/architecture-overview.md`; `docs/architecture.md` is the extended engineering reference. Security details are in `docs/security.md` and `docs/threat-model.md`.
