# Test Coverage & README Audit Report
**Project:** ClinicOps  
**Type:** Fullstack (declared — React 18 frontend + Express 5 backend)  
**Audit Date:** 2026-04-19  
**Mode:** Strict / Static Inspection Only

---

# PART 1: TEST COVERAGE AUDIT

---

## Backend Endpoint Inventory

All routes mounted at `/api/*` prefix in `backend/src/app.js`. Resolved full paths below.

| # | Method | Full Path | Route File |
|---|--------|-----------|------------|
| 1 | GET | `/health` | app.js |
| 2 | POST | `/api/auth/login` | routes/auth.js |
| 3 | GET | `/api/auth/password-policy` | routes/auth.js |
| 4 | GET | `/api/auth/me` | routes/auth.js |
| 5 | POST | `/api/auth/password` | routes/auth.js |
| 6 | GET | `/api/auth/wechat/enabled` | routes/auth.js |
| 7 | POST | `/api/auth/wechat/exchange` | routes/auth.js |
| 8 | GET | `/api/tenants` | routes/tenants.js |
| 9 | POST | `/api/tenants` | routes/tenants.js |
| 10 | GET | `/api/tenants/:id` | routes/tenants.js |
| 11 | PATCH | `/api/tenants/:id` | routes/tenants.js |
| 12 | GET | `/api/users` | routes/users.js |
| 13 | POST | `/api/users` | routes/users.js |
| 14 | POST | `/api/users/merge/request` | routes/users.js |
| 15 | POST | `/api/users/merge/:id/approve` | routes/users.js |
| 16 | POST | `/api/users/merge/:id/reject` | routes/users.js |
| 17 | POST | `/api/users/identity/submit` | routes/users.js |
| 18 | GET | `/api/users/identity/list` | routes/users.js |
| 19 | POST | `/api/users/identity/:id/review` | routes/users.js |
| 20 | GET | `/api/users/:id` | routes/users.js |
| 21 | PATCH | `/api/users/:id` | routes/users.js |
| 22 | POST | `/api/users/:id/blacklist` | routes/users.js |
| 23 | POST | `/api/users/:id/risky` | routes/users.js |
| 24 | POST | `/api/users/:id/deactivate` | routes/users.js |
| 25 | POST | `/api/users/:id/reactivate` | routes/users.js |
| 26 | GET | `/api/exam-items` | routes/examItems.js |
| 27 | POST | `/api/exam-items` | routes/examItems.js |
| 28 | GET | `/api/exam-items/:id` | routes/examItems.js |
| 29 | PATCH | `/api/exam-items/:id` | routes/examItems.js |
| 30 | GET | `/api/packages` | routes/packages.js |
| 31 | POST | `/api/packages` | routes/packages.js |
| 32 | POST | `/api/packages/search` | routes/packages.js |
| 33 | GET | `/api/packages/search/history` | routes/packages.js |
| 34 | GET | `/api/packages/favorites` | routes/packages.js |
| 35 | POST | `/api/packages/favorites/:id` | routes/packages.js |
| 36 | DELETE | `/api/packages/favorites/:id` | routes/packages.js |
| 37 | POST | `/api/packages/recommendations` | routes/packages.js |
| 38 | GET | `/api/packages/pricing/list` | routes/packages.js |
| 39 | POST | `/api/packages/pricing` | routes/packages.js |
| 40 | GET | `/api/packages/:id` | routes/packages.js |
| 41 | POST | `/api/packages/:id/versions` | routes/packages.js |
| 42 | GET | `/api/packages/:id/versions/:version` | routes/packages.js |
| 43 | POST | `/api/packages/:id/active` | routes/packages.js |
| 44 | GET | `/api/orders` | routes/orders.js |
| 45 | POST | `/api/orders` | routes/orders.js |
| 46 | GET | `/api/orders/export.csv` | routes/orders.js |
| 47 | POST | `/api/orders/billing/preview` | routes/orders.js |
| 48 | POST | `/api/orders/bulk` | routes/orders.js |
| 49 | GET | `/api/orders/bulk/list` | routes/orders.js |
| 50 | POST | `/api/orders/bulk/:id/undo` | routes/orders.js |
| 51 | GET | `/api/orders/invoices/list` | routes/orders.js |
| 52 | GET | `/api/orders/invoices/export.csv` | routes/orders.js |
| 53 | GET | `/api/orders/invoices/:id` | routes/orders.js |
| 54 | POST | `/api/orders/invoices/:id/refund` | routes/orders.js |
| 55 | GET | `/api/orders/:id` | routes/orders.js |
| 56 | POST | `/api/orders/:id/confirm` | routes/orders.js |
| 57 | POST | `/api/orders/:id/pay` | routes/orders.js |
| 58 | POST | `/api/orders/:id/fulfill` | routes/orders.js |
| 59 | POST | `/api/orders/:id/cancel` | routes/orders.js |
| 60 | POST | `/api/reconciliation/ingest` | routes/reconciliation.js |
| 61 | GET | `/api/reconciliation/files` | routes/reconciliation.js |
| 62 | GET | `/api/reconciliation/cases` | routes/reconciliation.js |
| 63 | POST | `/api/reconciliation/cases/:id/dispose` | routes/reconciliation.js |
| 64 | GET | `/api/reconciliation/cases/export.csv` | routes/reconciliation.js |
| 65 | GET | `/api/reports/kpi` | routes/reports.js |
| 66 | GET | `/api/reports/audit` | routes/reports.js |
| 67 | GET | `/api/reports/audit/verify` | routes/reports.js |
| 68 | GET | `/api/reports/audit/anomalies` | routes/reports.js |

**Total: 68 endpoints**

---

## API Test Mapping Table

Classification baseline: `helpers.js:freshApp()` calls `createApp()` (the real Express app, `app.js:17`). `helpers.js:68` re-exports `supertest.request`. Database: real in-memory adapter reset via `db.reset()`. No controller, service, or transport mocking. All routes.test.js tests are **True No-Mock HTTP**.

| # | Endpoint | Covered | Test Type | Test File | Evidence |
|---|----------|---------|-----------|-----------|---------|
| 1 | GET /health | Yes | True No-Mock HTTP | routes.test.js | `'health and 404'` → `request(app).get('/health')`, `expect(h.body.status).toBe('ok')` |
| 2 | POST /api/auth/login | Yes | True No-Mock HTTP | routes.test.js | `'login, me, password, wechat'` → 401 wrong creds, 200 success; body: token, nav, permissions |
| 3 | GET /api/auth/password-policy | Yes | True No-Mock HTTP | routes.test.js | `'password policy endpoint'` → 200, minLength≥12, all flags true |
| 4 | GET /api/auth/me | Yes | True No-Mock HTTP | routes.test.js | `'login, me, password, wechat'` → 200 with auth, 401 no auth, 401 bad token |
| 5 | POST /api/auth/password | Yes | True No-Mock HTTP | routes.test.js | `'login...'` → 200; `'password change requires current'` → 401; `'admin can reset'` → service call then login |
| 6 | GET /api/auth/wechat/enabled | Yes | True No-Mock HTTP | routes.test.js | `'login...'` → 200, `enabled=false` |
| 7 | POST /api/auth/wechat/exchange | **Partial** | True No-Mock HTTP | routes.test.js | `'login...'` → 403 only (WeChat disabled). Success path (enabled=true) NOT tested. |
| 8 | GET /api/tenants | Yes | True No-Mock HTTP | routes.test.js | `'list requires admin'` → 403 non-admin, 200 admin |
| 9 | POST /api/tenants | Yes | True No-Mock HTTP | routes.test.js | `'list requires admin'` → 201 created, 400 empty input |
| 10 | GET /api/tenants/:id | Yes | True No-Mock HTTP | routes.test.js | `'list requires admin'` → 200 own tenant, 403 other tenant |
| 11 | PATCH /api/tenants/:id | Yes | True No-Mock HTTP | routes.test.js | `'list requires admin'` → 200 own tenant, 403 other tenant |
| 12 | GET /api/users | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200, asserts no passwordHash in items |
| 13 | POST /api/users | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 201 created |
| 14 | POST /api/users/merge/request | Yes | True No-Mock HTTP | routes.test.js | `'merge request → approve/reject'` → 201 |
| 15 | POST /api/users/merge/:id/approve | Yes | True No-Mock HTTP | routes.test.js | `'merge request...'` → 403 non-admin, 200 admin |
| 16 | POST /api/users/merge/:id/reject | Yes | True No-Mock HTTP | routes.test.js | `'merge request...'` → 200 |
| 17 | POST /api/users/identity/submit | Yes | True No-Mock HTTP | routes.test.js | `'identity submit + review'` → 201 |
| 18 | GET /api/users/identity/list | Yes | True No-Mock HTTP | routes.test.js | `'identity submit + review'` → 200 |
| 19 | POST /api/users/identity/:id/review | Yes | True No-Mock HTTP | routes.test.js | `'identity submit + review'` → 200, decision=APPROVED |
| 20 | GET /api/users/:id | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200 own tenant, 403 admin in other tenant |
| 21 | PATCH /api/users/:id | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200; `'CLINIC_MANAGER cannot mutate...'` → 403 |
| 22 | POST /api/users/:id/blacklist | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200; `'CLINIC_MANAGER cannot mutate...'` → 403 |
| 23 | POST /api/users/:id/risky | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200; `'CLINIC_MANAGER cannot mutate...'` → 403 |
| 24 | POST /api/users/:id/deactivate | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200; `'CLINIC_MANAGER cannot mutate...'` → 403 |
| 25 | POST /api/users/:id/reactivate | Yes | True No-Mock HTTP | routes.test.js | `'list/create/...'` → 200; `'CLINIC_MANAGER cannot mutate...'` → 403 |
| 26 | GET /api/exam-items | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 27 | POST /api/exam-items | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 201; 403 for FRONT_DESK |
| 28 | GET /api/exam-items/:id | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 29 | PATCH /api/exam-items/:id | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 30 | GET /api/packages | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 31 | POST /api/packages | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 201 |
| 32 | POST /api/packages/search | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → items.length=1; `'search pageSize clamped'` → pageSize≤200 |
| 33 | GET /api/packages/search/history | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → items.length=1 |
| 34 | GET /api/packages/favorites | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → items.length=1 |
| 35 | POST /api/packages/favorites/:id | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → 200 |
| 36 | DELETE /api/packages/favorites/:id | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → ok=true |
| 37 | POST /api/packages/recommendations | Yes | True No-Mock HTTP | routes.test.js | `'search, favorites...'` → 200 |
| 38 | GET /api/packages/pricing/list | Yes | True No-Mock HTTP | routes.test.js | `'pricing strategies routes'` → items.length=1 |
| 39 | POST /api/packages/pricing | Yes | True No-Mock HTTP | routes.test.js | `'pricing strategies routes'` → 201 |
| 40 | GET /api/packages/:id | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 41 | POST /api/packages/:id/versions | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 201 |
| 42 | GET /api/packages/:id/versions/:version | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → 200 |
| 43 | POST /api/packages/:id/active | Yes | True No-Mock HTTP | routes.test.js | `'CRUD and versioning'` → active=false |
| 44 | GET /api/orders | Yes | True No-Mock HTTP | routes.test.js | `'billing preview → order lifecycle...'` → 200; pagination test → page/pageSize/total |
| 45 | POST /api/orders | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 201 |
| 46 | GET /api/orders/export.csv | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200, text contains 'id,patientId' |
| 47 | POST /api/orders/billing/preview | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → total>0 |
| 48 | POST /api/orders/bulk | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 201 |
| 49 | GET /api/orders/bulk/list | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → items.length≥1 |
| 50 | POST /api/orders/bulk/:id/undo | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 51 | GET /api/orders/invoices/list | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 52 | GET /api/orders/invoices/export.csv | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 (status only, no content check) |
| 53 | GET /api/orders/invoices/:id | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 54 | POST /api/orders/invoices/:id/refund | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200; `'auditor cannot refund'` → 403 |
| 55 | GET /api/orders/:id | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 56 | POST /api/orders/:id/confirm | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 57 | POST /api/orders/:id/pay | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200; `'markPaid rejects PENDING'` → 409 BAD_STATUS |
| 58 | POST /api/orders/:id/fulfill | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 59 | POST /api/orders/:id/cancel | Yes | True No-Mock HTTP | routes.test.js | `'billing preview...'` → 200 |
| 60 | POST /api/reconciliation/ingest | Yes | True No-Mock HTTP | routes.test.js | `'reconciliation ingest + dispose'` → 201; duplicate test → 201 |
| 61 | GET /api/reconciliation/files | Yes | True No-Mock HTTP | routes.test.js | `'reconciliation ingest + dispose'` → items.length=1 |
| 62 | GET /api/reconciliation/cases | Yes | True No-Mock HTTP | routes.test.js | `'reconciliation ingest + dispose'` → items>0; duplicate test → 3 cases, 1 SUSPECTED_DUPLICATE |
| 63 | POST /api/reconciliation/cases/:id/dispose | **Partial** | True No-Mock HTTP | routes.test.js | WRITE_OFF: conditional `if (unmatched)` block. SPLIT: explicit 400+200. MERGE: explicit 400+200. |
| 64 | GET /api/reconciliation/cases/export.csv | Yes | True No-Mock HTTP | routes.test.js | `'reconciliation ingest + dispose'` → 200 (status only, no content check) |
| 65 | GET /api/reports/kpi | Yes | True No-Mock HTTP | routes.test.js | `'reports: kpi, audit, verify, anomalies'` → 200 |
| 66 | GET /api/reports/audit | Yes | True No-Mock HTTP | routes.test.js | `'reports: kpi...'` → 200 |
| 67 | GET /api/reports/audit/verify | Yes | True No-Mock HTTP | routes.test.js | `'reports: kpi...'` → 403 auditor, 200 admin, valid=true |
| 68 | GET /api/reports/audit/anomalies | Yes | True No-Mock HTTP | routes.test.js | `'reports: kpi...'` → 200 |

---

## API Test Classification

### True No-Mock HTTP Tests
**File:** `backend/tests/routes.test.js`  
**Evidence:**
- `helpers.js:55-57` — `freshApp()` calls `createApp()` (real Express app, real middleware stack)
- `helpers.js:3` — `supertest` used; HTTP layer not bypassed
- `helpers.js:5-9` — Real services imported only for data seeding, not stubbed
- `helpers.js:12-14` — `db.reset()` resets real in-memory adapter; no mock storage
- No `jest.mock`, `vi.mock`, `sinon.stub`, or DI overrides found in routes.test.js

All 68 endpoints tested through the real HTTP layer with real service execution.

**Note:** In two tests (`'blocked users cannot use token'` and `'admin can reset another user password'`), services are called directly to set up state (not to test the service itself). The assertions are on subsequent HTTP responses. This does not constitute mocking.

### HTTP with Mocking
None in backend tests.

### Non-HTTP (Unit / Integration without HTTP)
**Files:**
- `services.auth.test.js`
- `services.orders.test.js`
- `services.packages.test.js`
- `services.reconciliation.test.js`
- `services.search.test.js`
- `services.tenants.test.js`
- `services.examItems.test.js`
- `security.test.js`
- `db.test.js`
- `repositories.mongo.test.js`
- `utils.test.js`
- `logger.test.js`
- `coverage.test.js`

---

## Mock Detection

**Backend (`routes.test.js`):** No mocking found.
- No `jest.mock` calls
- No `sinon.stub` / `sinon.spy`
- No DI overrides
- No module replacement
- Service calls in setup helpers use real implementations against real in-memory DB

**Frontend tests:** `buildMockFetch` replaces the `fetch` global with a custom handler.  
- `App.test.tsx:131` — `buildMockFetch(routes)` used in every test; fetch is fully replaced
- `pages.test.tsx:53` — Same pattern per test
- `api.test.ts:8` — `buildMockFetch({...})` used to test `ApiClient`

**What is mocked:** The transport layer (HTTP fetch). Controllers and services are NOT mocked — they do not exist on the frontend.  
**Classification:** Frontend tests are HTTP-with-mocking of the transport layer. This is appropriate for frontend component testing and does not indicate deficiency in the frontend tests themselves.

---

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total endpoints | 68 |
| Endpoints with HTTP tests | 68 |
| Endpoints with True No-Mock HTTP tests | 68 |
| Fully covered (all paths) | 66 |
| Partial coverage (one path only) | 2 |
| HTTP Coverage | **100%** |
| True No-Mock API Coverage | **100%** (with 2 partial-path caveats) |

**Partial coverage caveats:**
1. `POST /api/auth/wechat/exchange` — only 403 (disabled) path tested; success path requires WeChat config not present in test environment
2. `POST /api/reconciliation/cases/:id/dispose` (WRITE_OFF) — tested conditionally inside `if (unmatched)` block (`routes.test.js:407`); SPLIT and MERGE dispositions are explicitly tested unconditionally

---

## Unit Test Analysis

### Backend Unit Tests

**Files and coverage:**

| File | Modules Covered |
|------|----------------|
| `services.auth.test.js` | Password policy validation, token signing/verification/revocation, user authentication |
| `services.orders.test.js` | Order creation, confirmation, payment, fulfillment, cancellation, bulk operations |
| `services.packages.test.js` | Package CRUD, versioning, active status toggle |
| `services.reconciliation.test.js` | File ingestion, case matching, reconciliation logic |
| `services.search.test.js` | Search query processing, recommendation engine, favorites |
| `services.tenants.test.js` | Tenant creation, retrieval, updates |
| `services.examItems.test.js` | Exam item CRUD |
| `security.test.js` | Tenant isolation, permission enforcement, encryption, audit chain integrity |
| `db.test.js` | In-memory adapter |
| `repositories.mongo.test.js` | MongoDB adapter |
| `utils.test.js` | Money, encryption, CSV, geo, similarity, timezone utilities |
| `logger.test.js` | Logging |

**Backend service modules WITHOUT dedicated unit tests:**
- `services/billing.js` — tested only through `POST /api/orders/billing/preview`
- `services/invoices.js` — tested only through order lifecycle route tests
- `services/kpi.js` — tested only through `GET /api/reports/kpi`
- `services/audit.js` — tested only through report routes
- `services/exports.js` — tested only through CSV export routes (status-only assertions)
- `services/pricing.js` — tested only through `POST /api/packages/pricing`
- `services/recommendations.js` — tested only through `POST /api/packages/recommendations`
- `services/identity.js` — tested only through user identity routes
- `services/wechatAdapter.js` — tested only through auth routes (disabled path)

These are all exercised through the True No-Mock HTTP tests, but lack isolated unit tests that would verify behavior at edge inputs without requiring full HTTP orchestration.

---

### Frontend Unit Tests

**Strict detection result:**

| Criterion | Result |
|-----------|--------|
| Frontend test files exist (`*.test.*`) | PASS — 5 files found |
| Tests target frontend logic/components | PASS — components rendered via RTL |
| Test framework evident | PASS — Vitest + React Testing Library (`@testing-library/react`) |
| Tests import or render actual frontend components/modules | PASS — App, 7+ page components, Layout, Pagination, Input, AuthProvider all rendered |

**Frontend unit tests: PRESENT**

**Frontend test files:**

| File | Framework | What Is Tested |
|------|-----------|----------------|
| `tests/auth.test.ts` | Vitest | Auth store: saveSession, loadSession, clearSession, currentToken, hasPermission, hasNav |
| `tests/api.test.ts` | Vitest | ApiClient: GET/POST/PATCH/DELETE, error parsing, ApiError shape, getText, all endpoint wrappers (makeEndpoints) |
| `tests/format.test.ts` | Vitest | formatMoney, formatDate, formatPct, validateEmail, validatePasswordPolicy, paginate, maskSsn |
| `tests/App.test.tsx` | Vitest + RTL | Full App: login flow, logout, navigation (examItems, packages, users, audit, reconciliation, favorites, search, orders), search UX, pagination, form interactions |
| `tests/pages.test.tsx` | Vitest + RTL | OrdersPage (lifecycle+refund+errors), ReconciliationPage (6 tests: ingest error, filter, dispose dialog cancel, SPLIT/MERGE dialog UI, SPLIT submit), UsersPage (create+blacklist+validation), FavoritesPage (render+remove), PackagesPage (toggle required+save, negative price), AuditPage (BROKEN chain), DashboardPage (KPI error), Layout (menu toggle, no-session), Pagination (boundaries), Input (error+aria) |

**Frontend components/modules covered:**
- `App` ✓
- `AuthProvider` / `useAuth` ✓
- `DashboardPage` ✓
- `OrdersPage` ✓
- `ReconciliationPage` ✓ (most thoroughly tested)
- `UsersPage` ✓
- `FavoritesPage` ✓
- `PackagesPage` ✓
- `AuditPage` ✓
- `Layout` ✓
- `Pagination` ✓
- `Input` ✓
- Auth store (`store/auth.ts`) ✓
- API client (`api/client.ts`, `api/endpoints.ts`) ✓
- Utilities (`utils/format.ts`) ✓

**Frontend components/modules NOT tested:**
- `SearchPage` — exercised through App.test.tsx navigation (nav click + recommendations appear) but not in a dedicated unit test in pages.test.tsx
- `ExamItemsPage` — exercised via App.test.tsx navigation + form, but not in pages.test.tsx
- `BillingPage` — no test
- `TenantsPage` — no test
- `IdentityPage` — no test
- `ReportsPage` — no test (kpi data is tested through DashboardPage, audit through AuditPage)
- `SettingsPage` — no test

---

### Cross-Layer Observation

Backend and frontend testing are reasonably balanced:
- Backend: True No-Mock HTTP (100% endpoint coverage) + unit tests for core services
- Frontend: RTL component tests for majority of pages + utility layers

**Imbalance flag:** 7 of approximately 17 frontend pages have no dedicated unit tests (SettingsPage, TenantsPage, BillingPage, IdentityPage, ReportsPage, SearchPage standalone, ExamItemsPage standalone). The pages exercised in App.test.tsx provide integration-level coverage but not isolated unit coverage. This is a gap, not a critical failure, given the App.test.tsx integration tests cover many of these paths.

---

## API Observability Check

| Test | Observability | Notes |
|------|--------------|-------|
| Auth login | Strong | Status, token, nav, permissions asserted |
| Auth me | Strong | Status, role field asserted |
| Auth password | Strong | Status + error codes (CURRENT_PASSWORD_REQUIRED, INVALID_CREDENTIALS) |
| Auth wechat/exchange | Weak | 403 status only; no body content beyond error code |
| Tenants CRUD | Moderate | Status + scoping behavior; body content lightly asserted |
| Users CRUD | Strong | Status, body fields (no passwordHash), error codes, cross-tenant 403 |
| Orders lifecycle | Strong | Status, invoice body, pagination metadata (page/pageSize/total) |
| Orders export.csv | Weak | GET /export.csv — status 200, text includes 'id,patientId' — no column count or content depth |
| Invoices export.csv | Weak | Status 200 only — no content assertion |
| Reconciliation cases/export.csv | Weak | Status 200 only — no content assertion |
| Reconciliation ingest | Strong | Status 201; case counts, status types asserted |
| Reconciliation dispose | Strong | SPLIT: invoiceIds sent and disposition verified; MERGE: mergedWithCaseId verified; WRITE_OFF: conditional |
| Reports | Strong | Audit: valid=true asserted; anomalies: 200; KPI: 200 |

**Weak observability flagged for:** 3 CSV export endpoints (`GET /api/orders/export.csv` partially; `GET /api/orders/invoices/export.csv`; `GET /api/reconciliation/cases/export.csv`). Response structure and row correctness are not verified.

---

## Test Quality & Sufficiency

| Dimension | Assessment |
|-----------|-----------|
| Success paths | Thoroughly covered across all domains |
| Failure cases | Strong — 401, 403, 404, 409, 429, 400 all exercised with specific error codes |
| Edge cases | Strong — rate limiting (3-attempt limit), account lockout, constant-time auth, duplicate deduplication, VARIANCE case, pageSize clamping, pagination metadata, SPLIT/MERGE dispose validation |
| Auth/permissions | Excellent — role-based access, tenant isolation, blacklist enforcement, cross-tenant prevention, permission-level checks (user:blacklist, invoice:refund, etc.) |
| Validation | Strong — input validation (empty fields, weak password), status precondition (PENDING cannot be paid), disposition validation (SPLIT requires invoiceIds) |
| Real assertions | Most tests assert specific fields, status codes, and error codes. Not superficial. |
| Weak areas | 3 CSV export endpoints: status-only assertions. WeChat exchange: error path only. WRITE_OFF dispose: conditional execution. |

### `run_tests.sh` Check

```bash
"${DC[@]}" run --rm --no-deps --entrypoint "" backend npm test   # line 60
"${DC[@]}" run --rm --no-deps --entrypoint "" frontend npm test  # line 70
```

**Assessment: OK** — Tests run inside Docker containers via Docker Compose. No local `npm install` or local dependency required. Images are built first (unless `--no-build` passed). Exit code propagated correctly.

---

## End-to-End Expectations

**Project type:** Fullstack — E2E tests (real FE ↔ real BE) are expected.

**E2E tests present:** NO — no Playwright, Cypress, or equivalent found.

**Compensation:** The backend has 100% True No-Mock API coverage (real Express, real services, real in-memory DB), and the frontend has RTL component tests with mock fetch. These partially compensate:
- API contract correctness is verified on the backend side
- Frontend → API boundary is exercised (frontend calls the same endpoints verified in backend tests, using matching request shapes)

**Gap:** No test verifies the full stack simultaneously (FE rendering triggers real BE, which writes to DB, returns real data, FE renders it).

---

## Test Output Summary

### Coverage Summary

| Metric | Value |
|--------|-------|
| Total backend endpoints | 68 |
| HTTP-covered endpoints | 68 (100%) |
| True No-Mock HTTP-covered | 68 (100%) |
| Partially covered (one path only) | 2 |
| Frontend test files | 5 |
| Frontend pages/components with tests | ~10 of 17 pages |
| Frontend pages without any tests | ~7 |
| E2E tests | 0 |

### Tests Check

| Check | Result |
|-------|--------|
| Backend HTTP tests use real Express app | PASS |
| No service/controller mocking in backend tests | PASS |
| run_tests.sh uses Docker (not local deps) | PASS |
| Frontend tests render real React components | PASS |
| Frontend tests use approved mock (fetch only) | PASS |
| E2E coverage | FAIL — absent |
| All backend pages have frontend unit tests | FAIL — 7 pages untested |
| CSV export content assertions | FAIL — status-only for 2 of 3 |

---

### Test Coverage Score: **80 / 100**

### Score Rationale

**Strengths (+):**
- 100% backend endpoint HTTP coverage, all True No-Mock (real Express + real services + real in-memory DB): the gold standard for backend API testing
- Excellent auth, permission, and tenant isolation testing with specific error codes and cross-tenant enforcement
- Strong edge case coverage: rate limiting, lockout, constant-time auth, duplicate deduplication, VARIANCE reconciliation, pageSize clamping, status preconditions, SPLIT/MERGE validation
- Solid frontend component testing: 10+ components/pages rendered via RTL, interactive flows tested (login, navigation, form validation, API calls verified)
- `run_tests.sh` correctly uses Docker — no local dependency requirement

**Deductions (-):**
- No E2E tests: -5
- 7 frontend pages without any test coverage (BillingPage, TenantsPage, IdentityPage, ReportsPage, SettingsPage, SearchPage and ExamItemsPage standalone): -5
- 2 CSV export endpoints tested with status-code-only assertions (no content/schema check): -3
- WeChat exchange success path not tested (only disabled/403): -2
- WRITE_OFF dispose tested conditionally (inside `if (unmatched)`, may not execute): -2
- 9 backend service modules lack dedicated unit tests (billing, invoices, kpi, audit, exports, pricing, recommendations, identity, wechatAdapter): -3

---

### Key Gaps

1. **No E2E tests** — No full-stack integration test verifies FE UI → real BE → DB → real response
2. **7 frontend pages untested** — BillingPage, TenantsPage, IdentityPage, ReportsPage, SettingsPage lack both unit and integration tests
3. **CSV export assertions are status-only** — `GET /api/orders/invoices/export.csv` and `GET /api/reconciliation/cases/export.csv` assert 200 but not export content, columns, or row counts
4. **WeChat exchange success path untested** — `POST /api/auth/wechat/exchange` only exercises the disabled-feature 403 branch
5. **WRITE_OFF dispose path conditionally executed** — `routes.test.js:407` wraps the WRITE_OFF dispose call in `if (unmatched)` which may be skipped if no unmatched case exists after the test sequence
6. **9 backend services without dedicated unit tests** — rely entirely on route-level coverage; isolated failure modes and edge inputs for these services are not tested at the unit level

---

### Confidence & Assumptions

- **Confidence: High** — all evidence is directly from source files. No runtime inference.
- **Assumption:** `freshApp()` produces a fully functional Express app with all middleware and routes — confirmed by reading `helpers.js:55-57` and `app.js:17-37`.
- **Assumption:** In-memory DB (`db.js`) is not a mock but the actual configured data layer — the app is designed to run with it in production if no `MONGO_URI` is set. Confirmed by `README.md:122`.
- **Not verified at runtime:** Actual test pass/fail status, coverage percentages, test count — only static code was inspected.

---

---

# PART 2: README AUDIT

---

## README Location

`repo/README.md` — EXISTS ✓

---

## Hard Gate Evaluation

### 1. Formatting

| Check | Result |
|-------|--------|
| Clean markdown | PASS |
| Readable structure | PASS |
| Headers, tables, code blocks used correctly | PASS |

---

### 2. Startup Instructions

**Required for fullstack:** `docker-compose up` (or equivalent)

```bash
# README.md:62
docker-compose up --build -d
```

Also present via convenience wrapper:
```bash
./start.sh          # foreground
./start.sh -d       # detached
./start.sh --rebuild
```

**Result: PASS** — Docker Compose startup present and clear.

---

### 3. Access Method

| Access Point | Present | Value |
|-------------|---------|-------|
| Frontend URL + port | PASS | `http://localhost:5173` |
| Backend API URL + port | PASS | `http://localhost:4000/api` |
| Health check URL | PASS | `http://localhost:4000/health` |

**Result: PASS**

---

### 4. Verification Method

**Requirement:** Must explain how to confirm the system works (curl/Postman for API; UI flow for web).

**Finding:** The README lists access URLs but provides no explicit verification instruction. There is no:
- `curl http://localhost:4000/health` example with expected output
- No "open `http://localhost:5173` and log in with the seeded credentials" instruction
- No expected response shown

The health check URL is mentioned in the "Access the app" section (`README.md:69`), but only as a URL — not as a verification step with expected output.

**Result: FAIL** — Verification method is absent. URLs are present but there is no instruction to the evaluator on how to confirm the system is functioning, and no expected output is described.

---

### 5. Environment Rules (STRICT)

**Rule:** No `npm install`, `pip install`, `apt-get`, manual runtime installs, or manual DB setup. Everything must be Docker-contained.

**Finding:**

```
# README.md:89-95
For local development without Docker:

# Backend
cd backend && npm install && npm test

# Frontend
cd frontend && npm install && npm test
```

`npm install` appears in the README under a "For local development without Docker" label.

**Assessment:** The strict rule does not permit `npm install` regardless of label or context. The presence of these commands exposes a non-Docker dependency installation path in the official project documentation.

**Result: FAIL** — `npm install` present in README. Primary startup is Docker-correct, but secondary path violates the strict rule.

---

### 6. Demo Credentials (Conditional)

**Auth exists:** Yes (JWT-based, bcrypt passwords)

| Role | Username | Password | Scope | Present |
|------|----------|----------|-------|---------|
| System Administrator | `admin` | `Admin!ClinicOps1` | Global | ✓ |
| Clinic Manager | `manager` | `Manager!ClinicOps1` | Demo Clinic | ✓ |
| Front Desk | `frontdesk` | `FrontDesk!Clinic1` | Demo Clinic | ✓ |
| Finance Specialist | `finance` | `Finance!ClinicOps1` | Demo Clinic | ✓ |
| Read-Only Auditor | `auditor` | `Auditor!ClinicOps1` | Demo Clinic | ✓ |

All 5 roles provided with username, password, and scope. Note also appended: "Change all passwords after first login."

**Result: PASS** — All roles present with complete credentials.

---

## Engineering Quality

| Dimension | Assessment |
|-----------|-----------|
| Tech stack clarity | Strong — React 18, TypeScript, Vite, Express 5, Node 20, Docker all named with versions |
| Architecture explanation | Good — in-memory repo with Mongoose drop-in adapter explained; MONGO_URI opt-in described |
| Testing instructions | Good — `run_tests.sh` documented with all flags; Docker-based confirmed |
| Security/roles | Strong — Security Notes section describes bcrypt, JWT expiry, AES-256-GCM, SHA-256 audit chain, tenant isolation, rate limiter |
| Workflows | Good — start, stop, rebuild, test all covered |
| Presentation quality | Good — well-organized, tables used for credentials and env vars |

**Missing / weak:**
- No WeChat OAuth enabling documentation — `GET /api/auth/wechat/enabled` exists and `POST /api/auth/wechat/exchange` exists, but the README has no mention of how to enable WeChat or what env var(s) control it
- `CORS_ORIGIN` is used in `app.js:21` but not listed in the Environment Variables table
- Verification method absent (covered above)
- No mention of what "offline-first" means operationally or what data is lost on restart without `MONGO_URI`

---

## README Output Sections

### High Priority Issues

1. **FAIL — Verification method absent** (`README.md` — access section)  
   The README lists URLs but does not tell the evaluator how to confirm the system is operational. A `curl http://localhost:4000/health` example with expected output (`{"status":"ok"}`) and a login instruction using seeded credentials would satisfy this requirement.

2. **FAIL — `npm install` present in README** (`README.md:91-95`)  
   A non-Docker dependency installation path appears in the README. Under strict rules, all setup must be Docker-contained. The commands should either be removed or moved to a separate CONTRIBUTING.md file not part of the primary README.

### Medium Priority Issues

3. **WeChat OAuth configuration undocumented**  
   The API exposes `GET /api/auth/wechat/enabled` and `POST /api/auth/wechat/exchange` but the README contains zero information on how to enable WeChat authentication. No env var for WeChat credentials appears in the Environment Variables table. A reviewer cannot know whether this feature is intended to be testable.

4. **`CORS_ORIGIN` missing from Environment Variables table** (`app.js:21`)  
   `process.env.CORS_ORIGIN` is read in `app.js` but not documented. In production with a custom domain, this would need to be set.

5. **No explicit curl/UI verification example**  
   A first-time evaluator reading the README has no guided "proof of life" step. Even a single `curl` example targeting `/health` with expected output would address this.

### Low Priority Issues

6. **`./start.sh --rebuild` does not clarify `--no-cache`**  
   The README says "force image rebuild" but does not specify that this uses `--no-cache`, which is the material difference from a normal rebuild.

7. **`MONGO_URI` warning could be clearer**  
   The table note ("all data is lost on restart if unset in production") is important but buried in a table cell. A standalone warning block would make it more visible to evaluators who skim.

---

### Hard Gate Failures

| Gate | Result | Evidence |
|------|--------|---------|
| Formatting | PASS | Clean markdown, readable structure |
| Startup with `docker-compose up` | PASS | `README.md:62` |
| Access URL + port | PASS | `README.md:66-69` |
| Verification method (curl/UI flow) | **FAIL** | No curl example, no expected output, no UI flow instruction |
| No `npm install` / `pip install` in README | **FAIL** | `README.md:91,94` — `npm install` present |
| Demo credentials (all roles) | PASS | `README.md:103-109` — all 5 roles |

---

### README Verdict: PARTIAL PASS

The README is well-structured and covers most requirements: Docker startup, access URLs, all demo credentials, security notes, and environment variables. It fails on two hard gates:

1. **Verification method missing** — evaluator has no guided step to confirm the system works after starting it
2. **`npm install` present** — non-Docker dependency installation path violates strict containment rules

Neither failure indicates a broken or unsafe project — both are documentation gaps. The primary Docker-based setup path is correct and complete.

---

---

# FINAL VERDICTS

| Audit | Score / Verdict |
|-------|----------------|
| **Test Coverage** | **80 / 100** |
| **README** | **PARTIAL PASS** |

## Test Coverage Summary
Backend API testing is exemplary: 100% endpoint coverage using True No-Mock HTTP (real Supertest + real Express + real services). Auth, permission, tenant isolation, and edge case coverage is thorough. Frontend component testing is solid (10+ components with RTL, interactive flows). Key gaps: no E2E tests, 7 frontend pages untested, weak CSV export assertions, conditional WRITE_OFF dispose path, no WeChat success path.

## README Summary
Primary Docker-based setup path is correct and complete. Hard gate failures on two counts: missing verification instructions (no curl example or expected output) and presence of `npm install` commands (even under a "local dev" label). All demo credentials and role information are fully present.
