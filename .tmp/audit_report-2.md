# ClinicOps Reconciliation & Exam Package Platform — Delivery Acceptance & Architecture Audit

**Audit Date:** 2026-04-19  
**Auditor:** Static analysis, no code execution  
**Working Directory:** `/Users/mac/Eagle-Point Season 2/w3t5/repo`

---

## 1. Verdict

**Partial Pass**

The delivery is architecturally complete, prompt-aligned, and demonstrates professional engineering discipline across authentication, multi-tenancy, billing, reconciliation, and audit trails. Two High-severity issues — a production Docker configuration that silently uses publicly known secrets that bypass code-level guards, and a default in-memory data store with no persistence in the production container — prevent a clean Pass. A Medium-severity issue (password change without current-password verification) and several lower-severity gaps round out the findings. No Blocker-level issues were found.

---

## 2. Scope and Static Verification Boundary

**Reviewed:**
- All source files under `repo/backend/src/` and `repo/frontend/src/`
- All test files under `repo/backend/tests/` and `repo/frontend/tests/`
- `repo/README.md`, `repo/.env.example`, `repo/docker-compose.yml`, `repo/Dockerfile`, `repo/start.sh`, `repo/run_tests.sh`
- `repo/backend/src/config/index.js` (config validation), all middleware, route handlers, services, utils, repositories

**Not Reviewed:**
- `repo/backend/src/data/zipCentroids.js` (size; spot-checked via usage in geo.js)
- `node_modules/` contents
- Runtime behavior of any service

**Intentionally Not Executed:**
- No `docker compose up`, `npm start`, `npm test`, or browser interaction

**Claims Requiring Manual Verification:**
- Claimed ~99% backend and ~94% frontend test coverage (coverage tooling not run)
- Runtime MongoDB adapter correctness (only interface contract inspected)
- Frontend visual rendering quality (UI not rendered)
- Docker multi-stage build correctness
- Whether `MONGO_URI` is actually populated in any real deployment environment

---

## 3. Repository / Requirement Mapping Summary

**Prompt Core Goal:** Multi-location offline-first preventive care clinic platform — sells configurable exam packages, bills accurately, closes the loop from patient intake through finance reconciliation and performance reporting.

**Core Flows:**
1. Front Desk searches packages → places order → Finance confirms with invoice → marks paid → fulfills
2. Clinic Manager manages exam items, package versions, pricing strategies
3. Finance ingests bank CSV/XLSX → auto-match → manual disposition for exceptions
4. RBAC enforces five roles with distinct permission sets and scoped navigation
5. System Administrator manages tenants, approves account merges, verifies audit chain

**Mapped Implementation:**
| Prompt Requirement | Implementation |
|---|---|
| Offline offline auth, bcrypt, 12-char min, 5-fail lockout | `services/password.js`, `services/users.js:205–257`, `config/index.js:31–32` |
| WeChat OAuth adapter disabled | `services/wechatAdapter.js` — throws `WECHAT_DISABLED` unless enabled |
| Exam item dictionary with reference ranges, composition versioning | `services/examItems.js`, `services/packages.js`, `packageVersions` collection |
| Billing: time/usage/amount, bundles, tax 8.25%, invoice preview | `services/billing.js:30–60`, `services/pricing.js`, `routes/orders.js:52–57` |
| Bulk update with 10-min undo | `services/orders.js:194–271`, `config/index.js:33` |
| Reconciliation: CSV/XLSX ingest, fingerprint, auto-match ±$0.01/±3 days | `services/reconciliation.js` full |
| Exception lists, SPLIT/MERGE/WRITE_OFF dispositions | `services/reconciliation.js:247–362` |
| KPI dashboard, CSV exports, multi-tenant scoping | `services/kpi.js`, `services/exports.js`, `routes/reports.js` |
| AES-256 sensitive field encryption at rest | `utils/encryption.js`, `services/users.js:62` |
| SHA-256 hash-chain audit log | `services/audit.js` |
| RBAC five roles, nav filtering | `services/roles.js` |
| ZIP-to-centroid distance, recommendations | `utils/geo.js`, `services/recommendations.js`, `services/search.js` |
| Account deactivate preserving financial history | `services/users.js:172–186` — `deactivatedAt` set, records retained |
| Account merge requiring admin approval + audit note | `services/users.js:265–347` |
| Real-name verification, risky tagging, blacklisting | `services/identity.js`, `services/users.js:132–169` |

---

## 4. Section-by-Section Review

### 1.1 Documentation and Static Verifiability

**Conclusion: Pass**

`README.md` provides start commands (Docker and local dev), test commands, environment variables table, seeded credentials, and security notes. `docker-compose.yml` and `Dockerfile` are present. `.env.example` documents all relevant vars. Route entry points and project structure are consistent with the documented layout.

**Evidence:** `README.md:49–96` (run/test commands), `README.md:99–109` (seeded creds), `README.md:113–126` (env vars)

---

### 1.2 Material Deviation from Prompt

**Conclusion: Pass**

The project is centered on the exact business goal described. All major flows (package catalog, versioned packages, billing, reconciliation, KPI, five roles, ZIP-distance, recommendations, audit chain) are implemented. No major unrelated features are present.

**Evidence:** Route registration in `app.js:11–18`; 19 collections in `repositories/index.js`; services map 1:1 to each major prompt domain.

---

### 2.1 Full Coverage of Core Requirements

**Conclusion: Partial Pass**

All explicitly stated core functional requirements are implemented. The following are fully present:

- Exam item dictionary with reference ranges, units, contraindications, collection methods (`services/examItems.js`)
- Package composition: required/optional items, validity windows, version history (`services/packages.js`)
- Pricing strategy versions with effective dates and timezone support (`services/pricing.js`)
- Billing: membership/PT/group/VAS billing types, bundles, configurable tax (default 8.25%), pre-confirm invoice preview (`services/billing.js`, `routes/orders.js:52–57`)
- Bulk operations with 10-minute undo window on non-financial fields (`services/orders.js:194–271`)
- Reconciliation: CSV/XLSX, fingerprint dedup, auto-match, SPLIT/MERGE/WRITE_OFF (`services/reconciliation.js`)
- KPI (orders, GMV, AOV, repeat purchase, fulfillment duration) (`services/kpi.js:14–66`)
- CSV exports for orders, invoices, reconciliation (`services/exports.js`)
- AES-256-GCM for SSN/ID at rest (`utils/encryption.js`)
- Tamper-evident hash-chain audit log (`services/audit.js`)
- RBAC five roles with permission matrix and scoped nav (`services/roles.js`)

**Gap:** The Prompt specifies "historical orders always display the correct item set at time of sale." This is implemented via `snapshot` in `orders.js:36–44`, which captures `composition`, `price`, `deposit`, `validityDays` at order time. However, the snapshot does **not** capture individual exam item details (reference ranges, contraindications) at order time — only the version's composition array of `examItemId` references. If an exam item is later edited, historical order views that resolve item details via the current exam item record would see updated values. **Partially met for versioning of price/composition structure; exam item field-level historical fidelity is not guaranteed.**

**Evidence:** `services/orders.js:36–44` (snapshot), `services/examItems.js` (no frozen copy), `services/packages.js` (versioning via PackageVersion)

---

### 2.2 End-to-End Deliverable

**Conclusion: Pass**

The project is a complete full-stack application, not a fragment. Backend has Express API with 8 route modules, 20 service files, proper middleware chain, and a repository abstraction. Frontend has 15 page components, AuthProvider context, typed API client, and component library. Docker Compose orchestrates both services. Seed data populates all five roles on first boot. No hardcoded mock behavior substitutes for real logic.

**Evidence:** `app.js:6–32` (all routes wired), `frontend/src/App.tsx:20–46` (all pages registered), `seed.js` (full demo data), `README.md:49–74` (Docker and local run)

---

### 3.1 Engineering Structure and Module Decomposition

**Conclusion: Pass**

The project is organized into clear layers: `routes/` (HTTP contract), `services/` (business logic), `repositories/` (persistence), `utils/` (pure helpers), `middleware/` (cross-cutting concerns). Each service file addresses exactly one domain. The in-memory repository has a clean MongoDB-compatible interface. The Mongoose adapter is a separate drop-in file. Frontend follows page/component/hook/api/store/utils decomposition.

No redundant or unnecessary files found. No single-file pile-up.

**Evidence:** Backend directory: `routes/` (8 files), `services/` (19 files), `repositories/` (3 files), `utils/` (9 files), `middleware/` (4 files). Frontend: `pages/` (15 files), `components/` (3 files), `hooks/` (1 file), `api/` (2 files).

---

### 3.2 Maintainability and Extensibility

**Conclusion: Pass**

- Permission matrix in `services/roles.js` is data-driven and easy to extend
- Pricing strategy versions are additive (create new, never edit)
- Package versions are immutable; historical orders hold a snapshot
- In-memory / MongoDB duality allows swapping persistence without changing business logic
- Error constructors centralized in `utils/errors.js`
- Config entirely driven by environment variables

Minor coupling: `services/audit.js` imports from `repositories/index.js` directly (not via an interface), which would make testing the audit service in isolation slightly harder. Acceptable at this scale.

**Evidence:** `services/roles.js:13–78` (data-driven RBAC), `repositories/index.js` (collection factory), `config/index.js:21–51` (env-driven config)

---

### 4.1 Engineering Details and Professionalism

**Conclusion: Pass**

- Centralized error handler returns structured `{ error: { message, code, details } }` on all failure paths (`middleware/error.js:5–34`)
- `asyncHandler` wrapper prevents unhandled promise rejections from crashing the process (`middleware/asyncHandler.js`)
- Logger redacts sensitive keys (password, token, SSN, AES key) before emitting (`utils/logger.js:3–44`)
- Input validation present at every service boundary (username required, password policy, role enum, tenant existence, discount ≤ subtotal, taxRate 0–1, etc.)
- Money handled in integer cents with explicit conversion (`utils/money.js`) — no floating-point accumulation
- CSV formula injection defense (`utils/csv.js` `escapeFormula`)
- CORS and Helmet applied at app factory (`app.js:7–8`)
- `x-powered-by` disabled (`app.js:6`)
- Health check endpoint separate from business routes

**Evidence:** `middleware/error.js:5–34`, `utils/logger.js:3–44`, `services/billing.js:34–46` (validation), `utils/money.js`, `app.js:6–9`

---

### 4.2 Product vs. Demo Quality

**Conclusion: Pass**

The delivery resembles a production-quality internal tool, not a teaching example. Features include: generation-based JWT revocation, bcrypt dummy-hash for constant-time username enumeration defense, CSV fingerprinting to block re-import, hash-chain tamper detection, AES-256-GCM with proper IV and auth tag, pagination on all list endpoints, in-process rate limiter with reset interface for testability, and a complete Docker multi-service setup. All five roles are differentiated in navigation and permissions.

**Evidence:** `services/users.js:209–211` (dummy hash), `services/tokens.js:39–52` (generation revocation), `services/reconciliation.js:48–50` (fingerprint), `services/audit.js:50–60` (chain verify), `utils/encryption.js:11–15` (GCM IV)

---

### 5.1 Prompt Understanding and Requirement Fit

**Conclusion: Pass**

The implementation accurately reflects the Prompt's business semantics:

- "Distance" computed via offline ZIP-centroid table + clinic coordinates (haversine) as specified — not via online API (`utils/geo.js`, `services/search.js:44–55`)
- "WeChat OAuth adapter remains disabled in offline deployments" — implemented as a stub that throws `WECHAT_DISABLED` unless enabled via env var (`services/wechatAdapter.js:40–48`)
- "Account deactivation that preserves financial history" — deactivation sets `active: false` without deleting orders/invoices; audit note records `preservesFinancialHistory: true` (`services/users.js:172–186`)
- "Account merge requiring Administrator approval with an audit note" — two-step requestMerge/approveMerge with `requireRole(SYSTEM_ADMIN)` and mandatory reason (`services/users.js:265–323`)
- Validity windows stored on package version (`packageVersions.validityDays`), captured in order snapshot
- Versioned packages: `currentVersion` pointer + immutable `PackageVersion` records; historical orders carry their version number and snapshot

One interpretation gap: "internal APIs on the same LAN" for reconciliation ingest is documented as a planned extension but not implemented. The Prompt states this is "optional," so this is acceptable.

**Evidence:** `utils/geo.js:1–40` (haversine + ZIP table), `services/wechatAdapter.js:40–76`, `services/users.js:172–186`, `services/orders.js:36–44` (snapshot)

---

### 6.1 Aesthetics (Frontend Visual Quality)

**Conclusion: Cannot Confirm Statistically — Manual Verification Required**

Static analysis confirms: 15 page components exist and are wired in `App.tsx`. The `Layout` component provides a navigation sidebar filtered by role. A `Pagination` component exists. CSS is in `styles.css`. Inline `error` and `role="alert"` are used for form feedback. The `Input` component with `label` and `data-testid` indicates form accessibility awareness.

Runtime rendering quality, responsive layout at tablet/desktop breakpoints, hover/click states, visual consistency, and icon rendering cannot be confirmed without executing the frontend in a browser.

**Evidence:** `App.tsx:20–46` (all pages present), `components/Layout.tsx` (nav sidebar), `components/Pagination.tsx`, `pages/Login.tsx:40–48` (error feedback), `styles.css` (exists)

---

## 5. Issues / Suggestions (Severity-Rated)

---

### ISSUE-01 — [High] Docker Production Compose Uses Publicly Known Secrets That Bypass Code-Level Guards

**Conclusion:** Fail — security control bypassed by design of deployment config

**Evidence:**
- `docker-compose.yml:18`: `JWT_SECRET: "${JWT_SECRET:-clinicops-docker-demo-jwt-secret-rotate-me}"`
- `docker-compose.yml:20`: `CLINICOPS_AES_KEY: "${CLINICOPS_AES_KEY:-Y2xpbmljb3BzLWRlbW8tYWVzLWtleS0zMmJ5dGVzISE=}"`
- `config/index.js:54–55`: Production guard checks `env.JWT_SECRET === 'clinicops-dev-secret-change-me'` only
- `config/index.js:63–64`: AES production guard checks `!env.CLINICOPS_AES_KEY` only

**Impact:** When `docker-compose.yml` is used without explicit `JWT_SECRET` and `CLINICOPS_AES_KEY` environment overrides, the Docker defaults are not equal to the code's sentinel strings. The production guard in `config/index.js` therefore does **not** throw. The container starts in `NODE_ENV=production` with publicly known secrets. Any attacker who reads the docker-compose.yml can forge valid JWTs and decrypt any AES-encrypted field (SSNs, ID numbers). This is the single most dangerous deployment risk in the delivery.

**Minimum Actionable Fix:**
1. Update the production guard in `config/index.js` to maintain a set of all known-weak defaults (both code and Docker variants), or
2. Remove the `:-` fallback from `docker-compose.yml` so that `JWT_SECRET` and `CLINICOPS_AES_KEY` are genuinely required, causing the container to fail fast if not provided, or
3. Add a startup check that fails if the JWT_SECRET matches any known public string.

---

### ISSUE-02 — [High] In-Memory Store Is Default With No Persistence in Production Container

**Conclusion:** Fail — production container loses all data on restart

**Evidence:**
- `docker-compose.yml:1–25`: `NODE_ENV=production` is set; `MONGO_URI` is absent
- `config/index.js:48–49`: `mongoUri: env.MONGO_URI || null`, `dbMode: env.MONGO_URI ? 'mongo' : 'memory'`
- `repositories/index.js`: Uses in-memory store when `dbMode === 'memory'`
- `README.md:9`: "In-memory repository (MongoDB-compatible interface; drop-in Mongoose adapter available via `MONGO_URI`)"

**Impact:** When deployed with `docker-compose.yml` as provided, all tenants, users, orders, invoices, reconciliation records, and audit logs are held in process memory. Any container restart, crash, or Docker image rebuild destroys all data. The system boots in `NODE_ENV=production` with zero persistence. The README mentions MongoDB as optional but does not warn that the production Docker image has no persistence at all.

**Minimum Actionable Fix:**
Either add a MongoDB service to `docker-compose.yml` and set `MONGO_URI`, or add a startup warning/error when `NODE_ENV=production` and `MONGO_URI` is unset. The README should explicitly document this limitation.

---

### ISSUE-03 — [Medium] Password Change Does Not Require Current Password Verification

**Conclusion:** Partial Fail — session hijack leads to permanent account takeover

**Evidence:**
- `routes/auth.js:80–88`: `POST /api/auth/password` accepts `newPassword` only; no `currentPassword` field
- `services/users.js:114–130`: `changePassword(id, newPassword, actor)` — no current password check

**Impact:** Any attacker who obtains a valid session token (e.g., via XSS from the localStorage-stored JWT, or via an unattended workstation) can permanently change the account password without knowing the existing password, completing a full account takeover. Token revocation on password change (`tokens.revokeUserTokens`) means the attacker's original token is revoked — but they already set a new password and own the account.

**Minimum Actionable Fix:** Add a `currentPassword` parameter to `POST /api/auth/password` and verify it with bcrypt before proceeding. For admin-initiated password resets, a separate admin-only endpoint can bypass this check.

---

### ISSUE-04 — [Medium] In-Process Rate Limiter Not Effective Under Horizontal Scale

**Conclusion:** Known limitation, documented but not mitigated in deployment config

**Evidence:**
- `middleware/rateLimit.js`: Uses `new Map()` per process; no shared state
- `README.md:134`: "Rate limiter uses an in-process counter; replace with a Redis store for multi-process deployments"
- `docker-compose.yml`: Single backend container — single-process today, but no Redis is included

**Impact:** If the backend is scaled to multiple processes or containers, each process maintains independent counters. An attacker can send login attempts round-robin across N instances, effectively multiplying the allowed attempts by N before any single limiter fires. The per-user lockout (`config.lockoutThreshold = 5`) provides a compensating control, but that lockout can itself be used as a denial-of-service vector against legitimate users by exhausting it from multiple IPs.

**Minimum Actionable Fix:** For offline/single-process deployments this is acceptable. For any multi-process deployment, replace the in-memory Map with Redis using `rate-limit-redis`. Document the single-process constraint explicitly in deployment requirements.

---

### ISSUE-05 — [Medium] JWT Stored in localStorage — Susceptible to XSS Exfiltration

**Conclusion:** Known architectural tradeoff, no mitigation present

**Evidence:**
- `frontend/src/store/auth.ts`: `localStorage.setItem('clinicops_session', JSON.stringify(s))`
- `frontend/src/store/auth.ts`: `loadSession()` reads and parses from localStorage

**Impact:** Any XSS vulnerability in the React frontend (e.g., from unsanitized API data rendered as HTML) allows an attacker to read `clinicops_session` from localStorage and replay the JWT from any origin. An httpOnly cookie would block this class of attack. For an offline internal-use deployment this risk is reduced, but the Prompt does not restrict frontend threat model.

**Minimum Actionable Fix:** For a hardened deployment, move session storage to an httpOnly, Secure, SameSite=Strict cookie managed by the backend. A `POST /api/auth/login` response would set the cookie, and the frontend would stop needing to store the token.

---

### ISSUE-06 — [Medium] `orders.create` — No Null Guard for `ver` (packageVersion)

**Conclusion:** Defensive coding gap — unhandled 500 on data inconsistency

**Evidence:**
- `services/orders.js:24–27`: `const ver = await repo.packageVersions.findOne({ packageId: pkg.id, version: pkg.currentVersion })`
- `services/orders.js:35`: `packageVersion: ver.version` — TypeError if `ver` is null
- `services/orders.js:40–44`: `composition: ver.composition, price: ver.price, ...` — all crash if `ver` is null

**Impact:** If a package record's `currentVersion` ever points to a non-existent PackageVersion document (possible via direct DB manipulation or a MongoDB adapter bug), `orders.create` throws an unhandled TypeError that produces a generic 500 response. The in-memory store is guarded by construction (version is always inserted alongside the package), but the MongoDB adapter operates on external data where such inconsistency could arise.

**Minimum Actionable Fix:**
```javascript
if (!ver) throw notFound('package version not found', 'VERSION_NOT_FOUND');
```
Add this check immediately after the `findOne` call at `services/orders.js:27`.

---

### ISSUE-07 — [Low] Frontend Client-Side Route Guard Is Only Nav-Based — Server Enforces Permissions

**Conclusion:** Acceptable — no security impact; minor UX gap

**Evidence:**
- `frontend/src/App.tsx:32–47`: Route rendering is purely string-based (`route === 'xxx'`)
- `frontend/src/components/Layout.tsx`: Nav items filtered by `session.nav`
- Backend enforces `requirePermission` on every route

**Impact:** A user who programmatically sets the `route` state (e.g., via browser devtools) to a page not in their `session.nav` will see that page component render. Any API calls from that page will be rejected 403 by the backend. Visual exposure of an empty or error-state page is the only risk. No data leakage.

**Minimum Actionable Fix:** Add a guard in `App.tsx`'s `Shell` component: `if (!session.nav.includes(route)) setRoute('dashboard')`. Alternatively wrap each page render with `hasNav(session, route) ? <Page/> : null`.

---

### ISSUE-08 — [Low] Exam Item Snapshot Not Captured at Order Time

**Conclusion:** Partial prompt fidelity gap — reference ranges/contraindications not frozen

**Evidence:**
- `services/orders.js:36–44`: Snapshot captures `composition` (array of `{ examItemId, required }`), `price`, `deposit`, `validityDays`, package `name`, `code`, `category`
- `services/examItems.js`: Items are mutable (PATCH endpoint exists)
- No frozen copy of exam item fields at order time

**Impact:** If a Clinic Manager edits an exam item's reference ranges, units, or contraindications after an order was placed, the historical order's composition will show current exam item data, not the data at time of sale. This contradicts the Prompt requirement "historical orders always display the correct item set at time of sale."

**Minimum Actionable Fix:** At order creation, capture the full exam item details for each composition member into the order snapshot, or reference the package version record (which is already immutable) and freeze item fields at version creation time.

---

### ISSUE-09 — [Low] `audit.record` Queue Error Is Silently Swallowed

**Conclusion:** Low — audit failures do not surface to the caller

**Evidence:**
- `services/audit.js:44–47`:
```javascript
async function record(entry) {
  const result = _auditQueue.then(() => _doRecord(entry));
  _auditQueue = result.catch(() => {});
  return result;
}
```

**Impact:** If `_doRecord` throws (e.g., repository write failure), the error is caught and discarded. Callers `await audit.record(...)` and if the promise rejects, the rejection propagates to the caller's try-catch. However, `_auditQueue = result.catch(() => {})` means the queue itself swallows the error and continues. In the in-memory store this is unlikely to fail; under MongoDB with a connection failure, audit entries can be silently dropped. The hash chain would then have gaps that `verifyChain` would detect, but no real-time alert fires.

**Minimum Actionable Fix:** Log the error in the catch handler rather than silently swallowing: `_auditQueue = result.catch((err) => logger.error('audit record failed', { err: err.message }))`.

---

## 6. Security Review Summary

### Authentication Entry Points

**Conclusion: Pass (with caveats per ISSUE-01)**

`POST /api/auth/login` (`routes/auth.js:35–56`) is rate-limited, bcrypt-hashed, runs constant-time comparison against a dummy hash for missing users (`services/users.js:209–211`), enforces lockout after 5 failures, and returns a generation-stamped JWT. The `POST /api/auth/wechat/exchange` stub is disabled and throws `WECHAT_DISABLED` by default. The production Docker default secrets bypass the code-level guards (ISSUE-01).

**Evidence:** `routes/auth.js:16–21` (rate limiter), `services/users.js:205–257` (authenticate), `config/index.js:54–64` (production guards), `docker-compose.yml:18–20` (bypass)

---

### Route-Level Authorization

**Conclusion: Pass**

Every route module (users, tenants, examItems, packages, orders, reconciliation, reports) begins with `router.use(authenticate, enforceTenantScope)`. Individual routes add `requirePermission` or `requireRole`. The only unauthenticated routes are `GET /health`, `POST /api/auth/login`, `GET /api/auth/password-policy`, and `GET /api/auth/wechat/enabled` — all appropriate.

**Evidence:** `routes/users.js:12`, `routes/orders.js:12`, `routes/reconciliation.js:10`, `routes/reports.js:11` (`router.use(authenticate, enforceTenantScope)`)

---

### Object-Level Authorization

**Conclusion: Pass**

Object-level checks are consistent: every service function that retrieves a resource by ID checks `tenantId` membership before operating. Examples:
- `services/orders.js:66–67`: `if (!order || order.tenantId !== tenantId) throw notFound(...)`
- `services/reconciliation.js:262`: `if (!kase || kase.tenantId !== tenantId) throw notFound(...)`
- `routes/users.js:107–109`: Cross-tenant user fetch returns 403

The `assertTenantScope` helper in `middleware/auth.js:68–75` provides a defense-in-depth second check at the service layer.

**Evidence:** `services/orders.js:66–67`, `services/reconciliation.js:262`, `routes/users.js:107–109`, `middleware/auth.js:68–75`

---

### Function-Level Authorization

**Conclusion: Pass**

The permission matrix in `services/roles.js:13–78` is explicit and role-based. `SYSTEM_ADMIN` gets wildcard `*`. Function-level sensitive operations — account merge approval (`requireRole(SYSTEM_ADMIN)` at `routes/users.js:52`), audit chain verify (`requireRole(SYSTEM_ADMIN)` at `routes/reports.js:39`), identity document review (`requireRole(SYSTEM_ADMIN)` at `routes/users.js:94`), tenant CRUD (`requireRole(SYSTEM_ADMIN)` at `routes/tenants.js`) — all carry the most restrictive guard.

**Evidence:** `routes/users.js:52`, `routes/reports.js:39`, `routes/users.js:94`, `services/roles.js:13–78`

---

### Tenant / User Data Isolation

**Conclusion: Pass**

Dual-layer isolation:
1. `enforceTenantScope` middleware sets `req.scopeTenantId` from the authenticated user's `tenantId`; non-admin users cannot override it.
2. Every service function accepts `tenantId` and checks it against retrieved records before acting.

Cross-tenant tests in `security.test.js:29–118` verify exam items, packages, orders, invoices, reconciliation cases, and audit logs are all isolated.

The `x-tenant-id` header override for `SYSTEM_ADMIN` is scoped to `req.user.role === ROLES.SYSTEM_ADMIN` at `middleware/auth.js:55–58`.

**Evidence:** `middleware/auth.js:53–63` (enforceTenantScope), `middleware/auth.js:68–75` (assertTenantScope), `security.test.js:44–118`

---

### Admin / Internal / Debug Endpoint Protection

**Conclusion: Pass**

No `/debug`, `/internal`, or diagnostic endpoints were found beyond `GET /health` (returns `{"status":"ok"}` with no sensitive data). The audit chain verification endpoint (`GET /api/reports/audit/verify`) is gated by `requireRole(ROLES.SYSTEM_ADMIN)`. The `__resetRateLimiters` method on the auth router is a router-object property for test-teardown only — it is not an HTTP endpoint.

**Evidence:** `routes/reports.js:38–43` (verify admin-only), `app.js:9` (health returns only status), `routes/auth.js:30–33` (__resetRateLimiters is a JS property, not a route)

---

## 7. Tests and Logging Review

### Unit Tests

**Conclusion: Pass**

Backend has dedicated unit-level tests in `tests/services.auth.test.js` (password policy, token lifecycle, authenticate, lockout, merge flow, wechat adapter), `tests/services.orders.test.js`, `tests/services.packages.test.js`, `tests/services.reconciliation.test.js`, `tests/services.tenants.test.js`, `tests/services.examItems.test.js`, `tests/services.search.test.js`, `tests/utils.test.js` (money, geo, similarity, CSV, timezone, encryption, logger). Frontend has `tests/auth.test.ts` (session persistence, hasPermission, corrupt storage), `tests/format.test.ts`.

**Evidence:** `tests/services.auth.test.js:1–265`, `tests/utils.test.js` (exists), `tests/services.reconciliation.test.js` (exists)

---

### API / Integration Tests

**Conclusion: Pass**

`tests/routes.test.js` uses Supertest against a real in-memory app instance. Covers the full order lifecycle (create → confirm → pay → fulfill → refund), reconciliation ingest + dispose (SPLIT/MERGE/WRITE_OFF), bulk update + undo, RBAC enforcement across roles, pagination metadata, and 404/401/403 error shapes.

`tests/security.test.js` specifically tests cross-tenant isolation across six resource types, admin-only endpoint protection, AES key rotation semantics, RBAC permission matrix, and audit chain integrity including tampering detection.

**Evidence:** `tests/routes.test.js:305–576`, `tests/security.test.js:29–306`

---

### Logging Categories / Observability

**Conclusion: Pass**

`utils/logger.js` emits structured `{ts} [LEVEL] message {json-meta}` lines with sensitive key redaction. Error handler logs 5xx with method/path/status/userId (`middleware/error.js:14–22`). Auth denials (401/403) are logged at warn level with path and userId. Logger is silenced in `NODE_ENV=test` via `CLINICOPS_LOG_SILENT`. No random `console.log` calls were observed in business logic.

**Evidence:** `utils/logger.js:55–60`, `middleware/error.js:14–32`, `utils/logger.js:62` (test silence)

---

### Sensitive-Data Leakage Risk in Logs / Responses

**Conclusion: Pass**

Logger redacts: `password`, `passwordhash`, `newpassword`, `token`, `authorization`, `jwt`, `secret`, `idnumber`, `idnumberencrypted`, `ssn`, `cardnumber`, `aeskey`, `privatekey` (`utils/logger.js:3–23`). API responses strip `passwordHash` via `users.sanitize()` (`services/users.js:12–16`). Identity records expose only `maskedIdNumber` (last 4 chars, prefix `****`) (`routes/users.js:84–85`). Encrypted fields are never returned raw. Audit log `details` does not capture raw passwords or IDs.

One note: `audit.record` in `services/users.js:70–77` logs `{ username, role }` — appropriate detail level, no sensitive data.

**Evidence:** `utils/logger.js:3–44`, `services/users.js:12–16`, `routes/users.js:82–89`, `utils/encryption.js:33–39` (maskSensitive)

---

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview

| Attribute | Backend | Frontend |
|---|---|---|
| Framework | Jest + Supertest | Vitest + React Testing Library |
| Test files | 12 files (excluding node_modules) | 4 files |
| Claimed coverage | ~99% lines/functions | ~94% lines |
| Test entry points | `backend/package.json` → `npm test` | `frontend/package.json` → `npm test` |
| Documentation of test commands | `README.md:80–96`, `run_tests.sh` | Same |

**Evidence:** `README.md:80–96`, `Glob(tests/**/test.*)` result, `backend/tests/` (12 files)

Cannot Confirm coverage percentages without executing `npm test -- --coverage`.

---

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Login happy path + JWT issuance | `routes.test.js:12–35` | `ok.body.token` defined, status 200 | Sufficient | — | — |
| Login 401 on wrong password | `routes.test.js:14–15` | `bad.status === 401` | Sufficient | — | — |
| Login rate limiting (429) | `routes.test.js:54–73` | `blocked.status === 429`, code `RATE_LIMITED` | Sufficient | — | — |
| Account lockout after 5 failures | `routes.test.js:75–90`, `services.auth.test.js:69–77` | `locked.status === 403`, code `LOCKED` | Sufficient | — | — |
| Username enumeration constant-time | `routes.test.js:92–103` | Same error code for unknown/wrong-pass | Basically Covered | Only response shape checked; actual timing not tested (acknowledged in comment) | Acceptable — wall-clock timing untestable statically |
| Blacklist/deactivate → 403 on subsequent requests | `routes.test.js:105–112`, `coverage.test.js:141–148` | `me.status === 403` | Sufficient | — | — |
| Token generation revocation on password change | `services.auth.test.js:38–49` | Old token isRevoked, new token valid | Sufficient | — | — |
| JWT for deleted user rejected | `coverage.test.js:72–79` | stale token → 401 | Sufficient | — | — |
| Tenant isolation: exam items | `security.test.js:44–51` | Cross-tenant list returns 0 items | Sufficient | — | — |
| Tenant isolation: packages | `security.test.js:53–63` | Cross-tenant GET → 404 | Sufficient | — | — |
| Tenant isolation: orders/invoices/recon | `security.test.js:65–106` | All return 404 | Sufficient | — | — |
| Audit log tenant scoping | `security.test.js:108–118` | Each tenant sees only own tenantId entries | Sufficient | — | — |
| Cross-tenant user mutation | `routes.test.js:167–187` | patch/blacklist/deactivate → 403 | Sufficient | — | — |
| Admin-only tenant list/create | `security.test.js:124–137` | All non-admin roles → 403 | Sufficient | — | — |
| Merge approve requires SYSTEM_ADMIN | `security.test.js:139–153`, `routes.test.js:189–206` | manager approve → 403, admin → 200 | Sufficient | — | — |
| Order state machine transitions | `routes.test.js:308–358` | Full lifecycle + invalid pay on PENDING → 409 | Sufficient | — | — |
| Invoice tax calculation | `routes.test.js:316–323` | `preview.body.total > 0` | Insufficient | No assertion on exact tax math (8.25%), discount boundary, or zero-tax path | Add test: computeInvoice with known inputs and assert exact subtotal/tax/total |
| Bulk update + undo | `routes.test.js:346–358` | undo returns 200 | Basically Covered | No test for undo-after-deadline (expired window) or financial field rejection | Add: bulkUpdate with `invoiceId` in patch → 403; undo after deadline → 409 |
| Reconciliation fingerprint dedup | `security.test.js:175–183` | Second ingest throws `DUPLICATE_FILE` | Sufficient | — | — |
| Reconciliation duplicate detection | `security.test.js:185–192` | summary.duplicates ≥ 2 | Sufficient | — | — |
| Reconciliation VARIANCE case | `routes.test.js:480–507` | varianceCases.length ≥ 1 | Sufficient | — | — |
| Reconciliation SPLIT validation | `routes.test.js:509–533` | bad → 400, ok → 200 with child cases | Sufficient | — | — |
| Reconciliation MERGE validation | `routes.test.js:535–558` | bad → 400, ok links mergedWithCaseId | Sufficient | — | — |
| Dispose idempotency | `security.test.js:193–203` | Second dispose → `ALREADY_DISPOSED` | Sufficient | — | — |
| AES encrypt/decrypt + key rotation | `security.test.js:207–246` | Wrong key throws; rotation produces fresh ct | Sufficient | — | — |
| Sensitive field encrypted at rest | `services.auth.test.js:126–138` | idNumberEncrypted matches `v1:` prefix | Sufficient | — | — |
| passwordHash stripped from API responses | `routes.test.js:145` | `items.every(u => !('passwordHash' in u))` | Sufficient | — | — |
| RBAC matrix | `security.test.js:249–281` | 19 permission assertions via test.each | Sufficient | — | — |
| Audit chain tamper detection | `security.test.js:286–306` | Mutate middle entry → chain.valid === false | Sufficient | — | — |
| **changePassword without current password** | Not tested | — | **Missing** | No test verifies that old password is NOT required (which would catch the security gap) | Add: authenticated user can changePassword with wrong old password — should fail (currently passes — this is the bug) |
| MongoDB adapter correctness | Not tested | — | Cannot Confirm | Mongoose adapter only inspected by code review; no integration tests | Add MongoDB integration test suite or test against a real MongoDB instance |
| Package version historical snapshot completeness | Not tested | — | Missing | No test verifies order snapshot captures exam item field values frozen at order time | Add: create order, edit exam item, fetch order, assert snapshot matches original item data |
| KPI accuracy | `routes.test.js:391–403` | `kpi.status === 200` | Insufficient | No numeric assertions on GMV, AOV, or repeat rate | Add: create known orders/invoices, compute KPI, assert exact values |

---

### 8.3 Security Coverage Audit

**Authentication:**  
Sufficient coverage. Lockout, rate limiting, constant-time enumeration defense, blacklist/deactivate blocking, and token revocation are all tested.

**Route Authorization:**  
Sufficient. Every major route has at least one test verifying that a lower-privileged role receives 403. The full non-admin role set is iterated for tenant create/list.

**Object-Level Authorization:**  
Sufficient. Cross-tenant GET, confirm, dispose, and invoice access all tested in `security.test.js:65–106`. Password hash stripped from all user responses is tested.

**Tenant / Data Isolation:**  
Sufficient. Five separate tenant-isolation test cases covering exam items, packages, orders, invoices, reconciliation, and audit logs.

**Admin / Internal Protection:**  
Sufficient. Merge approval, audit verify, and tenant creation are gated and tested.

**Gap — Password Change Security:**  
The absence of old-password verification (`routes/auth.js:80–88`) is not covered by any test. Severe defect (ISSUE-03) could remain undetected indefinitely.

**Gap — MongoDB Adapter:**  
No integration test exists for the Mongoose adapter. If the adapter has a bug in tenant scoping (e.g., missing `tenantId` filter in a query), it would not be caught by the existing in-memory test suite.

---

### 8.4 Final Coverage Judgment

**Partial Pass**

**Covered risks:** Core authentication flows (lockout, revocation, enumeration defense), all five RBAC role paths, dual-layer tenant isolation, object-level authorization on all six resource types, reconciliation idempotency (fingerprint, duplicate detection, dispose-once), AES key rotation semantics, tamper-evident audit chain integrity, and order state machine transitions.

**Uncovered risks that allow severe defects to remain undetected:**
1. No test for the missing old-password verification on `POST /api/auth/password` — the security gap (ISSUE-03) is live and untested.
2. No test for KPI numeric accuracy — a billing calculation error would not be caught.
3. No MongoDB adapter integration test — a tenantId scoping bug in the Mongoose adapter would pass the entire test suite.
4. No test for the order snapshot freezing exam item fields — the historical fidelity gap (ISSUE-08) is untested.
5. No test for bulk undo after the 10-minute deadline expiry.

---

## 9. Final Notes

The delivery is a genuine production-quality implementation of a complex domain. The architecture is layered cleanly, security controls are thoughtfully applied (dual-layer tenant isolation, generation-based JWT revocation, AES-256-GCM with versioned envelope format, dummy-hash username enumeration defense, SHA-256 hash-chain audit), and the test suite covers the highest-risk security properties. The two High issues are exclusively deployment-configuration problems — the application code itself is sound — but they are exploitable without any code modification in a default Docker deployment.

The most actionable fix sequence:
1. Fix ISSUE-01 (remove Docker JWT/AES fallback defaults or expand the production guard) — prevents secret bypass
2. Fix ISSUE-02 (add `MONGO_URI` to Docker Compose or add a no-persistence startup warning) — prevents data loss
3. Fix ISSUE-03 (require current password for password change) — closes account takeover vector
4. Add ISSUE-06 null guard for `ver` in `orders.create` — prevents a latent 500
5. Add tests for KPI accuracy, MongoDB adapter, and password change validation
