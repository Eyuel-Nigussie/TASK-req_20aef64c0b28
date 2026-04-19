# Q1. The in-memory rate limiter does not survive process restart or scale out

**Question.** The login rate limiter stores IP counters in the Node.js process heap. A server restart resets all counters to zero, and in a multi-process or multi-instance deployment each process maintains its own bucket — an attacker can spread requests across processes or restart cycles to bypass the limit entirely. Is this acceptable for the current deployment target?

**My understanding.** It is acceptable for single-process, single-instance local deployments (the primary target for the offline-first model), but is a documented gap for any production deployment behind a load balancer or PM2 cluster. The README already calls this out under Security Notes.

**Solution.** Keep the in-process implementation as the default; it requires no infrastructure. For production, swap in `rate-limit-redis` by replacing the store in `src/middleware/rateLimit.js`. The middleware interface is already abstraction-ready. Add an environment-variable flag (`RATE_LIMIT_REDIS_URL`) that, when set, constructs a Redis store and wires it in automatically at startup — zero code changes needed in the route layer.

---

## Q2. Audit write failures are silently swallowed

**Question.** In `services/audit.js`, the promise queue chains with `.catch(() => {})` on the queue tail. If `_doRecord` throws (e.g., a repository write error), the exception is swallowed and the calling service proceeds as though the audit write succeeded. A destructive operation could complete without a corresponding audit entry, and neither the caller nor the operator would know.

**My understanding.** The silent catch is intentional in the sense that the author didn't want a failed audit write to block the primary operation. However, losing an audit entry in a system that promises tamper-evident auditing is a correctness violation — especially for financial mutations (refunds, reconciliation dispositions).

**Solution.** Split the error handling: the queue tail `.catch(() => {})` keeps the queue running after a failure, but `record()` itself should re-throw so callers know the write failed. For financial operations, wrap the primary mutation and the audit write in a logical transaction (or a two-phase approach: write the primary record first, then attempt the audit write with retry). If the audit write permanently fails, the operation should be rolled back or at least surfaced as a warning in the response. A short-term improvement: log the failure to `console.error` even if not re-thrown, so the anomaly appears in server logs.

---

## Q3. `mongoAdapter.js` is a stub — the Mongoose path is untested

**Question.** `repositories/index.js` switches to `mongoAdapter.js` when `MONGO_URI` is set. The adapter file exists but its completeness was not verified, and no test exercises the Mongoose path. All 195 backend tests run against the in-memory store. This means the "MongoDB-ready" claim in the README is aspirational — a real MongoDB deployment could fail on queries that the in-memory engine handles correctly.

**My understanding.** The in-memory store is the primary target; MongoDB is a future upgrade path. The adapter interface is correct (same async method signatures), but the query translation layer for operators like `$elemMatch`, `$type`, and `$all` may not be implemented in Mongoose terms.

**Solution.** Add a second Jest config (`jest.mongo.config.js`) that points `MONGO_URI` at a test MongoDB instance (e.g., via `mongodb-memory-server`) and runs the same test suite. This makes the adapter a first-class citizen. Gate the CI job behind a flag so it doesn't block offline development. Until then, add a startup warning when `MONGO_URI` is set and `NODE_ENV=production` reminding operators that the Mongoose adapter is not fully integration-tested.

---

## Q4. Package version history fetches one HTTP round-trip per version

**Question.** The frontend's `showVersions` function in `Packages.tsx` fetches each version individually in a `for` loop (`GET /api/packages/:id/versions/:v` for v = 1..currentVersion). A package with many versions generates that many sequential requests on user click, with no loading state or error boundary per version.

**My understanding.** The backend has no "list all versions" endpoint — only `GET /api/packages/:id/versions/:v`. The current approach works for packages with few versions but degrades linearly with version count and is sensitive to any single request failing mid-loop.

**Solution.** Add a `GET /api/packages/:id/versions` endpoint that returns all version snapshots in one response (`{ items: PackageVersion[] }`). The frontend then issues a single request. Until the backend endpoint exists, switch the loop to `Promise.all` so at least all requests are made in parallel rather than serially.

---

## Q5. The WeChat OAuth adapter is wired into the auth route but ships disabled — the toggle is a runtime env var, not a build flag

**Question.** `GET /api/auth/wechat/enabled` and `GET /api/auth/wechat/exchange` are mounted unconditionally in the auth router; the adapter internally checks `config.wechatOAuthEnabled` and returns a 403 when disabled. Setting `WECHAT_OAUTH_ENABLED=true` in any environment activates an unauthenticated code-exchange endpoint. The adapter validates its config parameters, but the exchange logic calls an external WeChat API — making it an outbound dependency that breaks offline operation.

**My understanding.** The adapter is a placeholder for a future feature, intentionally shipped disabled. The concern is that an operator misconfiguring the env var in a supposedly offline deployment could inadvertently open an OAuth surface without realizing it.

**Solution.** Keep the runtime toggle, but additionally gate the route registration: if `wechatOAuthEnabled` is false at startup, do not mount `/wechat/exchange` at all (return 404 rather than 403). This ensures a misconfigured-but-disabled flag produces the same behavior as a flag that was never set. Document the required infrastructure (WeChat AppID, AppSecret, redirect URI, network egress) in a comment block above the adapter, so the operator knows exactly what enabling it implies.

---

## Q6. Sensitive field masking is server-side only — clients receive `maskedIdNumber`, not plaintext

**Question.** The identity list endpoint decrypts `idNumberEncrypted` and returns `maskedIdNumber` (e.g., `****6789`). The raw ciphertext is no longer sent to the client. However, the `maskSensitive` utility on the backend and the `maskSsn` utility on the frontend implement the same masking logic, yet `maskSsn` is now unused for this field. Is it correct that the frontend has no independent masking capability for identity numbers?

**My understanding.** Yes, this is correct. Decryption must stay server-side (the AES key is never sent to the client), so masking must also happen server-side. The frontend `maskSsn` utility remains available for other display contexts (e.g., patient ID fields surfaced in order detail views). The current design is sound.

**Solution.** No code change needed. Add a JSDoc comment to `maskSsn` in `client.ts` clarifying its intended use — display-side masking of plaintext values already partially redacted by the server, not a security control. Remove unused `maskSsn` imports from any file that no longer calls it to prevent future confusion.

---

## Q7. Bulk order update accepts a `status` field, but the non-financial boundary is not fully enforced

**Question.** `POST /api/orders/bulk` accepts a `status` field in `updates`. The service blocks transitions to `PAID` and `REFUNDED` (financial statuses), but an API client that sends `{ updates: { status: "FULFILLED" } }` bypasses the invoice-creation step normally required at the CONFIRMED → PAID → FULFILLED path. An order can be bulk-moved to `FULFILLED` even if it has no invoice.

**My understanding.** The bulk endpoint is designed for operational non-financial fields: tagging, due dates, and administrative status corrections. The financial flow (PENDING → CONFIRMED → PAID) must go through the single-order endpoints that create invoices. Jumping directly to `FULFILLED` via bulk is a data integrity risk.

**Solution.** In the bulk service, add `FULFILLED` to the blocked status list alongside `PAID` and `REFUNDED`, or add a pre-check that any order being bulk-moved to `FULFILLED` already has a `PAID` invoice. Alternatively, remove `status` from bulk updates entirely and restrict the field to `tags` and `dueDate` only, since those are the only fields the README's "non-financial fields" clause describes.

---

## Q8. The in-memory repository has no persistence across restarts — all data is lost on process exit

**Question.** The default storage adapter holds all data in JavaScript `Map` structures in the process heap. Any crash, deployment, or `docker-compose restart` wipes the entire database including tenant config, users, packages, and financial history. The seed runs again on next boot (since no users exist), but any data entered after initial setup is gone.

**My understanding.** This is a known and accepted constraint for the offline demo / development target. The MongoDB adapter path exists for deployments that need durability. The README does not claim the in-memory store is persistent.

**Solution.** For teams that want offline durability without MongoDB, add a filesystem persistence option to the in-memory repository: on every write, serialize the affected collection to a JSON file under a configurable `DATA_DIR` path; on startup, load from that directory if the files exist. This requires no external database and preserves the offline-first property. Gate it behind a `PERSIST_DATA_DIR` env var — when unset, behavior is identical to today.
