# Q1. The in-memory rate limiter does not survive process restart or scale out

**Question.** The login rate limiter stores IP counters in the Node.js process heap. A server restart resets all counters to zero, and in a multi-process or multi-instance deployment each process maintains its own bucket — an attacker can spread requests across processes or restart cycles to bypass the limit entirely. Is this acceptable for the current deployment target?

**My understanding.** It is acceptable for single-process, single-instance local deployments (the primary target for the offline-first model), but is a documented gap for any production deployment behind a load balancer or PM2 cluster.

**Solution.** Keep the in-process implementation as the default; it requires no infrastructure. For production, add a `RATE_LIMIT_REDIS_URL` environment variable. When set, construct a Redis store at startup and wire it into `rateLimit.js` — zero changes needed in the route layer. The middleware interface is already abstraction-ready because the bucket store is an internal detail of the middleware module.

---

## Q2. Audit write failures are silently swallowed

**Question.** In `services/audit.js`, the promise queue chains with `.catch(() => {})` on the queue tail. If `_doRecord` throws (e.g., a repository write error), the exception is swallowed and the calling service proceeds as though the audit write succeeded. A destructive operation — a refund, a blacklist, a reconciliation write-off — could complete without a corresponding audit entry, and neither the caller nor the operator would know.

**My understanding.** The silent catch keeps the queue alive after a failure, which is correct. But `record()` returning the raw promise means callers that `await` it will see the rejection — only callers that don't await it miss the error. The deeper issue is that financial operations should not be considered complete if their audit trail is broken.

**Solution.** Log failures to `console.error` at minimum so they appear in server logs. For financial mutations (refunds, reconciliation dispositions), wrap the primary write and the audit write in a logical two-phase pattern: if the audit write fails after the primary write succeeds, include the audit failure in the response as a warning field rather than silently continuing. A structured log entry (`{ level: 'error', event: 'audit_write_failed', action, resourceId }`) is sufficient to feed an alerting system.

---

## Q3. `mongoAdapter.js` is a stub — the Mongoose path is untested

**Question.** `repositories/index.js` switches to `mongoAdapter.js` when `MONGO_URI` is set. All 195 backend tests run against the in-memory store. This means the "MongoDB-ready" claim in the README is aspirational — a real MongoDB deployment could fail on queries that the in-memory engine handles correctly, particularly operators like `$elemMatch`, `$type`, and `$all` which require careful Mongoose translation.

**My understanding.** The in-memory store is the primary target; MongoDB is an upgrade path. The adapter interface is defined correctly, but query translation completeness is unverified.

**Solution.** Add a second Jest config (`jest.mongo.config.js`) that sets `MONGO_URI` to a `mongodb-memory-server` instance and runs the same full test suite. Gate this CI job behind a flag (`--testenv=mongo`) so it doesn't block offline development. Until verified, emit a startup warning when `MONGO_URI` is set and `NODE_ENV=production` to remind operators the adapter is not fully regression-tested.

---

## Q4. Package version history fetches N sequential HTTP round-trips

**Question.** The frontend's `showVersions()` function in `Packages.tsx` fetches each version individually in a `for` loop — one `GET /api/packages/:id/versions/:v` per version — serially. A package with 10 versions generates 10 sequential requests. There is no loading indicator per version, and a single 404 mid-loop silently stops the loop.

**My understanding.** The backend has no "list all versions" endpoint. The sequential loop was the only option available at implementation time, but it degrades linearly with version count and has no error recovery.

**Solution.** Add `GET /api/packages/:id/versions` to the backend that returns all snapshots in one response. On the frontend, replace the loop with a single call. Short-term improvement before the backend endpoint exists: switch to `Promise.all` so all requests fire in parallel rather than serially, and add a try/catch per individual version request rather than stopping the whole loop on any failure.

---

## Q5. The WeChat OAuth adapter is wired into the auth route but ships disabled — the toggle is a runtime env var, not a build flag

**Question.** `/api/auth/wechat/exchange` is mounted unconditionally; the adapter checks `config.wechatOAuthEnabled` and returns 403 when disabled. Setting `WECHAT_OAUTH_ENABLED=true` in any environment activates an unauthenticated code-exchange endpoint. Because the exchange calls an external WeChat API, enabling it also breaks the offline-first property.

**My understanding.** The adapter is a future-feature placeholder, intentionally shipped disabled. The risk is that a misconfigured env var silently opens an OAuth surface in a deployment that is supposed to be fully offline.

**Solution.** Gate route registration, not just the handler: if `wechatOAuthEnabled` is false at startup, do not call `router.get('/wechat/exchange', ...)` at all — the path returns 404 rather than 403, indistinguishable from any unknown route. Add a startup log line when the adapter is enabled so operators know they have an outbound dependency. Document required infrastructure (AppID, AppSecret, redirect URI, network egress to `api.weixin.qq.com`) prominently above the adapter.

---

## Q6. Sensitive field masking happens server-side — the field name changed without a migration path

**Question.** Identity records stored in the repository have the field `idNumberEncrypted`. The identity list endpoint now decrypts and masks this field server-side, returning `maskedIdNumber` to the client. Any client or script that previously expected `idNumberEncrypted` in the API response will now find it absent. Is this a breaking API change, and how should it be versioned?

**My understanding.** Since `idNumberEncrypted` contained AES-256-GCM ciphertext (not a usable value for any legitimate client), removing it from the API response is strictly safer, not a regression. No legitimate consumer of the API could have used the ciphertext. However, the field name change is technically breaking for any client that read `idNumberEncrypted` to determine whether a record had been submitted.

**Solution.** The current behavior is correct. Document the response shape explicitly in the API spec so future clients build against `maskedIdNumber`. If API versioning is introduced later, this endpoint's v1 shape should be defined as including `maskedIdNumber` (not the ciphertext), making the current implementation the canonical v1 contract.

---

## Q7. Bulk order `status` update allows jumping to `FULFILLED` without a paid invoice

**Question.** `POST /api/orders/bulk` blocks transitions to `PAID` and `REFUNDED` but permits `FULFILLED`. An order bulk-moved to `FULFILLED` may have no invoice at all (if it was PENDING when bulk-updated), creating a fulfilled order with `invoiceId: null` and no financial record.

**My understanding.** The bulk endpoint is designed for non-financial operational fields. The README explicitly says "non-financial fields" are the scope of bulk updates. `FULFILLED` is the terminal operational status and represents a clinical action, but it implies that payment already occurred — which the bulk path does not verify.

**Solution.** Add `FULFILLED` to the `FINANCIAL_STATUSES` set in `services/orders.js` alongside `PAID` and `REFUNDED`, or add a pre-check: if the target status is `FULFILLED`, verify every selected order has status `PAID` before applying the change. Either approach prevents the gap. The simpler fix (blocking `FULFILLED` entirely from bulk) is preferable because it matches the stated intent of the feature.

---

## Q8. The in-memory repository has no persistence across restarts

**Question.** All data lives in JavaScript `Map` structures in the process heap. Any crash, `docker-compose restart`, or deployment wipes the entire database — users, packages, orders, financial history. The seed runs on next boot because no users exist, but anything created afterward is gone.

**My understanding.** This is accepted for the offline demo and development target. The MongoDB adapter path exists for durable deployments. The README is honest about this.

**Solution.** For teams that need offline durability without MongoDB, add an optional filesystem persistence layer: on every write, serialize the affected collection to a JSON file under a `DATA_DIR` path. On startup, load from those files if present. Gate behind a `PERSIST_DATA_DIR` environment variable — when absent, behavior is unchanged. This preserves the zero-infrastructure property while making single-machine deployments durable across restarts.

---

## Q9. `markPaid()` previously allowed PENDING → PAID without an invoice, creating orphaned financial state

**Question.** The original guard in `services/orders.js` was `!['CONFIRMED', 'PENDING'].includes(order.status)`, which permitted calling `markPaid()` on a PENDING order — one that has no invoice. The result would be an order in `PAID` status with `invoiceId: null` and no financial record of what was paid or how much.

**My understanding.** This was a logic error: the intent was clearly to only allow payment after confirmation, because confirmation is the step that creates the invoice. PENDING orders cannot be paid because there is nothing to pay against.

**Solution.** The guard was corrected to `order.status !== 'CONFIRMED'`, which is the minimum sufficient condition. The fix enforces the full lifecycle: PENDING → CONFIRMED (creates invoice) → PAID (marks invoice paid). As an additional safeguard, the `markPaid()` service should assert `order.invoiceId !== null` after the status check, so even if the status guard were somehow bypassed, the function would still reject payment on an invoice-less order.

---

## Q10. Reconciliation auto-match previously created two case records for duplicate transactions

**Question.** In the original reconciliation engine, transactions that appeared to be duplicates (same amount and date) were processed through the main matching loop AND then through a separate duplicate-detection pass. Each such transaction produced two `ReconciliationCase` records — one from the main loop and one from the duplicate pass — making the case list misleading and making it impossible to cleanly dispose of duplicates.

**My understanding.** The intent was to flag duplicates distinctly from normal unmatched transactions, which is correct behavior. The bug was that the duplicate check ran after the main loop rather than as a pre-pass that excluded duplicates from further processing.

**Solution.** The fix restructures the logic into three sequential, non-overlapping passes: (1) a pre-pass that identifies duplicate `(amountCents, date)` pairs and collects their IDs into a `Set`; (2) the main matching loop that `continue`s on any ID in that Set; (3) a dedicated duplicate pass that inserts exactly one `SUSPECTED_DUPLICATE` case per duplicate transaction. Any given transaction ID now appears in at most one case record.

---

## Q11. `window.prompt()` was used for disposition note and cancel reason input

**Question.** The original `Reconciliation.tsx` and `Orders.tsx` used `window.prompt()` to collect reviewer notes and cancel reasons. Browser-native prompts are synchronous, visually inconsistent with the application UI, untestable with React Testing Library without mocking `window.prompt`, and inaccessible on some platforms (e.g., suppressed in iframes, inconsistent in Electron).

**My understanding.** `prompt()` was a quick stand-in for a proper input field. It works for a demo but is incompatible with a production healthcare operations tool that needs accessible, testable, auditable input flows.

**Solution.** The reconciliation disposition inputs are now rendered as inline React-managed UI within the case table (a small form that appears when a disposition button is clicked). Each disposition type shows only the inputs it requires: a textarea for the note, a comma-separated invoice ID field for SPLIT, a case ID field for MERGE. State is managed with `useState`, reset on close or success, and the submit path calls the same API as before. This approach is fully testable via `data-testid` attributes and accessible via standard keyboard navigation.

---

## Q12. Search `pageSize` had no upper bound, enabling unbounded full-catalog memory scans

**Question.** The package search endpoint accepted `pageSize` directly from the caller with no maximum. A client could send `pageSize=1000000`, causing the service to load and return the entire catalog in a single response. In a large catalog, this could exhaust server memory and produce a response too large for the client to handle.

**My understanding.** Pagination parameters should always be sanitized at the service boundary, not trusted from the caller. An internal client or a misconfigured frontend could inadvertently trigger this even without malicious intent.

**Solution.** The `pageSize` is now clamped to `[1, 200]` using `Math.min(200, Math.max(1, Number(_pageSize) || 20))` before any query is executed. The raw parameter is destructured under the alias `_pageSize` to make it clear that the clamped value is the one in use throughout the function. The pattern matches the existing clamp in `routes/orders.js` and `routes/users.js`.

---

## Q13. The VARIANCE reconciliation status was missing — cases that should require human review were silently discarded

**Question.** The original reconciliation engine produced three outcomes: MATCHED, UNMATCHED, and SUSPECTED_DUPLICATE. A fourth case existed in practice — transactions where the amount and date matched an invoice but the memo/counterparty similarity was too low to auto-confirm — that had no status. These cases were produced by the auto-match logic but never stored, effectively silently discarding partial matches that a human should review.

**My understanding.** VARIANCE is semantically important: it signals "we have a candidate but we're not confident enough to auto-match." Without it, Finance Specialists have no way to find and act on partial matches. They either trust the auto-match entirely or manually review every UNMATCHED case.

**Solution.** A VARIANCE case is now created when at least one invoice candidate passes the amount-and-date filter but the best similarity score falls below the configured threshold. The status is distinct from UNMATCHED (zero candidates) and MATCHED (above threshold). The frontend filter dropdown includes VARIANCE as an option. The ingest summary reports the VARIANCE count alongside matched and unmatched counts.

---

## Q14. The frontend category filter in Reports used nonexistent backend category values

**Question.** `Reports.tsx` offered three category options: `EXAM`, `WELLNESS`, and `SPECIALIST`. The backend's canonical package categories are `EXAM`, `MEMBERSHIP`, `PERSONAL_TRAINING`, `GROUP_CLASS`, and `VALUE_ADDED`. `WELLNESS` and `SPECIALIST` do not exist in the backend at all — filtering by either would silently return zero results without any error, giving the user no indication that the filter was invalid.

**My understanding.** This was a copy-paste error introduced when the Reports page was written. The developer used placeholder category names rather than the actual enum values from `services/roles.js` and the package schema.

**Solution.** The dropdown now lists the correct five categories matching the backend: EXAM, MEMBERSHIP, PERSONAL_TRAINING, GROUP_CLASS, VALUE_ADDED. This is a frontend-only fix. No backend change was needed since the backend was already correct — it simply returned empty results for unknown categories, which was the silent failure mode.

---

## Q15. Login page applied password policy validation before attempting authentication, blocking valid users

**Question.** The original `LoginPage` called `validatePasswordPolicy(password)` before submitting the login request. If the submitted password failed the policy (e.g., under 12 characters, no symbol), the client blocked the request entirely with a policy error — even if the password was the user's correct, existing password that was set before the current policy was in place. The user could not log in from the UI at all.

**My understanding.** Password policy should be enforced at creation and change time, not at login time. At login, the only check is whether the submitted password matches the stored hash. Applying the policy at login is a client-side logic error that confuses "the password we'll accept for new accounts" with "the password we'll accept at login."

**Solution.** The `validatePasswordPolicy` import and call were removed from `LoginPage`. The form now checks only that username and password are non-empty before submitting. The password policy validation remains in the `UsersPage` (create user) and `SettingsPage` (change password) where it is appropriate. The server enforces the policy only at creation and change time, which is the correct behavior.
