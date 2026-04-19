# ClinicOps Reconciliation & Exam Package Platform — Delivery Acceptance & Architecture Audit



## 1. Verdict

**Overall conclusion: Partial Pass**

The delivery is a substantive, well-structured full-stack implementation that directly addresses the ClinicOps business domain. Core functional flows — package versioning, order lifecycle, billing computation, reconciliation ingest, audit logging, tenant isolation, and RBAC — are all present and implemented with professional depth. Test coverage is exceptional at ~99% line coverage for the backend.

However, three High-severity correctness defects and several Medium-severity gaps prevent a full Pass:

1. A duplicate route binding in `App.tsx` causes the billing route to render two competing pages simultaneously.
2. `markPaid()` allows a PENDING order (no invoice) to be marked PAID, creating orphaned payment records.
3. The reconciliation auto-match creates double case records for transactions that are both duplicate and auto-matchable.
4. `VARIANCE` case status (required by the Prompt) is absent from the reconciliation engine.
5. `SPLIT` and `MERGE` dispositions are accepted but have zero backend logic.

None of these are architectural failures; all are fixable with targeted changes. The security posture, test infrastructure, and overall engineering quality are strong.

---

## 2. Scope and Static Verification Boundary

### Reviewed
- `README.md`, `.env.example`, `docker-compose.yml`, `Dockerfile`, `start.sh`, `run_tests.sh`
- `backend/src/index.js`, `app.js`, `config/index.js`
- All route files: `auth.js`, `users.js`, `packages.js`, `orders.js`, `reconciliation.js`, `examItems.js`, `tenants.js`, `reports.js`
- All middleware: `auth.js`, `error.js`, `rateLimit.js`, `asyncHandler.js`
- All services: `users.js`, `tokens.js`, `roles.js`, `password.js`, `orders.js`, `billing.js`, `packages.js`, `search.js`, `recommendations.js`, `reconciliation.js`, `audit.js`, `kpi.js`, `wechatAdapter.js`, `exports.js`, `identity.js`, `pricing.js` (via caller references)
- `repositories/index.js`
- `utils/encryption.js`, `logger.js`, `money.js`, `errors.js`, `geo.js`, `similarity.js`
- All 13 backend test files
- `frontend/src/App.tsx`, `hooks/useAuth.tsx`, `store/auth.ts`, `api/client.ts`, `api/endpoints.ts`, `components/Layout.tsx`, `pages/Reconciliation.tsx`, `pages/Billing.tsx`
- `frontend/package.json`, `backend/package.json`
- `backend/coverage/` (report claims, not re-verified)

### Not reviewed in detail
- `repositories/db.js` (in-memory implementation internals)
- `repositories/mongoAdapter.js`
- `backend/src/utils/csv.js`, `geo.js`, `similarity.js`, `timezone.js` (referenced; logic confirmed via tests)
- `backend/src/data/zipCentroids.js` (static lookup table)
- `frontend/src/pages/` beyond Reconciliation, Billing, App.tsx
- Frontend test files (`frontend/tests/`)

### Intentionally not executed
- Project startup, Docker, test suites, browser rendering

### Claims requiring manual verification
- Runtime rendering of the billing route duplication bug
- Actual MongoDB adapter behavior under production load
- Actual JWT timing leakage between unknown-username and wrong-password paths
- In-memory audit chain race condition under real concurrent request load
- Coverage numbers reported in `backend/coverage/` (not re-run)

---

## 3. Repository / Requirement Mapping Summary

### Prompt core goal
Multi-location preventive care clinic platform: sell configurable physical exam packages, bill accurately, reconcile payments against bank feeds, enforce strict tenant isolation, and provide performance reporting.

### Core flows extracted from Prompt
| Flow | Description |
|------|-------------|
| Exam item dictionary | Clinic Manager manages items with reference ranges, contraindications, applicability |
| Package versioning | Required/optional items, validity windows, immutable snapshot at time of sale |
| Package search | Keyword, category, price/deposit range, ZIP-distance (offline), favorites, history, recommendations |
| Order lifecycle | PENDING → CONFIRMED → PAID → FULFILLED with invoice at CONFIRMED step |
| Billing engine | Line items, bundles, membership/training/class/value-added, discount, tax (default 8.25%), receivable |
| Bulk ops | Mass status/tag/due-date with 10-min rollback, financial fields blocked |
| Reconciliation | CSV/XLSX ingest, SHA-256 fingerprint, auto-match (amount ±$0.01, ±3d, similarity), exceptions |
| Auth & users | bcrypt, 12-char policy, lockout, RBAC (5 roles), blacklist, deactivate, merge, identity |
| KPI / reporting | GMV, AOV, repeat purchase, fulfillment duration; CSV exports |
| Security | AES-256-GCM at rest, tamper-evident audit chain, tenant isolation |

### Implementation mapping
All 10 core flows have corresponding code. Partial gaps exist in: reconciliation (VARIANCE status, SPLIT/MERGE logic), frontend routing (billing duplication). WeChat adapter is documented as an intentional stub.

---

## 4. Section-by-Section Review

### Section 1: Hard Gates

#### 1.1 Documentation and Static Verifiability
**Conclusion: Pass**

`README.md` covers: Docker run (`./start.sh`), local Node run (`npm start`), test commands (`npm test`, `./run_tests.sh`), environment variable list with generation instructions (`openssl rand -base64 32`), project layout, and security posture summary. Entry points (`backend/src/index.js`, Vite `index.html`) match README. Docker Compose maps ports correctly (4000 backend, 5173 frontend). Config matches `.env.example`.

**Evidence:** `README.md:48-85`, `docker-compose.yml`, `backend/src/index.js`, `backend/package.json:9`

#### 1.2 Material Deviation from Prompt
**Conclusion: Pass**

The implementation is centered squarely on the ClinicOps domain. All five user roles, all stated functional modules, and all core constraints (offline auth, tenant isolation, AES encryption, hash-chained audit, ZIP-distance search) are present. The WeChat OAuth stub is explicitly aligned to the Prompt's "integration-ready adapter that remains disabled" wording. No major portions are unrelated to the Prompt.

**Evidence:** `app.js:25-32` (all 8 route modules), `services/` (20 service files all domain-relevant), `README.md:1-102`

---

### Section 2: Delivery Completeness

#### 2.1 Coverage of Core Requirements
**Conclusion: Partial Pass**

| Requirement | Present | Gap |
|-------------|---------|-----|
| Exam item dictionary (ref ranges, contraindications, collection methods, applicability) | Yes | — |
| Package versioning with historical snapshot | Yes | — |
| Search: keyword, category, price/deposit, availability, ZIP-distance | Yes | — |
| Favorites + recent history | Yes | — |
| Behavior-based recommendations ("because you previously booked…", age/gender) | Yes | — |
| Billing: membership/training/class/value-added types | Yes (billingType field) | No dedicated membership/PT billing model beyond billingType label |
| Bundle sales | Partial | `bundleOf` field on line items; no bundle discount logic |
| Pricing strategy versions with effective dates | Yes | — |
| Configurable sales tax, default 8.25% | Yes | — |
| Invoice breakdown before confirmation (billing preview endpoint) | Yes | — |
| Bulk ops, 10-min undo, financial fields blocked | Yes | — |
| Reconciliation: CSV/XLSX ingest, SHA-256 fingerprint | Yes | — |
| Auto-match: amount ±$0.01, ±3 days, counterparty, memo similarity | Yes | — |
| Exception lists: unmatched, suspected duplicates, variances | Partial | `VARIANCE` status not implemented |
| Disposition: confirm match, split, merge, write-off | Partial | SPLIT/MERGE dispositions accepted but no logic |
| KPI dashboard (orders, GMV, AOV, repeat purchase, fulfillment duration) | Yes | — |
| CSV exports | Yes | — |
| Tenant isolation on every query | Yes | — |
| Tamper-evident audit log | Yes | — |
| AES-256-GCM at rest | Yes | — |
| Sensitive field masking in UI | Yes | — |
| Offline ZIP-to-centroid distance | Yes | — |

**Evidence:** `services/reconciliation.js:215`, `services/kpi.js:14-67`, `utils/encryption.js:6-15`, `services/search.js:22-89`, `utils/geo.js` (confirmed via test at `services.search.test.js`)

#### 2.2 End-to-End Deliverable
**Conclusion: Pass**

The project is a complete, structured full-stack deliverable with backend, frontend, Docker orchestration, startup scripts, test suites, coverage reports, and documentation. No mock/hardcoded behavior replaces real logic except the WeChat adapter (explicitly documented). No scattered code fragments or single-file examples.

**Evidence:** Directory tree (20 service files, 13 route files, 8 test files, frontend pages), `README.md`, `docker-compose.yml`

---

### Section 3: Engineering and Architecture Quality

#### 3.1 Structure and Module Decomposition
**Conclusion: Pass**

Backend: clear separation of concerns — routes (HTTP layer), services (business logic), repositories (data access), utils (cross-cutting), middleware (auth/error). 20 service files each with single-responsibility scope. Repository abstraction is clean with switchable backends.

Frontend: pages, components, hooks, api, store, utils layers. Role-based navigation driven by backend permission set.

One structural concern: `repositories/index.js:27` reads `process.env.MONGO_URI` directly instead of `config.mongoUri`, bypassing the config module. Minor inconsistency.

**Evidence:** `backend/src/app.js:7-14`, `repositories/index.js:27`, `services/` structure

#### 3.2 Maintainability and Extensibility
**Conclusion: Pass**

Permission matrix in `services/roles.js` is data-driven (not scattered conditionals). Repository abstraction supports swapping in-memory → MongoDB without touching services. WeChat adapter documents integration points explicitly. Config-driven thresholds (lockout, tax, bulk undo window, reconciliation tolerances) make operational tuning non-invasive.

Minor tight coupling: `repositories/index.js` resolves the backend at module load time via direct `process.env` read, making it harder to test with injected config.

**Evidence:** `middleware/auth.js:35-43`, `services/roles.js` (referenced), `config/index.js:31-38`

---

### Section 4: Engineering Details and Professionalism

#### 4.1 Error Handling, Logging, Validation
**Conclusion: Pass**

- Custom error classes (`utils/errors.js`) with HTTP status, machine-readable code, and optional details. Consistent usage across all services.
- Global error handler (`middleware/error.js`) returns structured `{ error: { message, code } }` JSON. 5xx errors log with context; 401/403 log at warn level.
- Logger (`utils/logger.js`) redacts a comprehensive set of sensitive keys (password, token, ssn, idNumber, aesKey) before serialization.
- Input validation is present at service boundaries (not just route level). `billing.js` validates line items, discount, taxRate. `packages.js` validates composition, price, validityDays. `reconciliation.js` validates tenantId, filename, content.
- Cent-based arithmetic (`utils/money.js`) prevents floating-point errors in financial calculations.

**Evidence:** `middleware/error.js:1-40`, `utils/logger.js:3-23`, `services/billing.js:7-37`, `utils/money.js` (referenced)

#### 4.2 Product vs. Demo Quality
**Conclusion: Pass**

The deliverable resembles a production-oriented system: hash-chained immutable audit log, AES-256-GCM encryption envelope with IV per encryption, token revocation with generation counters, constant-time username enumeration mitigation, rate limiting with standard `X-RateLimit-*` headers, `Retry-After` header on 429, `x-powered-by` header suppressed, Helmet hardening. These are production engineering decisions, not demo scaffolding.

**Evidence:** `middleware/auth.js:8-33`, `services/tokens.js:33-53`, `services/users.js:205-212`, `app.js:19-21`, `middleware/rateLimit.js:41-47`

---

### Section 5: Prompt Understanding and Requirement Fit

#### 5.1 Accuracy of Business Understanding
**Conclusion: Partial Pass**

The core business problem is understood correctly. The implementation accurately reflects:
- Multi-tenant preventive care clinic context
- Immutable order snapshot at package version in effect at sale time (Prompt: "historical orders always display the correct item set at time of sale")
- Finance reconciliation as a critical workflow with reviewer tracking
- Offline-first positioning with explicit WeChat stub

Deviations:
- `markPaid()` permits PENDING → PAID, violating the specified PENDING → CONFIRMED → PAID lifecycle and creating uninvoiced PAID orders.
- `VARIANCE` reconciliation exception type is absent; Prompt names it as a required output.
- SPLIT/MERGE dispositions have no executable logic beyond recording the label.
- The billing page is conceptually distinct from the orders page (pricing strategy management vs. order billing), but the routing bug causes both to render simultaneously.

**Evidence:** `services/orders.js:122-130`, `services/reconciliation.js:215`, `App.tsx:37,43`

---

### Section 6: Aesthetics (Frontend)

#### 6.1 Visual and Interaction Quality
**Conclusion: Cannot Confirm Statistically (manual verification required)**

Static analysis of TSX confirms:
- Semantic HTML (`<section aria-labelledby>`, `<table>`, `<form>`, `<label>`) throughout all pages.
- Role-aware navigation hides items not permitted for the user's role (via `Layout.tsx` + `navFor(role)` from backend).
- Inline error rendering (`<p role="alert">`, `data-testid` attributes for test targeting).
- `formatMoney()` and `formatDate()` utilities in `frontend/src/utils/format.ts` for consistent presentation.
- Pagination component present for large lists.
- Billing page groups strategies by billing type (flat fee, usage, time-based) with a table per group.
- Reconciliation page provides file picker, paste fallback, filter dropdown, and per-case action buttons.

Cannot confirm visual fidelity, responsiveness, spacing, or font consistency without rendering in a browser.

Notable defect: `App.tsx:37,43` — billing route renders `<OrdersPage />` AND `<BillingPage />` simultaneously. This is directly observable as a visual defect (two tables stacked) and is a High-severity issue.

**Evidence:** `App.tsx:37,43`, `pages/Reconciliation.tsx:68-144`, `pages/Billing.tsx:55-115`

---

## 5. Issues / Suggestions (Severity-Rated)

### ISSUE-01 — Billing Route Renders Two Competing Pages Simultaneously
**Severity: High**  
**Conclusion: Fail**

`App.tsx:37` renders `<OrdersPage />` when `route === 'billing'`. `App.tsx:43` also renders `<BillingPage />` for the same condition. React evaluates both conditionally and renders both components into the DOM simultaneously. Users navigating to "billing" see an orders list stacked above the pricing strategy panel.

**Evidence:** `frontend/src/App.tsx:37,43`

**Impact:** The billing feature is broken at the UI level. Front Desk and Finance Specialist roles cannot use billing without seeing a confusing dual-page layout.

**Minimum fix:** Remove line 37 entirely (the `route === 'billing'` check that returns `<OrdersPage />`). The billing route should exclusively render `<BillingPage />`.

---

### ISSUE-02 — `markPaid()` Permits PENDING → PAID, Bypassing Invoice Creation
**Severity: High**  
**Conclusion: Fail**

`services/orders.js:125` allows an order with status `PENDING` or `CONFIRMED` to be marked PAID. A PENDING order has `invoiceId: null` (set at creation, `services/orders.js:51`). When `markPaid()` runs on a PENDING order, the invoice update block (line 128-130) is skipped because `order.invoiceId` is null. The result is a PAID order with no invoice — a financial integrity violation.

The Prompt specifies: Confirm → CONFIRMED (computes invoice) → Pay → PAID. The CONFIRMED step is explicitly defined as the point of invoice creation.

**Evidence:** `services/orders.js:122-130`, `services/orders.js:51`, `services/orders.js:92-104`

**Impact:** PAID orders without invoices produce incorrect GMV/AOV calculations in KPI reporting (`services/kpi.js:24-31`), unreconcilable payment records, and silent audit gaps.

**Minimum fix:** Change the status guard to `if (order.status !== 'CONFIRMED') throw conflict(...)`. If a PENDING order must be payable without explicit confirmation, add invoice creation logic before the status update.

---

### ISSUE-03 — Reconciliation Auto-Match Creates Duplicate Cases for Duplicate Transactions
**Severity: High**  
**Conclusion: Fail**

`services/reconciliation.js:119-125` identifies duplicate transactions (same amount + date) into a `duplicates` array. The main matching loop (lines 127-188) then processes ALL transactions — including those already in `duplicates` — for auto-matching. A transaction that is a duplicate AND matches an invoice gets:
1. A `MATCHED` case (from the main loop, lines 149-168)
2. A second `SUSPECTED_DUPLICATE` case (from the duplicates loop, lines 190-203)

This means one transaction can have two `reconciliationCases` records with conflicting statuses (`MATCHED` + `SUSPECTED_DUPLICATE`). The `listCases()` API returns both, creating reviewer confusion and potential double-matching.

**Evidence:** `services/reconciliation.js:119-125`, `services/reconciliation.js:127-188`, `services/reconciliation.js:190-203`

**Impact:** Finance Specialists see phantom duplicate cases for already-matched transactions. Reports on matched/duplicate counts are inflated. Reconciliation accuracy is undermined.

**Minimum fix:** Before the main matching loop, build a Set of duplicate transaction IDs. Skip those transactions in the main loop and only create SUSPECTED_DUPLICATE cases for them in the duplicates loop.

---

### ISSUE-04 — `VARIANCE` Reconciliation Status Not Implemented
**Severity: Medium**  
**Conclusion: Fail**

The Prompt explicitly states: "exception lists for unmatched items, suspected duplicates, and **variances**." The reconciliation service only produces `UNMATCHED`, `MATCHED`, `SUSPECTED_DUPLICATE`, and (after disposition) `WRITTEN_OFF` statuses. There is no `VARIANCE` status — cases where an invoice was found but amount differs by more than $0.01, or the time window is near-miss. These would currently fall into `UNMATCHED`.

**Evidence:** `services/reconciliation.js:147-186` (no VARIANCE case creation), `services/reconciliation.js:215` (valid dispositions don't include VARIANCE handling)

**Impact:** Finance Specialists cannot distinguish near-miss variance cases from truly unmatched transactions. Manual review burden is higher. Prompt requirement is unmet.

**Minimum fix:** After the amount/time filter, if a candidate invoice is found but amount difference exceeds tolerance OR date is outside window, create a `VARIANCE` case with score and the specific mismatch detail, rather than treating the transaction as `UNMATCHED`.

---

### ISSUE-05 — SPLIT and MERGE Dispositions Have No Business Logic
**Severity: Medium**  
**Conclusion: Partial Fail**

`services/reconciliation.js:215` accepts `SPLIT` and `MERGE` as valid dispositions. The handler (lines 227-232) records the label and reviewer but leaves case status unchanged. No transaction splitting (dividing one transaction amount across multiple invoices) and no case merging (combining two cases) logic is implemented.

The Prompt specifies "resolved through a required disposition (confirm match, split/merge, write-off)," implying each disposition type produces a defined outcome.

**Evidence:** `services/reconciliation.js:221-239`, `services/reconciliation.js:215`

**Impact:** SPLIT and MERGE dispositions are no-ops. Finance Specialists who select them believe they have resolved a case, but the underlying transaction and invoice linkage is unchanged. This could cause permanently unresolved reconciliation exceptions.

**Minimum fix:** At minimum, document the intended semantics as a comment and return a meaningful error (e.g., "SPLIT requires specifying two invoice IDs") rather than silently accepting and doing nothing. Full implementation would require additional parameters and logic in the endpoint handler.

---

### ISSUE-06 — Audit Hash Chain Race Condition Under Concurrent Writes
**Severity: Medium**  
**Conclusion: Suspected Risk**

`services/audit.js:20-39` — the `record()` function reads the last audit entry (`await auditLog.find(…, limit:1)`) and then inserts a new entry with `prevHash = prev.hash`. Between the read and the insert, another concurrent `record()` call (on a different async tick) can also read the same last entry, producing two entries with identical `prevHash` values. The chain then has two conflicting records both claiming to follow the same parent. `verifyChain()` (line 42-53) would flag these as broken.

Under Node.js's single-threaded event loop, async awaits create interleaving points where this race is real.

**Evidence:** `services/audit.js:20-39`, `services/audit.js:42-52`

**Impact:** Under any concurrent request load (e.g., a bulk operation triggering multiple audit records), the chain could be permanently broken, causing false tampering alerts.

**Minimum fix (in-memory mode):** Use a sequential queue (async mutex) for audit writes. For MongoDB mode: use a transaction or an optimistic retry loop on the insert.

---

### ISSUE-07 — Default AES Key Derived from Known Constant
**Severity: Medium**  
**Conclusion: Suspected Risk**

`config/index.js:7-9` — `DEFAULT_AES_KEY` is derived deterministically from the string `'clinicops-default-local-key-change-me'` via SHA-256. Anyone reading the source can compute this key and decrypt any data encrypted with it (idNumber, SSN fragments). The production guard (`config/index.js:63-65`) correctly blocks production deployments without `CLINICOPS_AES_KEY`, but dev/staging data encrypted under the default key has no security.

**Evidence:** `config/index.js:7-9`, `config/index.js:63-65`

**Impact:** Sensitive fields (idNumberEncrypted on user records) in development or staging databases are decryptable from source code. If dev data is ever promoted or leaked, the encryption is meaningless.

**Minimum fix:** In addition to the production guard, add a `NODE_ENV === 'development'` warning (not just a comment) when the default key is used. Alternatively, fail startup in staging environments.

---

### ISSUE-08 — Default JWT Secret in Non-Production Environments
**Severity: Medium**  
**Conclusion: Suspected Risk**

`config/index.js:23` — `jwtSecret` defaults to `'clinicops-dev-secret-change-me'`. Production throws if the default is used (`config/index.js:55-62`). However, non-production environments (staging, long-lived dev deployments) will silently use this publicly-known secret. Any token signed with the default secret is forgeable by any party who has read the source.

**Evidence:** `config/index.js:23`, `config/index.js:54-62`

**Impact:** On any deployment where `JWT_SECRET` is not set and `NODE_ENV !== 'production'`, tokens can be forged — granting arbitrary role and tenant claims.

**Minimum fix:** Log an explicit `console.warn` for staging environments. Consider failing startup unless `JWT_SECRET` is explicitly set in any non-test environment.

---

### ISSUE-09 — Search `pageSize` Not Upper-Bounded
**Severity: Medium**  
**Conclusion: Suspected Risk**

`services/search.js:36` — the `pageSize` parameter defaults to 20 but has no upper-bound clamp. Compare to `routes/orders.js:19` which explicitly clamps to `Math.min(200, ...)`. If a caller passes `pageSize=100000` to the package search endpoint, the service fetches and filters all packages in the tenant, then slices. For tenants with large catalogs this performs an unbounded full-scan.

**Evidence:** `services/search.js:36`, `routes/orders.js:19`

**Impact:** An authenticated user (any role with `package:read`) can trigger unbounded memory allocation by passing large `pageSize` values. For offline clinic deployments on limited hardware, this can cause OOM or significant latency.

**Minimum fix:** Add `pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 20))` before use.

---

### ISSUE-10 — `repositories/index.js` Reads `process.env` Directly Instead of Config Module
**Severity: Low**  
**Conclusion: Architectural inconsistency**

`repositories/index.js:27` reads `process.env.MONGO_URI` directly, bypassing `config.mongoUri`. If the config module is ever extended to transform or validate the URI, the repository would not reflect those changes.

**Evidence:** `repositories/index.js:27`, `config/index.js:48`

**Minimum fix:** Replace with `const { mongoUri } = require('../config');`.

---

### ISSUE-11 — Rate Limiter Is In-Memory Only (No Horizontal Scale Support)
**Severity: Low**  
**Conclusion: Known limitation, documented**

`middleware/rateLimit.js:4-6` acknowledges that the rate limiter uses an in-memory Map and is not suitable for horizontal scaling. This is acceptable for the stated offline/single-process deployment model, but should be explicitly called out in operations documentation.

**Evidence:** `middleware/rateLimit.js:4-6`

**Minimum fix:** Add a note in README about the Redis requirement for multi-process deployments.

---

### ISSUE-12 — Reconciliation Disposition Uses `window.prompt()` for Note Input
**Severity: Low**  
**Conclusion: UX quality gap**

`pages/Reconciliation.tsx:62` — disposition notes are collected via `window.prompt()`, a browser-native modal dialog. This is inconsistent with the Prompt's requirement for inline validation and fast no-refresh interactions. On tablet interfaces `window.prompt()` is particularly disruptive.

**Evidence:** `pages/Reconciliation.tsx:62`

**Minimum fix:** Replace with an inline input field or a React-managed modal component.

---

## 6. Security Review Summary

### Authentication Entry Points
**Conclusion: Pass**

`routes/auth.js:35-55` — POST `/api/auth/login` validates username/password, runs constant-time bcrypt compare against a dummy hash for missing users (`services/users.js:207-212`), enforces lockout (`services/users.js:218-241`), signs a JWT with generation counter, returns nav/permissions. Rate limited by `loginLimiter` (10 attempts per 15-min window by default). `/health` endpoint requires no auth and returns no sensitive data. Password policy endpoint (`GET /api/auth/password-policy`) is unauthenticated but only exposes policy metadata — acceptable.

**Evidence:** `routes/auth.js:35-55`, `services/users.js:205-212`, `services/tokens.js:24-27`

### Route-Level Authorization
**Conclusion: Pass**

All protected routes apply `authenticate` then `requirePermission(...)` or `requireRole(...)`. Router-level `router.use(authenticate, enforceTenantScope)` ensures no route in a protected router can be reached unauthenticated. The health endpoint and auth routes are the only unprotected endpoints, both appropriate.

**Evidence:** `routes/orders.js:12`, `routes/reports.js:11`, `routes/reconciliation.js` (inferred from pattern), `app.js:25-32`

### Object-Level Authorization
**Conclusion: Pass**

Every service fetch verifies the fetched record's `tenantId` matches the caller's scope:
- `services/orders.js:66-67`: `if (!order || order.tenantId !== tenantId) throw notFound(...)`
- `services/reconciliation.js:219`: `if (!kase || kase.tenantId !== tenantId) throw notFound(...)`
- `services/packages.js:88-89`: same pattern

This ensures that guessing a resource ID from another tenant returns 404 (not 403), preventing enumeration.

**Evidence:** `services/orders.js:66-67`, `services/packages.js:151-152`, `services/reconciliation.js:219`

### Function-Level Authorization
**Conclusion: Pass**

Fine-grained permission tokens (`invoice:refund`, `order:bulk`, `reconciliation:manage`, `user:blacklist`, `tenant:read`) are enforced per-route via `requirePermission()`. SYSTEM_ADMIN-only operations (tenant CRUD, audit chain verify, merge approve) use `requireRole(ROLES.SYSTEM_ADMIN)`. The RBAC matrix is tested explicitly in `security.test.js:243-275`.

**Evidence:** `routes/orders.js:116-121`, `routes/reports.js:38-44`, `security.test.js:243-275`

### Tenant / User Data Isolation
**Conclusion: Pass**

Defense-in-depth approach:
1. `middleware/auth.js:53-63` — `enforceTenantScope` sets `req.scopeTenantId` from user's tenantId (or header override for SYSTEM_ADMIN).
2. All service functions accept `tenantId` and filter by it in every query.
3. `middleware/auth.js:68-75` — `assertTenantScope()` provides a second check callable from services to guard against middleware bypass.
4. `services/users.js:18-23` — `assertActorTenantMatch()` prevents cross-tenant user mutations.

Confirmed by tests: `security.test.js:29-118` explicitly tests cross-tenant invisibility for exam items, packages, orders, invoices, reconciliation cases, and audit logs.

**Evidence:** `middleware/auth.js:53-75`, `services/orders.js:186-188`, `security.test.js:44-118`

### Admin / Internal / Debug Endpoint Protection
**Conclusion: Pass**

- Tenant CRUD: `routes/tenants.js` uses `requireRole(ROLES.SYSTEM_ADMIN)` for list/create.
- Audit chain verification: `GET /api/reports/audit/verify` uses `requireRole(ROLES.SYSTEM_ADMIN)`.
- Account merge approve/reject: service-level check `approver.role !== ROLES.SYSTEM_ADMIN`.
- Identity record review: admin-only (`services/identity.js` checked via test).
- No debug or internal endpoints found. `/health` returns only `{ status: 'ok' }`.
- `x-powered-by` header suppressed (`app.js:19`). Helmet applied (`app.js:20`).

**Evidence:** `routes/reports.js:38-43`, `services/users.js:300`, `app.js:19-20`

---

## 7. Tests and Logging Review

### Unit Tests
**Conclusion: Pass**

Backend unit tests cover: password policy validation, JWT sign/verify/revoke, bcrypt operations, auth lockout, user lifecycle (create/update/deactivate/blacklist/merge), reconciliation service (fingerprint, auto-match, dispositions), billing computation, package versioning/search/recommendations, KPI computation, CSV export, audit chain, identity verification. Test isolation via `beforeEach(resetDb)`.

Framework: Jest 29. Entry point: `npm test` in `backend/`.

**Evidence:** `backend/tests/services.auth.test.js`, `services.reconciliation.test.js`, `services.orders.test.js`, `services.packages.test.js`

### API / Integration Tests
**Conclusion: Pass**

`backend/tests/routes.test.js` and `security.test.js` use `supertest` to issue real HTTP requests against the Express app. They cover the complete HTTP layer including headers, status codes, and response shapes. Cross-tenant isolation, admin-only protection, rate limiting, and account lockout are all tested at the HTTP level.

107 total backend tests per README.

**Evidence:** `routes.test.js:1-442`, `security.test.js:1-300`

### Logging Categories / Observability
**Conclusion: Pass**

Logger (`utils/logger.js`) emits ISO timestamp, level (INFO/WARN/ERROR), message, and redacted metadata. 5xx errors log with method, path, userId, tenantId. 401/403 log at warn with path and code. Auth events (login, password change, blacklist, lockout) are recorded in the tamper-evident audit log. Logging is suppressed in test environments (`NODE_ENV === 'test'`), which prevents test noise but also means log-format regressions are not caught by tests.

**Evidence:** `utils/logger.js:55-83`, `middleware/error.js:14-31`, `services/users.js:248-256`

### Sensitive-Data Leakage Risk in Logs / Responses
**Conclusion: Pass (with caveat)**

Logger `redact()` function (`utils/logger.js:27-43`) strips `password`, `passwordHash`, `token`, `authorization`, `idNumber`, `ssn`, `aesKey`, and 10 other keys before serialization. The `sanitize()` function in `services/users.js:12-16` strips `passwordHash` from all user responses. `idNumberEncrypted` is never returned in user responses (only the encrypted envelope is stored; masking is frontend-side for display).

Caveat: `logger.js:62` disables logging entirely in `NODE_ENV=test`, so no test verifies that the redaction keys are correctly applied to actual log output. If a new sensitive field is added and `SENSITIVE_KEYS` is not updated, the oversight won't be caught.

**Evidence:** `utils/logger.js:3-23`, `services/users.js:12-16`, `utils/encryption.js:33-39`

---

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview

| Dimension | Value |
|-----------|-------|
| Backend test framework | Jest 29 + supertest 6 |
| Backend test count | 107 tests (README:89) |
| Backend line coverage | ~99% (README:89) |
| Backend branch threshold | 80% (package.json:31) |
| Frontend test framework | Vitest + React Testing Library |
| Frontend test count | 28 tests (README:90) |
| Frontend line coverage | ~94% (README:90) |
| Test entry points | `npm test` (backend), `npm test` (frontend), `./run_tests.sh` (Docker) |
| Test hermetic | Yes — in-memory repository, no external dependencies |
| Documentation of test commands | Yes |

**Evidence:** `backend/package.json:9,26-38`, `README.md:87-92`, `backend/tests/` (13 files)

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case | Key Assertion | Coverage Assessment | Gap | Min. Test Addition |
|--------------------------|-----------------|---------------|--------------------|----|---------------------|
| Login happy path | `routes.test.js:13-19` | `status=200`, `token` defined | Sufficient | — | — |
| Login wrong password → 401 | `routes.test.js:14` | `status=401` | Sufficient | — | — |
| Login account lockout → 403 LOCKED | `routes.test.js:75-90`, `services.auth.test.js:69-76` | `code=LOCKED` | Sufficient | — | — |
| Rate limit on login → 429 | `routes.test.js:54-73` | `status=429, code=RATE_LIMITED` | Sufficient | — | — |
| Username enumeration timing resistance | `routes.test.js:92-103` | Same 401 code for ghost and wrong-password | Basically covered | Wall-clock timing not verified | — |
| Blacklisted user blocked at middleware | `routes.test.js:105-111` | `status=403` | Sufficient | — | — |
| Token revocation after blacklist | `services.auth.test.js:58-64` | `isRevoked=true` | Sufficient | — | — |
| Token revocation after password change | `services.auth.test.js:38-48` | Old token revoked, new token valid | Sufficient | — | — |
| Tenant isolation — exam items | `security.test.js:44-51` | `items=[],status=404` | Sufficient | — | — |
| Tenant isolation — orders/invoices | `security.test.js:65-106` | `status=404` | Sufficient | — | — |
| Tenant isolation — reconciliation cases | `security.test.js:80-106` | `status=404` on cross-tenant dispose | Sufficient | — | — |
| Tenant isolation — audit log | `security.test.js:108-118` | Tenant IDs filtered | Sufficient | — | — |
| Admin-only tenant CRUD | `security.test.js:124-137` | Non-admin gets 403 | Sufficient | — | — |
| Admin-only merge approve | `security.test.js:139-154` | `status=403` for manager | Sufficient | — | — |
| RBAC matrix | `security.test.js:243-275` | `hasPermission()` matrix | Sufficient | — | — |
| Order lifecycle (create→confirm→pay→fulfill) | `routes.test.js:308-358` | Each step returns 200/201 | Basically covered | PENDING→PAID bypass not tested | Test markPaid on PENDING order should fail |
| PENDING→PAID bypass (ISSUE-02) | None | — | **Missing** | PENDING→PAID succeeds when it should fail | Assert `markPaid(pendingOrder)` throws or requires CONFIRMED first |
| Invoice creation at confirm | `routes.test.js:323-327` | `invoice.id` defined in confirm response | Sufficient | — | — |
| Billing computation (tax, discount, receivable) | `services.reconciliation.test.js:seedInvoice`, `routes.test.js:316-320` | `total > 0` | Basically covered | Edge case: discount > subtotal not covered in route tests | — |
| Bulk update blocks financial fields | `services.orders.test.js` (inferred) | `FINANCIAL_FIELDS` set, forbidden check | Cannot Confirm | Only integration tested at service level | Confirm in route test |
| 10-min undo window | `routes.test.js:355-357` | `undo status=200` | Basically covered | Expired window not tested | Test undo after window expiry returns 409 |
| Reconciliation fingerprint dedupe | `security.test.js:175-183` | `code=DUPLICATE_FILE` | Sufficient | — | — |
| Reconciliation auto-match | `services.reconciliation.test.js:52-63` | `matched>=1` | Basically covered | Double-case bug (ISSUE-03) not caught | Test that each transaction has at most one case |
| VARIANCE status | None | — | **Missing** | Prompt requires VARIANCE; no implementation | Implement + test VARIANCE case creation |
| SPLIT/MERGE disposition logic | None | — | **Missing** | Accepted but no logic tested | Test that SPLIT/MERGE produce defined outcomes |
| AES-256-GCM encryption | `security.test.js:206-240` | Encrypt/decrypt round-trip; cross-key failure | Sufficient | — | — |
| idNumber stored encrypted | `services.auth.test.js:126-138` | `idNumberEncrypted` matches `v1:` pattern | Sufficient | — | — |
| Audit hash chain integrity | `security.test.js:280-299` | `valid=true` before tamper, `false` after | Sufficient | Race condition not tested | — |
| Audit chain concurrency | None | — | **Missing** | Concurrent writes may produce chain breaks | — |
| KPI dashboard metrics | `services.reconciliation.test.js:137-177` | GMV, AOV, repeatRate, fulfillmentHours | Sufficient | — | — |
| pageSize unbounded in search | None | — | **Missing** | No test passes large pageSize | Test search with pageSize=100000 completes in bounded time |
| Sensitive field not in user response | `services.auth.test.js:137` + `routes.test.js:145` | No `passwordHash` in response | Sufficient | — | — |
| XLSX ingest | `services.reconciliation.test.js:120-131` | `transactions.length=1` | Sufficient | — | — |
| WeChat disabled by default | `services.auth.test.js:248-263` | `isEnabled()=false`, throws WECHAT_DISABLED | Sufficient | — | — |

### 8.3 Security Coverage Audit

**Authentication:**
Covered well. Login, lockout, rate limit, constant-time response, token revocation, blacklist/deactivate blocking — all explicitly tested. No critical gaps.

**Route Authorization:**
Covered for admin-only routes (tenants, audit/verify, merge approve) and permission-level routes (invoice:refund blocked for auditor in `routes.test.js:427-441`). Cross-role 403 is validated in the RBAC matrix test. Basically sufficient, though not every permission/endpoint combination is exhaustively tested.

**Object-Level Authorization:**
Tenant isolation tests in `security.test.js:44-106` cover exam items, packages, orders, invoices, and reconciliation cases. The 404-for-cross-tenant-read pattern is confirmed for all major resource types.

**Tenant / Data Isolation:**
Explicitly and thoroughly tested. Two-tenant setup in `security.test.js:32-40` creates realistic isolation scenarios. Audit log scoping is also tested.

**Admin / Internal Protection:**
Tests confirm non-admin users get 403 on tenant CRUD and merge approve/reject. Audit chain verification (`GET /api/reports/audit/verify`) tested as SYSTEM_ADMIN-only.

**Severe undetected defects possible:**
- PENDING→PAID financial bypass (ISSUE-02) is not tested and allows payment without invoicing. A test suite run could pass (there are no assertions that this fails) while this defect enables uninvoiced payments.
- Reconciliation double-case bug (ISSUE-03) would not be caught by existing tests since they only check `summary.matched >= 1`, not uniqueness of cases per transaction.

### 8.4 Final Coverage Judgment

**Partial Pass**

**Major risks that are well-covered:** authentication and lockout, tenant isolation, RBAC, AES encryption, audit chain integrity, reconciliation fingerprint idempotency, token revocation, order lifecycle (happy path).

**Uncovered risks that allow defects to remain undetected:**
1. PENDING→PAID bypass (ISSUE-02): existing tests never assert that confirming a PENDING order's payment requires prior invoice creation. A broken implementation passes.
2. Reconciliation double-case creation (ISSUE-03): tests verify `summary.matched >= 1` but do not assert one case per transaction. Duplicate cases pass all tests.
3. VARIANCE/SPLIT/MERGE gaps: no tests exist for these features, so absence of implementation is also undetected.
4. Audit chain concurrent-write race: there is no concurrency test.

---

## 9. Final Notes

The project demonstrates strong engineering discipline: the security primitives (AES-256-GCM, hash chaining, constant-time auth, token generation revocation) are implemented correctly and thoroughly tested. The architecture — thin routes, service layer with domain logic, switchable repository, in-memory default — is sound for the stated deployment model.

The three High-severity issues (billing route duplication, PENDING→PAID bypass, reconciliation double-case) are all localized to 1–5 lines of code each and do not indicate systemic architectural problems. They are likely the result of late-stage integration without final verification of the routing tree and state machine edge cases.

The Medium-severity gaps (VARIANCE status, SPLIT/MERGE logic) reflect incomplete implementation of stated Prompt requirements rather than misunderstanding.

No issues were found with: tenant data isolation, permission enforcement, sensitive data handling, cryptographic implementation, documentation quality, or test infrastructure. These are all at or above professional production standard.
