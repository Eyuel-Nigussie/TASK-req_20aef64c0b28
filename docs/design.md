# ClinicOps — System Design

## Overview

ClinicOps is a **single-page internal staff tool** for multi-location preventive care clinics. There is no public-facing surface: every user holds a named role with access to patient records, billing data, or financial reports. Patients appear only as lightweight records attached to orders; all clinical operations are performed by staff on their behalf.

The platform is designed for **offline-first operation** — the backend requires no external services to run. The default storage layer is an in-memory repository; a MongoDB adapter can be swapped in via environment variable without changing any service code.

---

## Components

### Backend (`backend/`)

An Express 5 REST API with the following layered structure:

```
routes/       → HTTP boundary: auth, request parsing, permission gates
services/     → Business logic: orders, billing, reconciliation, audit, …
repositories/ → Storage abstraction: in-memory (default) or Mongoose
utils/        → Pure helpers: encryption, geo, money rounding, CSV, similarity
middleware/   → Auth (JWT), rate limiting, error formatting
```

The backend has no HTML views. Every response is JSON (or CSV for export endpoints).

### Frontend (`frontend/`)

A React 18 SPA built with Vite. Navigation is **data-driven**: the server returns a `nav` array on login that reflects the authenticated role; the Layout renders only those items. No client-side routing library is used — a single `route` state string drives which page component mounts.

The API client (`src/api/client.ts`) is a thin class wrapping `fetch`; all backend calls go through it. No global state library; session is stored in `localStorage` and surfaced via a React context (`useAuth`).

---

## Authentication & Session

* Login: `POST /api/auth/login` → JWT (HS256, 12-hour expiry) + user profile + `nav` array
* Every subsequent request sends `Authorization: Bearer <token>`
* Middleware verifies the token, hydrates `req.user`, and applies `enforceTenantScope` to lock the request to the authenticated tenant
* Password policy: ≥ 12 chars, uppercase + lowercase + digit + symbol
* Lockout: 5 failures within any window → 15-minute lockout; constant-time username-not-found response prevents enumeration
* Token revocation: each user carries a `tokenGeneration` counter; changing a password increments it and immediately invalidates all prior tokens

---

## Tenant Isolation

Every data collection (users, exam items, packages, orders, invoices, reconciliation cases, audit log) is scoped by `tenantId`. Two enforcement points exist:

1. **Middleware** (`enforceTenantScope`): sets `req.scopeTenantId` to the authenticated user's tenant (SYSTEM_ADMIN may override)
2. **Service layer** (`assertTenantScope`): validates that the object being mutated belongs to the acting tenant before any write

SYSTEM_ADMIN is the only role that can address objects across tenants.

---

## Role & Permission Model

Five roles with a static permission matrix defined in `services/roles.js`:

| Role | Key permissions |
|---|---|
| SYSTEM_ADMIN | `*` (unrestricted) |
| CLINIC_MANAGER | All ops within own tenant except system-level tenant creation |
| FRONT_DESK | Package search, order creation, invoice reading, identity submission |
| FINANCE_SPECIALIST | Invoice management, reconciliation, reporting |
| READ_ONLY_AUDITOR | Read-only across orders, invoices, reconciliation, audit log |

Navigation items returned at login reflect exactly the permissions above.

---

## Data Model (key entities)

**Tenant** — name, timezone, ZIP coordinates, active flag.

**User** — username, bcrypt password hash, role, tenantId, tokenGeneration, active/blacklisted/risky/realNameVerified flags.

**ExamItem** — code, name, unit, collectionMethod (BLOOD / URINE / SALIVA / IMAGING / PHYSICAL / QUESTIONNAIRE), referenceRange, contraindications, applicability rules (age range, gender).

**Package** — code, name, category, currentVersion, active. Versioned snapshots stored per version: composition (examItemId + required flag), price, deposit, validityDays. Orders carry an immutable snapshot of the version at sale time.

**Order** — patientId/name, packageId, packageVersion, snapshot (immutable copy), status (PENDING → CONFIRMED → PAID → FULFILLED, or CANCELLED / REFUNDED), tenantId.

**Invoice** — orderId, line items with qty/unitPrice/discount, subtotal, tax, total, status (PENDING / PAID / REFUNDED).

**BulkOperation** — list of orderIds, before-snapshot, undoDeadline (now + 10 min), actor.

**ReconciliationFile** — filename, SHA-256 fingerprint (deduplication), source (CSV/XLSX), ingestDate.

**ReconciliationCase** — fileId, amount, counterparty, memo, date, matchedInvoiceId, status (UNMATCHED / MATCHED / SUSPECTED_DUPLICATE / VARIANCE / WRITTEN_OFF), disposition (CONFIRM_MATCH / SPLIT / MERGE / WRITE_OFF), reviewer.

**IdentityRecord** — userId, legalName, idNumberEncrypted (AES-256-GCM ciphertext), status (PENDING / APPROVED / REJECTED), reviewNote.

**AuditEntry** — seq, ts, prevHash, hash, actorId, tenantId, action, resource, resourceId, details, anomaly.

---

## Package Versioning

When a package is modified, a new version record is created; the package's `currentVersion` counter increments. Existing orders are never mutated — they carry `snapshot` from the version at the time of sale. The `getVersion(pkgId, n)` endpoint retrieves any historical version.

---

## Billing Engine

`computeInvoice` runs at order confirmation:
1. For each composition item: `unitPrice * qty`
2. Apply flat `discount` (currency amount, not %)
3. Apply `taxRate` (default 8.25%, overridable per-confirm)
4. Sum → `subtotal`, `tax`, `total`

Pricing strategies (MEMBERSHIP / PERSONAL_TRAINING / GROUP_CLASS / VALUE_ADDED with effective-date windows and TIME/USAGE/AMOUNT billing types) are maintained separately and referenced at billing time.

A billing preview endpoint (`POST /api/orders/billing/preview`) returns the full breakdown without creating an invoice.

---

## Reconciliation

**Ingest**: CSV or XLSX file → parsed rows → SHA-256 fingerprint stored; re-upload of the same bytes is rejected as a duplicate.

**Auto-match**: each ingested row is compared against open invoices by:
- Amount within ±$0.01
- Date within ±3 days
- Counterparty + memo similarity score ≥ 0.4 (Jaccard on tokens + Levenshtein on memo)

**Dispositions** (manual override or auto):
- `CONFIRM_MATCH` — links case to invoice
- `SPLIT` — one case → multiple child cases (one per invoice)
- `MERGE` — bidirectional link between two cases
- `WRITE_OFF` — closes with no invoice match; requires reason

---

## Audit Log

Every mutation records an `AuditEntry`. Entries form a **hash chain**: each entry SHA-256-hashes `(prevHash, ts, actorId, tenantId, action, resource, resourceId, details)`. A serialized async queue ensures no concurrent writes break the sequence. `GET /api/reports/audit/verify` walks the full chain and reports any gap or hash mismatch. Anomaly-flagged entries (lockouts, blacklists, refunds, risky flags) are surfaced separately via `GET /api/reports/audit/anomalies`.

---

## Encryption

Sensitive fields (SSN/ID numbers in identity records) are stored as AES-256-GCM ciphertext in the format `v1:<iv_b64>:<tag_b64>:<ct_b64>`. The key is loaded from `CLINICOPS_AES_KEY` (base64, must decode to 32 bytes). The server decrypts and masks (`****xxxx`) before returning data to clients — raw ciphertext is never sent over the API.

---

## Geographic Search

Package search supports ZIP-to-centroid distance filtering. An offline lookup table (`data/zipCentroids.js`) maps US ZIP codes to lat/lon; Haversine distance is computed server-side and returned as `distanceMiles` per result.

---

## Rate Limiting

A custom in-memory IP-bucket limiter (`middleware/rateLimit.js`) applies to `/api/auth/login` and the WeChat exchange endpoint. Default window: 15 min / 10 requests. Headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`. **Note:** counters are process-local; a shared Redis store is required for multi-process deployments.

---

## Storage Adapter

`repositories/index.js` exports named collections. If `MONGO_URI` is set, collections are backed by `mongoAdapter.js` (Mongoose). Otherwise, `db.js` provides an in-memory `Collection` class with a MongoDB-subset query engine supporting `$in`, `$nin`, `$gt/$gte/$lt/$lte`, `$exists`, `$regex`, `$not`, `$or/$and/$nor`, `$size`, `$all`, `$elemMatch`, `$type`, nested dot-paths, and array-contains semantics. Both adapters expose the same async interface (`find`, `findById`, `findOne`, `insert`, `updateById`, `deleteById`, `count`), making them drop-in replacements.
