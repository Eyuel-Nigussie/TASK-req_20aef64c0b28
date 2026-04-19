# ClinicOps API Spec

Base URL: `http://localhost:4000`

All protected routes require `Authorization: Bearer <token>`. Responses are JSON unless noted. Errors: `{ error: { message, code, details? } }`.

---

## Health

```
GET /health
→ { status: "ok" }
```

---

## Auth `/api/auth`

```
POST /login
  body: { username, password }
  → { token, user: { id, username, role, tenantId, … }, nav: string[] }

GET /me
  → user object

POST /password
  body: { newPassword }
  → { ok: true }
  note: invalidates all existing tokens

GET /wechat/enabled
  → { enabled: boolean }

GET /wechat/exchange?code=
  → { token, user }  (only when wechatOAuthEnabled=true)
```

---

## Tenants `/api/tenants`  _(SYSTEM_ADMIN only for write)_

```
GET /
  → { items: Tenant[] }

POST /
  body: { name, timezone?, zip?, lat?, lng? }
  → Tenant (201)

GET /:id
  → Tenant

PATCH /:id
  body: partial Tenant fields
  → Tenant
```

---

## Users `/api/users`

```
GET /
  → { items: User[], total, page, pageSize }

POST /
  body: { username, password, role, displayName, tenantId? }
  → User (201)

GET /:id
  → User

PATCH /:id
  body: partial User fields
  → User

POST /:id/blacklist
  body: { blacklisted: boolean, reason? }
  → { ok: true }

POST /:id/risky
  body: { risky: boolean, reason? }
  → { ok: true }

POST /:id/deactivate
  → { ok: true }

POST /:id/reactivate
  → { ok: true }

POST /merge/request
  body: { sourceId, targetId, reason }
  → MergeRequest (201)

POST /merge/:id/approve   _(SYSTEM_ADMIN)_
  → MergeRequest

POST /merge/:id/reject    _(SYSTEM_ADMIN)_
  body: { note? }
  → MergeRequest

POST /identity/submit
  body: { userId, legalName, idNumber }
  → IdentityRecord (201)

GET /identity/list
  → { items: IdentityRecord[], total }
  note: idNumberEncrypted is replaced with maskedIdNumber (e.g. "****6789")

POST /identity/:id/review  _(SYSTEM_ADMIN)_
  body: { decision: "APPROVED"|"REJECTED", note? }
  → IdentityRecord
```

---

## Exam Items `/api/exam-items`

```
GET /
  → { items: ExamItem[], total }

POST /
  body: { name, code, unit?, collectionMethod, referenceRange?, contraindications?, applicabilityRules? }
  → ExamItem (201)

GET /:id
  → ExamItem

PATCH /:id
  body: partial ExamItem fields
  → ExamItem

DELETE /:id
  → { ok: true }
```

`collectionMethod` values: `BLOOD | URINE | SALIVA | IMAGING | PHYSICAL | QUESTIONNAIRE`

---

## Packages `/api/packages`

```
GET /
  query: active?, category?
  → { items: Package[], total }

POST /
  body: { name, code, category, composition: [{examItemId, required}], price, deposit?, validityDays }
  → Package (201)

GET /:id
  → Package

GET /:id/versions/:version
  → PackageVersion

POST /:id/versions
  body: same as POST /  (creates new version)
  → Package

POST /:id/active
  body: { active: boolean }
  → { ok: true }

POST /search
  body: { keyword?, category?, minPrice?, maxPrice?, minDeposit?, maxDeposit?, zip?, maxDistanceMiles?, available?, page?, pageSize? }
  → { items: Package[], total, page, pageSize }
  note: includes distanceMiles per item when zip provided

GET /search/history
  → { items: SearchHistoryEntry[] }

GET /favorites
  → { items: Package[] }

POST /favorites/:id
  → { ok: true }

DELETE /favorites/:id
  → { ok: true }

POST /recommendations
  body: { patientId?, age?, gender? }
  → { items: Recommendation[] }
  note: each item includes reasons: string[]

GET /pricing/list
  → { items: PricingStrategy[] }

POST /pricing
  body: { name, code, billingType, unitPrice, effectiveFrom?, effectiveTo? }
  → PricingStrategy (201)
```

`category` values: `EXAM | MEMBERSHIP | PERSONAL_TRAINING | GROUP_CLASS | VALUE_ADDED`

---

## Orders `/api/orders`

```
GET /
  query: status?, patientId?
  → { items: Order[], total }

POST /
  body: { packageId, patient: { name, id }, notes? }
  → Order (201)

GET /:id
  → Order & { invoice: Invoice | null }

POST /:id/confirm
  body: { discount?, taxRate? }
  → { order: Order, invoice: Invoice }
  note: taxRate defaults to 8.25%

POST /:id/pay
  → Order

POST /:id/fulfill
  → Order

POST /:id/cancel
  body: { reason }
  → Order

POST /bulk
  body: { orderIds: string[], updates: { tags?, dueDate?, status? } }
  → BulkOperation (201)
  note: financial fields (PAID, REFUNDED) are blocked; undoDeadline = now + 10 min

GET /bulk/list
  → { items: BulkOperation[] }

POST /bulk/:id/undo
  → { ok: true, restored: number }

POST /billing/preview
  body: { packageId, packageVersion?, discount?, taxRate? }
  → Invoice (not persisted)

GET /invoices/list
  → { items: Invoice[] }

GET /invoices/:id
  → Invoice

POST /invoices/:id/refund
  body: { reason }  (reason ≥ 3 chars)
  → Invoice

GET /export.csv
  → text/csv

GET /invoices/export.csv
  → text/csv
```

Order status flow: `PENDING → CONFIRMED → PAID → FULFILLED` (terminal); also `CANCELLED`, `REFUNDED`.

---

## Reconciliation `/api/reconciliation`

```
POST /ingest
  body: { filename, content, source: "CSV"|"XLSX", encoding?: "base64" }
  → { fileId, cases: ReconciliationCase[] }
  note: duplicate file (same SHA-256) is rejected

GET /files
  → { items: ReconciliationFile[] }

GET /cases
  query: status?, fileId?
  → { items: ReconciliationCase[] }

POST /cases/:id/dispose
  body: { disposition: "CONFIRM_MATCH"|"SPLIT"|"MERGE"|"WRITE_OFF", invoiceIds?, targetCaseId?, reason? }
  → ReconciliationCase

GET /cases/export.csv
  → text/csv
```

Case status values: `UNMATCHED | MATCHED | SUSPECTED_DUPLICATE | VARIANCE | WRITTEN_OFF`

---

## Reports `/api/reports`

```
GET /kpi
  query: from?, to?, category?
  → { orders, paid, gmv, aov, repeatPurchaseRate, avgFulfillmentHours, byStatus: {}, byCategory: {} }

GET /audit
  query: limit? (default 200)
  → { items: AuditEntry[] }

GET /audit/verify  _(SYSTEM_ADMIN)_
  → { length, valid: boolean, broken: [{ seq, reason }] }

GET /audit/anomalies
  → { items: AuditEntry[] }
```

---

## Common Types

```typescript
User             { id, username, role, tenantId, active, blacklisted, risky, realNameVerified }
Tenant           { id, name, timezone, zip, lat, lng, active }
ExamItem         { id, code, name, unit, collectionMethod, referenceRange, contraindications, applicabilityRules }
Package          { id, code, name, category, currentVersion, active, current: PackageVersion }
PackageVersion   { version, composition, price, deposit, validityDays, validFrom }
Order            { id, patientId, patient, packageId, packageVersion, snapshot, status, tenantId, createdAt }
Invoice          { id, orderId, lines, subtotal, discount, taxRate, tax, total, status }
ReconciliationCase { id, fileId, amount, counterparty, memo, date, status, disposition, matchedInvoiceId, reviewer }
AuditEntry       { id, seq, ts, prevHash, hash, actorId, tenantId, action, resource, resourceId, details, anomaly }
```
