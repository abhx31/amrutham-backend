# Amrutam Threat Model and Security Checklist

This threat model covers the Express API, BullMQ worker, PostgreSQL, Redis, notification and payment integrations, observability stack, CI pipeline and AWS deployment defined in this repository. It records the current state as of October 2026. Reassess it whenever a new endpoint, external provider, data category or deployment boundary is introduced.

Status meanings used below:

- **Implemented** — enforced by code or infrastructure in this repository.
- **Partial** — some controls exist, but an important layer or operational procedure is missing.
- **Required** — not implemented and required before production use.
- **Operational** — depends on an owner performing and evidencing the procedure.

## Attack surface inventory

| Surface | Exposure and entry points | Sensitive operations | Principal threats | Current controls | Status |
|---|---|---|---|---|---|
| Public REST API | ALB to `/api/v1/*` | Identity, profiles, booking, prescriptions, payments and administration | Broken authorization, injection, abuse, credential attacks | Zod validation, JWT verification, RBAC, ownership checks, Helmet, body limits | Partial |
| Authentication API | Register, login, refresh, logout, reset, verification and MFA routes | Token issuance and account recovery | Credential stuffing, enumeration, token replay, MFA bypass | Argon2id, rate limits, generic recovery responses, token hashing, refresh rotation, mandatory MFA for privileged roles | Partial |
| Administrator bootstrap CLI | Access-controlled one-off process with environment input | Creation of the first administrator | Credential exposure, accidental promotion and unauthorized rerun | No HTTP route, strict password/schema validation, idempotency, refusal to promote an existing non-admin, audit record and mandatory first-login MFA | Implemented |
| Payment webhook | `POST /api/v1/payments/webhooks/provider` | Payment-state changes | Forgery, replay and invalid state transitions | Raw-body HMAC, timing-safe comparison, provider-event ID and payload-hash deduplication | Implemented for the fake contract |
| Developer payment route | `/api/v1/dev/payments/:paymentId` | Fake payment-state mutation | Accidental production exposure | Admin RBAC and hard-disabled behavior in production | Implemented |
| Metrics endpoint | `/metrics` | Operational metadata | Unauthorized reconnaissance and metric-cardinality abuse | Separate bearer token | Partial |
| OpenAPI and docs | `/api/openapi.json` and `/api/docs` | Endpoint inventory | Reconnaissance and CDN dependency compromise | No secrets in schema; CSP limited to the configured Swagger CDN | Partial |
| PostgreSQL | Private port 5432 from ECS | All authoritative data | Credential theft, excessive privilege, data alteration and exfiltration | Private security group, encryption at rest, ORM parameterization, backups | Partial |
| Redis and BullMQ | Private port 6379 from ECS | Queue jobs and retry state | Job injection, deletion, replay and denial of service | Private security group, TLS, outbox source of truth | Partial |
| Background worker | BullMQ jobs and database outbox rows | Token decryption, email creation and event completion | Poison messages, repeated side effects and secret leakage | Event schema validation, retries, sanitized logs and explicit trace attributes | Partial |
| SMTP provider | Outbound TLS connection | Account and lifecycle-notification delivery | Credential theft, message interception and provider compromise | Nodemailer transport boundary and encrypted connection configuration | Required for production configuration |
| Container image and ECR | CI-built image and ECR pulls | Production executable | Dependency compromise, malicious image and mutable deployment | Lockfile, immutable ECR tags, scan on push, non-root runtime | Partial |
| GitHub Actions | Pull requests and pushes | Tests and build artifacts | Workflow tampering and supply-chain compromise | Read-only default contents permission, locked npm install, validation jobs | Partial |
| AWS control plane | Terraform, IAM, ECS Exec and Secrets Manager | Infrastructure and secrets | Account takeover, privilege escalation and destructive changes | Separate task roles, scoped secret read, remote-state design, private workloads | Partial |
| Local observability | Grafana, Prometheus, Jaeger and OTLP ports | Logs, metrics, traces and identifiers | Default credentials and unintended network exposure | Docker profile and metrics bearer token | Development only |

## Data classification

| Classification | Examples | Storage and transmission requirements | Logging rule |
|---|---|---|---|
| Restricted authentication | Passwords, raw refresh tokens, reset tokens, MFA secrets, recovery codes, JWT signing secret, SMTP and database credentials | Never persist raw passwords or session/recovery tokens; encrypt required reversible secrets; TLS in transit; Secrets Manager for infrastructure values | Never log |
| Restricted clinical | Consultation reasons, prescriptions, medications and clinical notes | Private database, encryption at rest and in transit, least-privilege access, jurisdiction-approved retention and deletion | Do not include content in application logs, audit metadata or traces |
| Confidential personal | Names, email, phone, birth date, address, emergency contact and doctor licence data | Authorized role and ownership access; encrypted backups; controlled export and deletion | Log stable identifiers only when operationally necessary |
| Confidential financial | Payment amount, currency, status, provider reference and webhook event identifiers | Server-derived amount, signed provider messages and restricted participant access | May log identifiers and status; never log provider credentials or full payment instruments |
| Internal operational | Request IDs, aggregate IDs, metrics, traces, queue status and infrastructure endpoints | Authenticated operational access and bounded retention | Sanitize errors and restrict observability access |
| Public | Health status, public doctor listings, OpenAPI schema and published documentation | Integrity protection and controlled deployment | Normal access logging allowed |

No payment-card data should enter this service. A real gateway integration must use hosted checkout or provider tokenization so cardholder data remains outside the application boundary.

## STRIDE threat model

| Category | Threat scenario | Existing mitigation | Residual action |
|---|---|---|---|
| Spoofing | Attacker uses stolen password, JWT, refresh cookie or recovery link | Argon2id, short access-token lifetime, rotating hashed refresh tokens, MFA and expiring single-use recovery tokens | Add shared credential throttling, anomaly alerts, session/device visibility and signing-key rotation |
| Spoofing | Forged payment provider notification | HMAC over the raw body and timing-safe comparison | Define provider IP/rate controls and webhook-secret rotation with overlap |
| Tampering | Concurrent callers double-book a slot or overwrite consultation state | Conditional slot update, unique index, PostgreSQL transaction and optimistic version | Retain integration concurrency tests in required CI checks |
| Tampering | Queue job is duplicated, altered or removed | PostgreSQL outbox is authoritative; job ID equals event UUID; payload validated by account handler | Add Redis authentication, job quarantine and reconciliation for exhausted attempts |
| Tampering | Administrator or database operator changes audit history | No public audit mutation endpoint | Enforce append-only database permissions and export signed/WORM audit copies |
| Repudiation | User denies a privileged or financial action | Request IDs, actor IDs, action, entity, time and selected metadata are audited | Define audit completeness tests, clock policy, retention and privileged-access audit trail |
| Information disclosure | Sensitive payload appears in logs or traces | Generic client errors, notification/outbox sanitization, and tested redaction of authorization, cookie, API-key, and set-cookie headers | Extend redaction tests whenever new secret-bearing fields or third-party serializers are introduced |
| Information disclosure | Database snapshot, secret or Terraform state is exposed | RDS encryption, private networking, Secrets Manager references and encrypted S3 backend design | Enforce KMS policy, state-bucket access logging, backup access reviews and secret scanning |
| Denial of service | Authentication, analytics or expensive list endpoints are flooded | Authentication limiter, query limits, 1 MB body limit, bounded proxy trust and k6 acceptance scenarios | Add WAF, shared distributed limits, timeouts and database statement limits; execute load tests in staging |
| Denial of service | Poison outbox event consumes all retries | Bounded BullMQ and database attempts | Add dead-letter workflow, alerts and operator replay tooling |
| Elevation of privilege | Patient calls doctor/admin endpoint or accesses another user's object | Role middleware, ownership checks and actor-scoped queries | Build an executable endpoint-role-object authorization matrix |
| Elevation of privilege | Compromised ECS task accesses unnecessary AWS services | Separate execution/task roles and secret ARN scoping | Add IAM Access Analyzer review and narrower ECS Exec authorization |

## OWASP API Security Top 10 mapping

This mapping uses the OWASP API Security Top 10 2023 categories.

| OWASP category | Amrutam mitigation | Status and remaining work |
|---|---|---|
| API1 Broken Object Level Authorization | Participant-scoped consultation, payment and prescription access; doctor ownership derived from identity; admin-only user/profile lookup | Partial — add exhaustive object-authorization tests for every identifier route |
| API2 Broken Authentication | Argon2id, signed claims, issuer/audience validation, short access tokens, rotating refresh tokens, MFA and rate limits | Partial — distributed throttling, key rotation, breach-password checking and access-token revocation remain |
| API3 Broken Object Property Level Authorization | Strict Zod request schemas, server-derived roles, prices and ownership, no generic object persistence | Partial — add response DTO allowlists and automated sensitive-field tests |
| API4 Unrestricted Resource Consumption | Body limit, pagination bounds, analytics date limit, authentication throttling and worker concurrency | Partial — add WAF/rate limits for all costly routes, request timeouts and queue-depth protection |
| API5 Broken Function Level Authorization | Explicit `authorizeRoles` middleware plus service-level ownership and lifecycle checks | Partial — formalize and test the endpoint/role matrix |
| API6 Unrestricted Access to Sensitive Business Flows | Booking and payment idempotency, unique slot claim, server-owned pricing and fake-route production guard | Partial — add booking/payment abuse limits and real-provider fraud/reconciliation controls |
| API7 Server Side Request Forgery | No user-supplied outbound URL is currently fetched; Nodemailer disables file and URL access in message construction | Implemented for current features — re-review before adding avatars, webhooks, imports or URL previews |
| API8 Security Misconfiguration | Strict environment validation, Helmet, redacted logs, non-root image, private subnets, enforced TLS for active ECS API tasks and immutable ECR | Partial — replace demo defaults, add WAF and harden observability exposure |
| API9 Improper Inventory Management | Versioned `/api/v1`, generated OpenAPI schema and documented developer-only route | Partial — add endpoint inventory diffing, deprecation policy and external asset inventory |
| API10 Unsafe Consumption of APIs | Signed payment webhook, schema validation, SMTP abstraction, provider-event deduplication | Partial — add outbound timeouts, provider response validation, circuit breakers and reconciliation |

The OWASP API list is API-specific and does not replace broader checks for injection, vulnerable dependencies, cryptographic failures or secure design.

## Key and credential rotation procedures

Every rotation requires an owner, change record, validation evidence and rollback window. ECS receives secrets at task startup, so changing Secrets Manager does not update already running tasks; force a new deployment after changing a value.

### Database credential

1. Create a new least-privilege database credential while the existing credential remains valid.
2. Validate connectivity from a controlled migration or canary task.
3. Update `DATABASE_URL` in Secrets Manager.
4. Force new API and worker deployments and verify health, queries and jobs.
5. Revoke the previous credential after all old tasks have stopped.
6. Record rotation time, actors, affected secret version and validation results.

Prefer Secrets Manager managed or alternating-user rotation when the database-user model supports it. Do not use the RDS master credential as the application credential.

### JWT signing secret

The current service accepts one HS256 secret and has no key identifier. Routine zero-downtime rotation therefore requires a code change to verify both current and previous keys while signing only with the current key.

Until multi-key verification exists, an emergency rotation must:

1. Replace `JWT_ACCESS_SECRET` in Secrets Manager with at least 32 cryptographically random bytes.
2. Redeploy all API tasks together.
3. Accept that all access and MFA challenge tokens issued with the previous key become invalid.
4. Revoke refresh-token families if compromise is suspected, forcing complete reauthentication.
5. Search audit and authentication logs for suspected misuse without copying tokens into the incident record.

### MFA encryption key

The current ciphertext does not carry a key version and the service accepts one AES-256-GCM key. Do not rotate this key by simply replacing the secret: existing MFA secrets and encrypted pending account tokens would become unreadable.

Implement versioned ciphertext and a re-encryption migration first. During rotation, deploy code that decrypts with old and new keys, encrypt new values with the new key, re-encrypt existing MFA credentials, verify counts, then remove the old key. If the key is compromised before this exists, disable affected MFA credentials, expire pending account tokens and require re-enrollment.

### Payment webhook secret

The current verifier accepts one secret. Coordinate a maintenance rotation with the provider or add temporary dual-secret verification. Configure the new provider secret, update Secrets Manager, redeploy API tasks, send a signed test event, then remove the old secret. Preserve provider event IDs to prevent replay during the change.

### SMTP, metrics and deployment credentials

- Rotate SMTP credentials at the provider, update `SMTP_URL`, redeploy the worker and revoke the old credential after a test message succeeds.
- Rotate `METRICS_BEARER_TOKEN`, update the Prometheus scrape credential and API secret in one change window, then redeploy the API.
- Use GitHub OIDC for AWS deployment. Do not create long-lived AWS access keys for CI.
- Prefer short-lived human AWS sessions with MFA and separate production roles.

## Secrets management checklist

- [x] `.env` files, Terraform variable files and state files are gitignored.
- [x] ECS task definitions reference Secrets Manager JSON keys rather than literal secret values.
- [x] Terraform creates the secret container without managing its value.
- [x] The ECS execution role is scoped to the application secret ARN.
- [x] Logs and traces intentionally exclude raw tokens and notification bodies.
- [ ] Enable automatic or runbook-driven rotation for every production secret.
- [ ] Use a customer-managed KMS key where policy or compliance requires it.
- [ ] Enable CloudTrail monitoring and alerts for secret reads, updates and deletion scheduling.
- [ ] Add pre-commit and CI secret scanning with verified blocking rules.
- [ ] Document emergency revocation owners and provider contacts.
- [x] Store the local Prometheus credential outside committed configuration; local Compose mounts it from the ignored environment as a service-scoped secret.

## Dependency and supply-chain scanning

Required pipeline controls are:

1. `npm ci` must remain lockfile-enforced.
2. `npm audit --omit=dev --audit-level=high` blocks known high or critical runtime vulnerabilities.
3. GitHub dependency review blocks pull requests that introduce high or critical vulnerable dependencies.
4. Dependabot opens scheduled npm, GitHub Actions and Docker updates.
5. ECR scan-on-push evaluates the built container image.
6. Production deployment must use an immutable image digest or immutable commit-derived tag.

Moderate findings still require triage and a recorded decision; the threshold is not an assertion that moderate vulnerabilities are safe. Action references should ultimately be pinned to reviewed commit SHAs for stronger workflow supply-chain protection.

## Audit-log retention and protection

Application audit records include actor, action, entity, request ID, timestamp and limited metadata. They intentionally exclude clinical and profile values. There are no public mutation routes, but database administrators and the application database owner can still alter rows.

Before production:

- Select a retention period with legal, privacy and clinical-governance owners; do not assume one jurisdiction's period applies globally.
- Grant the application database role `INSERT` and required `SELECT` permissions without `UPDATE` or `DELETE` on audit rows.
- Export audit events to a separate account or immutable S3 storage with Object Lock when required.
- Encrypt exports, restrict readers, log access and test retrieval.
- Define legal-hold behavior that supersedes normal deletion.
- Purge expired audit data through a reviewed administrative process, never a public API.
- Monitor event-volume discontinuities, timestamp gaps and privileged database changes.
- Keep CloudWatch application logs separate from the authoritative audit trail; the default Terraform log retention is 30 days.

## Incident response notes

### Severity guide

| Severity | Examples | Initial response target |
|---|---|---|
| Critical | Active clinical-data exfiltration, production AWS takeover, signing/MFA key compromise or widespread unauthorized prescriptions/payments | Immediate page and containment |
| High | Confirmed account takeover, exploitable authorization bypass, database credential exposure or sustained service outage | Page security and service owners |
| Medium | Contained dependency vulnerability, isolated abuse, suspicious webhook or repeated job failure without data loss | Same-business-day triage |
| Low | Failed probes, policy deviation or low-impact misconfiguration | Normal security queue |

Targets are internal starting points and need named on-call ownership before production.

### Response sequence

1. **Detect and record:** create an incident ID, preserve timestamps, request IDs, image digests, task revisions and relevant audit identifiers.
2. **Contain:** block abusive sources at WAF/ALB controls, scale down a compromised worker, disable affected accounts, revoke refresh sessions and restrict IAM roles as appropriate.
3. **Preserve evidence:** snapshot relevant logs and database state to access-controlled storage; never paste secrets or raw patient content into tickets or chat.
4. **Eradicate:** patch the vulnerability, rotate affected credentials using the procedures above, rebuild from the lockfile and deploy an immutable image.
5. **Recover:** run migrations if required, restore or reconcile data, validate health and authorization, resume workers carefully and monitor retries.
6. **Notify:** involve legal, privacy, clinical and communications owners according to applicable breach-notification rules.
7. **Review:** document root cause, control failures, detection delay, affected records, timeline and assigned corrective actions.

### Scenario notes

- **JWT secret compromise:** rotate immediately, redeploy API tasks, revoke refresh sessions, investigate token use and prioritize multi-key support.
- **MFA key compromise:** preserve the old key as restricted incident evidence, invalidate pending account tokens, require MFA re-enrollment and implement versioned re-encryption.
- **Database credential compromise:** create a new credential, update tasks, terminate old sessions, revoke the credential and review query/audit activity.
- **Redis compromise:** isolate the security group, replace the cluster if integrity is uncertain, reconstruct pending work from PostgreSQL outbox rows and reconcile external side effects.
- **Malicious image or dependency:** stop rollout, identify the last trusted digest, rebuild from reviewed sources, rotate any exposed runtime secrets and preserve ECR/CI evidence.
- **Audit-log tampering:** restrict database access, preserve snapshots and CloudTrail/RDS evidence, compare exported immutable copies and treat missing records as a security event.

## Production security gate

- [ ] Threat model reviewed by engineering, security, operations and privacy owners.
- [ ] Endpoint-role-object authorization matrix has complete automated coverage.
- [ ] HTTPS, WAF, distributed rate limits and trusted-proxy configuration enabled.
- [ ] Secrets populated, rotated in staging and protected by monitored IAM/KMS policies.
- [ ] Least-privilege application database role and append-only audit permissions deployed.
- [ ] High/critical dependency and image findings block deployment.
- [ ] Real payment and SMTP providers tested with timeout, retry and reconciliation behavior.
- [ ] Backup restore, rollback, key rotation and Redis/outbox recovery exercises passed.
- [ ] Alerts route to named responders and incident contacts are current.
- [ ] Retention, deletion, consent, residency and breach-notification requirements approved.
- [ ] Independent penetration test findings resolved or explicitly accepted.

