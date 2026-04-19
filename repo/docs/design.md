# ClinicOps — System Design

## 1. Purpose and Deployment Context

ClinicOps is an **internal staff operations platform** for multi-location preventive care clinics. It is not a patient-facing application. Every user who can authenticate holds a privileged role — they can read patient records, create financial transactions, or audit system activity. This shapes several design decisions:

- There is no self-signup flow. All accounts are created by administrators.
- The system is designed for **offline-first, single-clinic deployments** where no cloud connectivity is assumed. All business logic runs on a local server. The only external dependency is the database, and even that defaults to an in-memory store so the server runs with zero infrastructure.
- Multi-tenancy exists to support a future model where a single server installation hosts multiple clinic locations. Each tenant is fully isolated; staff at one clinic cannot see data from another.

---

## 2. High-Level Architecture

The system is split into two independently deployable services, both managed by Docker Compose:

```
┌──────────────────────────┐       HTTP / JSON       ┌────────────────────────────┐
│   Frontend               │ ◄──────────────────────► │   Backend                  │
│   React 18 + TypeScript  │   port 5173 → /api/*     │   Express 5 + Node.js 20   │
│   Vite dev server        │   proxied to :4000        │   port 4000                │
└──────────────────────────┘                           └────────────────────────────┘
                                                                │
                                                     ┌──────────┴──────────┐
                                                     │  Storage Layer       │
                                                     │  In-memory (default) │
                                                     │  or MongoDB          │
                                                     └─────────────────────┘
```

The frontend is a single-page application. It has no server-side rendering and no static API calls at build time. In the Docker setup, Vite's dev server proxies all `/api/*` requests to the backend container. The frontend and backend are decoupled: you can run either independently.

The backend exposes a pure JSON REST API (plus CSV download endpoints). There is no WebSocket layer, no server-sent events, and no real-time push. All UI updates are triggered by user actions that cause API calls.

---

## 3. Backend Internal Structure

The backend is organized into five distinct layers. Each layer has a single responsibility and a defined interface to the layer below it.

### 3.1 Routes Layer (`src/routes/`)

Each route file is an Express Router mounted at a fixed base path in `app.js`. Route files are responsible for:

- Parsing and validating HTTP input (query params, request body)
- Applying middleware chains (authentication, permission checks, tenant scope enforcement)
- Calling one or more service functions
- Formatting and sending the HTTP response

Routes contain **no business logic**. They are the HTTP boundary of the system.

Route files and their mount paths:
| File | Mount Path |
|---|---|
| `auth.js` | `/api/auth` |
| `tenants.js` | `/api/tenants` |
| `users.js` | `/api/users` |
| `examItems.js` | `/api/exam-items` |
| `packages.js` | `/api/packages` |
| `orders.js` | `/api/orders` |
| `reconciliation.js` | `/api/reconciliation` |
| `reports.js` | `/api/reports` |

### 3.2 Services Layer (`src/services/`)

Services contain all business logic. They do not know about HTTP — they accept plain JavaScript arguments and return plain objects. Services call repositories for data persistence and other services for cross-domain operations (e.g., `orders.js` calls `billing.js` at confirmation time).

Key services:
- **`auth.js`** / **`password.js`** / **`tokens.js`**: credential validation, bcrypt hashing, JWT sign/verify/revoke, lockout management
- **`users.js`**: full user lifecycle — create, update, deactivate, reactivate, blacklist, flag, merge
- **`identity.js`**: real-name verification workflow — submit, list, approve/reject
- **`examItems.js`**: exam item CRUD with eligibility checking
- **`packages.js`**: package and version management
- **`search.js`**: package search with all filter dimensions, favorites, search history
- **`recommendations.js`**: behavior-based package recommendations
- **`orders.js`**: full order lifecycle including bulk operations and undo
- **`billing.js`** / **`pricing.js`** / **`invoices.js`**: invoice computation, pricing strategy resolution, refunds
- **`reconciliation.js`**: file ingest, auto-matching, disposition handling
- **`audit.js`**: hash-chained audit log with serialized writes
- **`kpi.js`**: KPI aggregation (GMV, AOV, fulfillment time, repeat rate)
- **`exports.js`**: CSV generation for orders, invoices, reconciliation cases
- **`tenants.js`**: tenant CRUD
- **`roles.js`**: permission and navigation definitions (static, no DB)
- **`wechatAdapter.js`**: disabled OAuth stub

### 3.3 Repositories Layer (`src/repositories/`)

The repository layer is a storage abstraction. It exports a set of named collection objects, each with the same async interface:

```javascript
find(query, opts)       // → { items, total }
findById(id)            // → document | null
findOne(query)          // → document | null
insert(doc)             // → document (with generated id + timestamps)
updateById(id, patch)   // → updated document
deleteById(id)          // → void
count(query)            // → number
```

`repositories/index.js` reads `config.mongoUri` at startup. If set, it wires Mongoose-backed adapters from `mongoAdapter.js`. Otherwise, all collections use `db.js`, the in-memory engine.

Named collections registered: `users`, `tenants`, `examItems`, `packages`, `packageVersions`, `orders`, `invoices`, `bulkOperations`, `pricingStrategies`, `reconciliationFiles`, `transactions`, `reconciliationCases`, `favorites`, `searchHistory`, `identityRecords`, `mergePendingRecords`, `auditLog`.

### 3.4 Utilities Layer (`src/utils/`)

Pure functions with no side effects and no repository access. Each utility module focuses on one domain:

- **`encryption.js`**: `encrypt(plaintext)`, `decrypt(ciphertext)`, `maskSensitive(value)`, `hashFingerprint(bytes)` — AES-256-GCM with the `v1:iv:tag:ct` envelope format
- **`money.js`**: `round2()`, `toCents()`, `fromCents()`, `amountsMatch(a, b, tol)` — cent-based arithmetic to avoid floating-point errors
- **`geo.js`**: `haversineDistance(lat1, lon1, lat2, lon2)` using the spherical law of cosines; `zipToCentroid(zip)` for offline lookup
- **`similarity.js`**: `jaccardSimilarity(a, b)` on token sets; `levenshtein(a, b)` for edit distance; `memoSimilarity(a, b)` combining both
- **`csv.js`**: `parseCsv(text)`, `buildCsv(rows)`, `escapeFormula(cell)` — formula injection protection
- **`timezone.js`**: IANA timezone parsing and local-time conversions
- **`errors.js`**: factory functions for standardized error objects (`bad`, `notFound`, `conflict`, `forbidden`)
- **`id.js`**: UUID v4 generation
- **`logger.js`**: structured logging wrapper

### 3.5 Middleware Layer (`src/middleware/`)

Middleware functions run on every request before it reaches a route handler:

- **`auth.js`** — `authenticate`: verifies the JWT bearer token, hydrates `req.user`, checks the token generation counter matches the user's current generation (invalidates tokens from before a password change), and blocks blacklisted/deactivated/merged users
- **`auth.js`** — `enforceTenantScope`: sets `req.scopeTenantId`; SYSTEM_ADMIN may pass a `tenantId` query param to operate on any tenant, all other roles are locked to their own
- **`auth.js`** — `requirePermission(perm)`: reads `req.user.role`, looks up the permission set for that role in `roles.js`, returns 403 if not present
- **`auth.js`** — `requireRole(...roles)`: strict role check, used where permission granularity is insufficient (e.g., identity review is SYSTEM_ADMIN only)
- **`rateLimit.js`**: in-memory IP bucket counter; applies to login and WeChat exchange endpoints
- **`asyncHandler.js`**: wraps async route handlers so thrown errors propagate to the error middleware
- **`error.js`**: `errorHandler` formats all thrown errors as `{ error: { message, code, details } }`; `notFound` returns 404 for unregistered paths

---

## 4. Frontend Internal Structure

### 4.1 Routing

The frontend uses a custom micro-router: a single `route` state string in the `Shell` component determines which page component renders. There is no library involved. The Layout component calls `onNavigate(routeName)` when a nav item is clicked, which updates the state. All page components are mounted at the same DOM location; only one renders at a time.

```tsx
// Shell in App.tsx
const [route, setRoute] = useState<string>(initialRoute || 'dashboard');
// ...
{route === 'dashboard'      ? <DashboardPage />      : null}
{route === 'search'         ? <SearchPage />          : null}
{route === 'tenants'        ? <TenantsPage />         : null}
// ... etc
```

### 4.2 Auth Context

`hooks/useAuth.tsx` provides an `AuthProvider` and a `useAuth()` hook. The provider:

1. On mount, reads the persisted session from `localStorage` via `store/auth.ts`
2. Creates an `ApiClient` instance, seeding its token getter from the stored session
3. Exposes `{ session, login, logout, api, permit }` to all descendants

`permit(permissionName)` is the client-side equivalent of `requirePermission` — it reads the user's role from the session and looks up the permission in a client-side copy of the permission matrix. This is used to conditionally render action buttons. It is **not a security control** — the server enforces all permissions independently.

### 4.3 API Client

`api/client.ts` exports an `ApiClient` class. All HTTP calls go through its `request()` method, which:
- Sets the `Authorization: Bearer <token>` header automatically
- JSON-encodes request bodies
- Parses JSON responses
- Throws a typed `ApiError` with `status`, `code`, and `details` for any non-2xx response

`api/endpoints.ts` wraps the client with named, typed methods for every API endpoint. The `useAuth` hook passes the client through context so every page component accesses it via `api.orders.list()`, `api.reconciliation.ingest(...)`, etc. — no page component calls `fetch` directly.

### 4.4 Page Components

Each screen is a single file in `src/pages/`. Pages follow a consistent pattern:
1. Call `useAuth()` to get `api` and `permit`
2. Declare local state with `useState`
3. Define a `load()` async function that fetches data and sets state
4. Call `load()` in a `useEffect` on mount
5. Define action handlers that call API methods then reload
6. Return JSX

Pages do not share state with each other. Every page fetches its own data on mount. There is no global cache, optimistic updates, or shared mutation state.

### 4.5 Session Persistence

`store/auth.ts` serializes the session object (token + user profile + nav array) to `localStorage` on login and clears it on logout. The `AuthProvider` reads this on mount to restore a session across page refreshes. If the stored token is expired or revoked, the next API call will return 401, which the error handler surfaces as a login prompt.

---

## 5. Authentication and Session Management

### 5.1 Login Flow

1. Client sends `POST /api/auth/login` with `{ username, password }`
2. Server looks up the user by username. If not found, a bcrypt comparison is run against a dummy hash (constant-time mitigation to prevent username enumeration)
3. Lockout check: if the user has 5 or more recent failures within the lockout window, return 423 with a `Retry-After` header. The lockout duration is 15 minutes
4. If the user is inactive, blacklisted, or merged, return 403
5. `bcrypt.compare()` the submitted password against the stored hash
6. On failure: increment `loginAttempts`, set `lockedUntil` if threshold reached, audit the failure, return 401
7. On success: clear `loginAttempts`, sign a JWT containing `{ sub: userId, role, tenantId, gen: tokenGeneration }`, return the token along with the user profile and the `nav` array for the role

### 5.2 Token Validation (Every Protected Request)

1. Parse `Authorization: Bearer <token>` header; return 401 if absent
2. Verify the JWT signature using `JWT_SECRET`; return 401 if invalid or expired
3. Load the user record from the repository; return 401 if not found
4. Compare `token.gen` with `user.tokenGeneration`; if they differ, the token was issued before a password change — return 401
5. Check `user.active`, `user.blacklisted`, `user.merged`; return 403 if any block flag is set
6. Set `req.user` and continue

### 5.3 Password Policy

Enforced at creation and change time (not at login):
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one symbol (non-alphanumeric)

The frontend validates the same policy client-side on the create-user and change-password forms to give immediate feedback, but the server enforces it independently.

### 5.4 Token Revocation

The system uses a **generation counter** rather than a token blacklist. When a user changes their password, `users.updateUser` increments `user.tokenGeneration`. All existing tokens embed the old generation number and are rejected by the middleware's generation check. This is O(1) per request and requires no separate revocation store.

For finer-grained revocation (a single token), a `jtiBlacklist` set is available but used only in special cases.

---

## 6. Role and Permission System

### 6.1 Static Permission Matrix

Roles and their permissions are defined once in `services/roles.js` as frozen objects. There is no database-driven permission system; roles are assigned at user creation time and permissions are entirely determined by role.

**SYSTEM_ADMIN** holds the wildcard permission `'*'`, granting every operation. This role can address data across all tenants.

**CLINIC_MANAGER** has full operational control within their own tenant: user lifecycle, exam item and package management, order and invoice management, reconciliation, reporting, and identity review.

**FRONT_DESK** is the primary patient-interaction role: package search, order creation, invoice reading, and identity submission.

**FINANCE_SPECIALIST** focuses on financial outcomes: invoice management, reconciliation, and reporting. They do not create orders or manage catalog.

**READ_ONLY_AUDITOR** has read access to orders, invoices, reconciliation cases, audit log, and reporting, but cannot mutate anything.

### 6.2 Navigation by Role

On login, the server returns a `nav` array derived from `NAV_BY_ROLE[role]`. The frontend Layout renders only the nav items in this array, so role-restricted screens are not visible at all to users who lack access. The server enforces the same restrictions independently.

### 6.3 Permission Checks in Routes

Every route that mutates data or reads sensitive resources is wrapped with `requirePermission('permission:name')`. The middleware checks whether the authenticated user's role has that permission (or `*`). SYSTEM_ADMIN always passes. Permission identifiers follow the `resource:action` convention (e.g., `invoice:refund`, `user:deactivate`, `reconciliation:manage`).

Some routes use `requireRole(ROLES.SYSTEM_ADMIN)` for operations where the permission exists but the action is semantically too powerful for any non-admin (identity review, audit chain verification).

---

## 7. Tenant Isolation

Tenant isolation is enforced at two independent layers to prevent a bug at either layer from being a sufficient vulnerability.

### 7.1 Middleware Layer

`enforceTenantScope` runs after authentication. It reads `req.user.tenantId` and sets `req.scopeTenantId`. For SYSTEM_ADMIN, the `tenantId` query parameter overrides this if provided, allowing cross-tenant operations. For all other roles, `req.scopeTenantId` is immutably set to their own tenant — they cannot pass a different tenant ID in the request.

### 7.2 Service Layer

Every service function that reads or writes tenant-scoped data takes `tenantId` as its first argument (from `req.scopeTenantId`) and includes it in every repository query. When fetching a single record by ID, the service validates that the returned record's `tenantId` matches the expected value before returning it:

```javascript
const order = await repo.orders.findById(orderId);
if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
```

A CLINIC_MANAGER at Tenant A who somehow obtains an order ID from Tenant B will receive a 404, not the order. The ID itself reveals nothing.

---

## 8. Data Model

### 8.1 Tenant

Represents a single clinic location. Fields: `id`, `name`, `timezone` (IANA string), `zip`, `lat`, `lng` (for distance calculations), `active`.

### 8.2 User

Fields: `id`, `username`, `passwordHash` (bcrypt), `role`, `tenantId`, `displayName`, `active`, `blacklisted`, `risky`, `realNameVerified`, `tokenGeneration`, `loginAttempts`, `lockedUntil`, `mergedIntoId`.

A user can be in multiple overlapping states: active and risky simultaneously, or blacklisted (which prevents login) while still having historical orders attached. Deactivation (`active: false`) preserves all financial history. Merge marks `mergedIntoId` on the source user and redirects the auth check.

### 8.3 ExamItem

The atomic unit of a medical examination. Fields: `id`, `tenantId`, `name`, `code`, `unit` (measurement unit, e.g., `"mmol/L"`), `collectionMethod` (BLOOD / URINE / SALIVA / IMAGING / PHYSICAL / QUESTIONNAIRE), `referenceRange` (`{ min, max }`), `contraindications` (array of strings), `applicabilityRules` (`{ minAge, maxAge, gender }`).

The `isEligible(item, { age, gender })` helper checks applicability rules and returns a boolean. This is used by the recommendation engine.

### 8.4 Package and PackageVersion

A **Package** is the top-level catalog entity: `id`, `tenantId`, `name`, `code`, `category`, `currentVersion`, `active`.

A **PackageVersion** is an immutable snapshot of a package at a point in time: `packageId`, `version` (integer), `composition` (array of `{ examItemId, required: boolean }`), `price`, `deposit`, `validityDays`, `validFrom`.

When a package is first created, version 1 is created simultaneously. When a manager creates a new version (to change composition or price), version N+1 is inserted and `currentVersion` increments. Old versions are never modified.

### 8.5 Order

Created when a Front Desk staff member books a package for a patient. Fields: `id`, `tenantId`, `patientId`, `patient` (`{ name, id }`), `packageId`, `packageVersion`, `snapshot` (full copy of the PackageVersion at creation time), `status`, `tags`, `dueDate`, `category`, `invoiceId`, `createdBy`, `purchasedAt`, `fulfilledAt`.

The `snapshot` field is critical: it means that even if the package is later versioned or the exam items are edited, the order always shows the exact composition the patient agreed to at booking time. This is an immutable record of the sale.

Status lifecycle:
```
PENDING → CONFIRMED → PAID → FULFILLED
                   ↘
             CANCELLED (from PENDING or CONFIRMED)
PAID → REFUNDED (via invoice refund)
```

### 8.6 Invoice

Created at order confirmation. Fields: `id`, `tenantId`, `orderId`, `patientId`, `patientName`, `packageName`, `lines` (array of `{ description, quantity, unitPrice, discount }`), `subtotal`, `discount`, `taxRate`, `tax`, `total`, `currency`, `status` (OPEN / PAID / VOID / REFUNDED), `paidAt`, `createdBy`.

The invoice is the financial record. The order is the operational record. They are linked by `order.invoiceId` and `invoice.orderId`.

### 8.7 BulkOperation

Represents a batch mutation applied to multiple orders. Fields: `id`, `tenantId`, `actorId`, `kind`, `patch` (the fields that were changed), `before` (array of `{ id, snapshot }` — the state before the change), `appliedAt`, `undoDeadline`, `undone`, `undoneAt`, `undoneBy`.

The `before` array is what makes undo possible: restoring a bulk operation means iterating `before` and applying each stored snapshot back to its order. Once `undoDeadline` has passed, the `undoBulk` service throws `UNDO_EXPIRED`.

### 8.8 ReconciliationFile and Transaction

A **ReconciliationFile** represents one uploaded bank statement. Fields: `id`, `tenantId`, `filename`, `fingerprint` (SHA-256 of the raw bytes), `source` (CSV or XLSX), `rowCount`, `importedBy`.

Each row in the file becomes a **Transaction**: `id`, `tenantId`, `fileId`, `amount`, `amountCents`, `date`, `memo`, `counterparty`, `reference`, `raw`, `matched`, `matchedInvoiceId`, `caseStatus`.

The SHA-256 fingerprint on the file is checked against existing files before ingestion. If the same bytes were uploaded before, ingest is rejected with `DUPLICATE_FILE`. This prevents duplicate case generation from accidental re-uploads.

### 8.9 ReconciliationCase

The output of auto-matching. Each case links one transaction to zero or one invoices. Fields: `id`, `tenantId`, `fileId`, `transactionId`, `amount`, `counterparty`, `memo`, `date`, `status` (UNMATCHED / MATCHED / SUSPECTED_DUPLICATE / VARIANCE / WRITTEN_OFF), `disposition` (CONFIRM_MATCH / SPLIT / MERGE / WRITE_OFF), `matchedInvoiceId`, `score`, `note`, `reviewer`, `reviewedAt`, `splitChildIds`, `mergedWithCaseId`.

### 8.10 IdentityRecord

Fields: `id`, `tenantId`, `userId`, `legalName`, `idNumberEncrypted` (AES-256-GCM ciphertext), `status` (PENDING / APPROVED / REJECTED), `submittedBy`, `reviewedBy`, `reviewedAt`, `reviewNote`.

The ID number is encrypted immediately at submission time. The plaintext never touches the database. When the list endpoint is called, the backend decrypts each record and applies `maskSensitive()` (keeps last 4 characters, masks the rest with `*`) before returning `maskedIdNumber` to the client. Raw ciphertext is never exposed over the API.

### 8.11 AuditEntry

Every mutating operation records one entry. Fields: `id`, `seq` (sequential integer), `ts` (ISO timestamp), `prevHash`, `hash` (SHA-256), `actorId`, `tenantId`, `action`, `resource`, `resourceId`, `details`, `anomaly` (non-null for security-sensitive events like lockouts, blacklisting, refunds).

---

## 9. Package Search and Recommendations

### 9.1 Search

`services/search.js` `searchPackages()` supports the following filter dimensions simultaneously:
- **Keyword**: tokenized; all tokens must appear in the package name or code
- **Category**: exact match against package category
- **Price range**: `minPrice` / `maxPrice` against `packageVersion.price`
- **Deposit range**: `minDeposit` / `maxDeposit`
- **Availability**: filters to active packages only
- **ZIP distance**: caller provides a ZIP and `maxDistanceMiles`; the offline ZIP centroid table resolves the ZIP to lat/lon; Haversine distance to the tenant's coordinates is computed and compared; result includes `distanceMiles`
- **Pagination**: `page` and `pageSize` (clamped to `[1, 200]`)

Every search is recorded in the search history for the authenticated user (used by the recommendation engine).

### 9.2 Recommendations

`services/recommendations.js` scores packages for a given user based on:
1. **Category affinity**: packages in categories the user has previously booked, scored by booking frequency
2. **Age eligibility**: packages whose exam items have age-range applicability rules that include the patient's age
3. **Gender eligibility**: same logic for gender

Each recommendation includes a human-readable `reasons` array explaining why it was suggested (e.g., `"because you previously booked Wellness Packages"`, `"suitable for age 45"`, `"suitable for male patients"`).

---

## 10. Billing Engine

### 10.1 Invoice Computation

`services/billing.js` `computeInvoice()` takes a list of line items, a discount amount, and a tax rate:

1. For each line: `lineTotal = unitPrice * quantity`
2. `subtotal = sum(lineTotals)`
3. `discountedSubtotal = subtotal - discount` (floored at 0)
4. `tax = round2(discountedSubtotal * taxRate)`
5. `total = discountedSubtotal + tax`

All arithmetic uses cent-based rounding (`round2`) to avoid floating-point accumulation errors. The default tax rate is 8.25% (configurable via `defaultTaxRate` in config).

### 10.2 Pricing Strategies

`services/pricing.js` manages pricing strategies with effective date windows. A strategy has a `billingType` (MEMBERSHIP / PERSONAL_TRAINING / GROUP_CLASS / VALUE_ADDED), a `unitPrice`, and `effectiveFrom` / `effectiveTo` dates. `findActive(tenantId, packageCode, date)` returns the strategy in effect on a given date for a given package code, if any.

At order confirmation time, if an active pricing strategy exists for the package's code, its `unitPrice` overrides the package version's stored price. This allows time-limited promotions without creating a new package version.

### 10.3 Preview Endpoint

`POST /api/orders/billing/preview` runs `computeInvoice` and returns the full breakdown without persisting anything. The frontend uses this to show a complete price breakdown before the staff member confirms the order.

---

## 11. Reconciliation Pipeline

### 11.1 Ingest

1. Accept a CSV or XLSX file as either UTF-8 text or base64-encoded bytes
2. Compute SHA-256 fingerprint of the raw bytes; reject if already imported
3. Parse rows: CSV via `parseCsv()`, XLSX via SheetJS (`xlsx.utils.sheet_to_json`)
4. Normalize each row: map flexible column names (amount/Amount/AMOUNT, date/Date/txn_date, etc.) to a canonical shape; convert amounts to cents; parse dates to ISO strings
5. Filter out rows where amount is not a finite number
6. Store the file record and all valid transaction records

### 11.2 Auto-Matching

After ingest, `autoMatch()` runs immediately:

**Duplicate pre-pass**: transactions with the same `(amountCents, date)` key are flagged as `SUSPECTED_DUPLICATE` and excluded from the main matching loop. Each duplicate produces exactly one case.

**Main matching loop** (for non-duplicate transactions):
1. Load all open (non-refunded) invoices for the tenant
2. For each transaction, find all invoices where:
   - `amountsMatch(tx.amount, invoice.total, tolerance=0.01)` — amounts within ±$0.01
   - The transaction date is within ±3 days of the invoice creation date
3. If no candidates: create `UNMATCHED` case
4. If candidates exist, compute `memoSimilarity(tx.memo, invoice.packageName)` for each. The similarity function combines Jaccard similarity on word tokens with Levenshtein edit distance on the full strings
5. If the best score ≥ configured threshold (default 0.4): create `MATCHED` case linked to that invoice
6. If the best score < threshold but candidates exist: create `VARIANCE` case — a human must confirm or reject the partial match

### 11.3 Dispositions

Manual override of any case's status via `POST /api/reconciliation/cases/:id/dispose`:

- **CONFIRM_MATCH**: links the case to a specific invoice; transitions to MATCHED
- **SPLIT**: one parent case → N child cases, each linked to one invoice. Requires `invoiceIds` array with at least 2 entries
- **MERGE**: links two cases bidirectionally; both transition to MATCHED. Requires `mergeWithCaseId`; both cases must belong to the same tenant
- **WRITE_OFF**: closes with no invoice match; requires a reason string

All dispositions record the reviewer's ID and timestamp, and generate an audit entry.

---

## 12. Audit Log

### 12.1 Hash Chain

Every audit entry is linked to the previous entry by including the previous entry's `hash` in its own hash computation. The hash function is:

```
SHA-256( JSON.stringify({ prevHash, ts, actorId, tenantId, action, resource, resourceId, details }) )
```

This creates a tamper-evident chain: modifying any past entry changes its hash, which breaks the `prevHash` of every subsequent entry. The chain can be fully verified by `GET /api/reports/audit/verify` (SYSTEM_ADMIN only), which replays the hash computation for every entry in sequence order.

### 12.2 Serialized Writes

The audit module uses a **promise queue** (`_auditQueue`) to serialize all writes:

```javascript
async function record(entry) {
  const result = _auditQueue.then(() => _doRecord(entry));
  _auditQueue = result.catch(() => {});
  return result;
}
```

Each `record()` call chains onto the tail of the current queue. `_doRecord()` reads the last entry to get `prevHash` and `seq`, then inserts the new entry. Because calls are serialized, two concurrent requests cannot both read the same last entry and produce a forked chain. The `.catch(() => {})` on the queue tail ensures a failed write does not poison subsequent writes.

### 12.3 Anomaly Flagging

Security-sensitive events (account lockouts, blacklisting, risky-user flagging, refunds, identity review rejections) set the `anomaly` field on the audit entry to a non-null string describing the event type. `GET /api/reports/audit/anomalies` returns only anomaly-flagged entries, giving auditors a filtered view of security-relevant activity without having to search through all routine operations.

---

## 13. AES-256-GCM Encryption

### 13.1 Key Management

The encryption key is a 32-byte buffer. It is loaded from the `CLINICOPS_AES_KEY` environment variable (base64-encoded). If the variable is absent in non-production environments, a deterministic default key is derived from a source-visible string (for local development only). In production, `CLINICOPS_AES_KEY` must be set or the server will refuse to start.

On startup, if the default key is in use and `NODE_ENV` is neither `production` nor `test`, a warning is emitted to stderr.

### 13.2 Ciphertext Format

Encrypted values use the `v1:<iv_b64>:<tag_b64>:<ct_b64>` envelope:
- `v1` — format version prefix for future key rotation compatibility
- `iv_b64` — 12-byte random IV, base64-encoded (new IV generated for every encryption)
- `tag_b64` — 16-byte GCM authentication tag, base64-encoded (detects tampering or wrong key)
- `ct_b64` — ciphertext, base64-encoded

The `decrypt()` function verifies the authentication tag before returning plaintext. A corrupted or tampered ciphertext throws rather than returning garbage.

### 13.3 Masking

`maskSensitive(value)` is applied server-side after decryption. It keeps the last 4 characters and replaces the rest with `*` (minimum 4 asterisks). This is what the client receives — never the plaintext and never the ciphertext.

---

## 14. Geographic Search

The offline ZIP centroid lookup (`data/zipCentroids.js`) is a static JavaScript Map from US ZIP code strings to `{ lat, lng }` objects. No network request is made.

When a search includes a `zip` parameter, the server:
1. Looks up the ZIP's centroid coordinates
2. Looks up the tenant's coordinates (stored on the Tenant record)
3. Computes Haversine distance between the two points
4. Returns `distanceMiles` on each result and filters out results beyond `maxDistanceMiles` if specified

Distance is computed in the search service, not in the database layer, so it works identically with both the in-memory and MongoDB adapters.

---

## 15. Rate Limiting

`middleware/rateLimit.js` implements an in-process IP bucket counter. For each incoming request to a rate-limited endpoint:

1. Read the current bucket for the client's IP address
2. Purge bucket entries older than the window (default 15 minutes)
3. If the entry count ≥ max (default 10), return 429 with `Retry-After`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset` headers
4. Otherwise, add the current timestamp to the bucket and continue

**Known limitation**: buckets are process-local. In multi-process deployments (PM2 clusters, Kubernetes pods, Docker Swarm replicas), each process maintains its own counter. An attacker can bypass the limit by distributing requests across processes. For single-process deployments (the intended target), the limiter is correct.

For multi-process deployments, the store should be replaced with a shared Redis backend (e.g., `rate-limit-redis`).

---

## 16. Storage Adapter Pattern

The in-memory engine (`db.js`) implements a `Collection` class backed by a JavaScript `Map`. It supports a MongoDB-compatible query subset that covers every query pattern used in the services layer:

| Operator | Meaning |
|---|---|
| `$in` / `$nin` | value in / not in array |
| `$gt` / `$gte` / `$lt` / `$lte` | numeric / date comparison |
| `$exists` | field presence check |
| `$regex` | string pattern match |
| `$not` | negation wrapper |
| `$or` / `$and` / `$nor` | logical combinators |
| `$size` | array length check |
| `$all` | array contains all specified values |
| `$elemMatch` | array element matches sub-query |
| `$type` | value type check |
| dot-path notation | nested field access (`"patient.name"`) |
| array-contains | field equals any element of array |

Sort, skip, and limit are also supported. The engine is hermetic — it has no I/O and no external dependencies — which is why the 195 backend tests run without MongoDB installed. All test data is created and destroyed in memory within each test.

The Mongoose adapter (`mongoAdapter.js`) exposes the same interface. Switching storage backends requires only setting `MONGO_URI` in the environment; no service or route code changes.
