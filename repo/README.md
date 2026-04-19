# ClinicOps

A full-stack internal operations platform for multi-location preventive care clinics, covering package sales, order lifecycle, billing, reconciliation, and tamper-evident auditing — designed for offline-first operation with strict per-tenant data isolation.

## Architecture & Tech Stack

* **Frontend:** React 18, TypeScript, Vite, Vitest + Testing Library
* **Backend:** Node.js 20, Express 5, Jest + Supertest
* **Database:** In-memory repository (MongoDB-compatible interface; drop-in Mongoose adapter available via `MONGO_URI`)
* **Containerization:** Docker & Docker Compose

## Project Structure

```text
.
├── backend/                # Express REST API
│   ├── src/
│   │   ├── config/         # Environment-driven config
│   │   ├── data/           # Offline ZIP-to-centroid table
│   │   ├── middleware/     # Auth, rate-limit, error handling
│   │   ├── repositories/   # In-memory + Mongoose adapters
│   │   ├── routes/         # HTTP route handlers
│   │   ├── services/       # Business logic
│   │   └── utils/          # Encryption, CSV, geo, money, similarity
│   └── tests/              # Jest + Supertest (195 tests, ~99% coverage)
├── frontend/               # React + TypeScript SPA
│   ├── src/
│   │   ├── api/            # Typed API client + endpoint map
│   │   ├── components/     # Input, Layout, Pagination
│   │   ├── hooks/          # AuthProvider / useAuth
│   │   ├── pages/          # One file per screen
│   │   ├── store/          # localStorage session persistence
│   │   ├── types/          # Shared TypeScript types
│   │   └── utils/          # formatMoney, formatDate, password policy
│   └── tests/              # Vitest + RTL (47 tests, ~94% coverage)
├── docker-compose.yml      # Multi-container orchestration
├── Dockerfile              # Multi-stage build (backend + frontend targets)
├── start.sh                # Convenience wrapper around docker compose
├── run_tests.sh            # Standardized test execution script
└── README.md
```

## Prerequisites

* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/) (v2 plugin or standalone)

## Running the Application

**Build and start containers:**

```bash
./start.sh          # foreground
./start.sh -d       # detached
./start.sh --rebuild  # force image rebuild
./start.sh --stop   # stop and remove containers
```

Or directly with Docker Compose:

```bash
docker-compose up --build -d
```

**Access the app:**

* Frontend UI: `http://localhost:5173`
* Backend API: `http://localhost:4000/api`
* Health check: `http://localhost:4000/health`

**Stop:**

```bash
docker-compose down -v
```

## Testing

```bash
chmod +x run_tests.sh
./run_tests.sh              # backend + frontend
./run_tests.sh --backend    # backend only
./run_tests.sh --frontend   # frontend only
./run_tests.sh --no-build   # skip image rebuild
```

For local development without Docker:

```bash
# Backend
cd backend && npm install && npm test

# Frontend
cd frontend && npm install && npm test
```

Exit code `0` = all suites passed; non-zero = at least one failure.

## Seeded Credentials

The backend seeds one demo tenant and five accounts on first boot (skipped if any users exist). Credentials are also printed to the server log.

| Role | Username | Password | Scope |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin` | `Admin!ClinicOps1` | Global |
| **Clinic Manager** | `manager` | `Manager!ClinicOps1` | Demo Clinic |
| **Front Desk** | `frontdesk` | `FrontDesk!Clinic1` | Demo Clinic |
| **Finance Specialist** | `finance` | `Finance!ClinicOps1` | Demo Clinic |
| **Read-Only Auditor** | `auditor` | `Auditor!ClinicOps1` | Demo Clinic |

**Change all passwords after first login.**

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `JWT_SECRET` | dev fallback | HS256 signing secret — **must be rotated before production** |
| `CLINICOPS_AES_KEY` | dev fallback | Base64-encoded 32-byte AES-256-GCM key — **must be rotated before production** |
| `PORT` | `4000` | Backend listen port |
| `MONGO_URI` | — | MongoDB connection string. **Omit for development only — all data is lost on restart if unset in production.** |
| `NODE_ENV` | — | Set to `production` to enforce secret validation |
| `BCRYPT_ROUNDS` | `10` | bcrypt work factor |
| `LOGIN_RATE_WINDOW_MS` | `900000` | Rate-limit window for login endpoint |
| `LOGIN_RATE_MAX` | `10` | Max login attempts per window per IP |
| `DEFAULT_TENANT_TIMEZONE` | `UTC` | Fallback timezone for new tenants |

## Security Notes

* Passwords: bcrypt-hashed, minimum 12 characters with uppercase, lowercase, digit, and symbol requirements; 5-failure / 15-minute account lockout
* Tokens: HS256 JWT, 12-hour expiry, generation-based revocation (all tokens invalidated on password change)
* Sensitive fields (SSN/ID numbers): AES-256-GCM encrypted at rest (`v1:iv:tag:ct` envelope); server masks before returning to client
* Audit log: SHA-256 hash-chained; tampering detected by `GET /api/reports/audit/verify`
* Tenant isolation: enforced at both middleware and service layers on every query
* Rate limiter uses an in-process counter; replace with a Redis store (`rate-limit-redis`) for multi-process deployments
