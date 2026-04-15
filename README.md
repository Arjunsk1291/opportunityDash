# Opportunity Dashboard

Avenir's Opportunity Dashboard is a full-stack platform for managing tender opportunities end-to-end, including:

- opportunity ingestion and sync from Microsoft Graph Excel
- role-based approval workflows
- analytics and KPI monitoring
- filtering, export, and reporting
- operational monitoring for sync and data health

## Architecture

The application is built as a 3-tier stack:

1. Frontend
- React + TypeScript + Vite + Tailwind
- Served in production by Nginx
- Calls backend via `/api/*`

2. Backend
- Node.js + Express
- MongoDB via Mongoose
- Handles auth, approvals, data sync, report generation, and admin operations

3. Database
- MongoDB 7
- Stores opportunities, approvals, users, logs, and system configuration

## Repository Structure

- `src/`: frontend app
- `backend/`: backend API and data services
- `public/`: static web assets
- `docker-compose.yml`: local full-stack orchestration
- `Dockerfile.frontend`: frontend production image (build + nginx)
- `backend/Dockerfile`: backend runtime image
- `nginx.conf`: frontend web server and API reverse proxy config

## Prerequisites (Non-Docker)

- Node.js 20+ (tested with Node 22)
- npm 10+
- MongoDB 7 (local or remote)

## Local Development

1. Install frontend dependencies

```sh
npm install
```

2. Install backend dependencies

```sh
cd backend
npm install
cd ..
```

3. Configure environment

Create `backend/.env` and set required values.

4. Run frontend

```sh
npm run dev
```

5. Run backend

```sh
cd backend
npm run dev
```

Default local URLs:

- frontend: `http://localhost:8080`
- backend: `http://localhost:3001`

## Backend Environment Variables

Set these in `backend/.env` (or your deployment environment):

Core:

- `PORT` (default `3001`)
- `MONGODB_URI` (example: `mongodb://localhost:27017/opportunity-dashboard`)
- `SESSION_JWT_SECRET` (required in production; long random value)
- `SESSION_TOKEN_TTL` (default `12h`)
- `ALLOW_LEGACY_EMAIL_BEARER` (`false` in production)
- `REQUEST_BODY_LIMIT` (default `10mb`)
- `GRAPH_BOOTSTRAP_ALLOWED_USERS` (comma-separated allowlist for delegated bootstrap login)

Microsoft Graph / Excel Sync:

- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `GRAPH_SHEETS_SHARE_LINK` (optional default link)

Optional debug flags:

- `MAIL_DEBUG=true|false`
- `NOTIFICATION_DEBUG=true|false`
- `GRAPH_TOKEN_DEBUG=true|false`

## Docker Deployment (Recommended)

This repository includes production-like Docker setup for frontend + backend + MongoDB.

### Start stack

```sh
docker compose up --build -d
```

### Stop stack

```sh
docker compose down
```

### Stop and remove volumes

```sh
docker compose down -v
```

### Services and ports

- frontend: `http://localhost:8080`
- backend: `http://localhost:3001`
- mongo: `mongodb://localhost:27017`

Port overrides supported by compose env:

- `FRONTEND_PORT` (default `8080`)
- `BACKEND_PORT` (default `3001`)
- `MONGO_PORT` (default `27017`)

### Health checks

- frontend container: `GET /`
- backend container: `GET /healthz`
- backend DB-aware health: `GET /api/health`
- mongo container: `db.adminCommand('ping')`

Verification commands:

```sh
docker compose ps
docker compose logs -f backend frontend mongo
```

## API Routing and Reverse Proxy

In container mode:

- frontend serves static SPA assets
- Nginx proxies `/api/*` requests to backend service
- backend handles all API endpoints under `/api`

This allows a single browser origin while keeping backend isolated.

## Authentication and Access Model

The backend uses token-based verification and role checks for protected routes.

High-level roles in the system:

- master/admin control
- proposal head approvals
- SVP approvals (group-scoped)
- authorized user access

Most sensitive endpoints require token verification middleware.

## Approval Workflow Overview

Typical approval states:

1. pending proposal head approval
2. proposal head approved
3. awaiting SVP approval
4. fully approved
5. master revert support (if enabled by role)

Approvals and logs are persisted in MongoDB.

## Microsoft Graph Sync Flow

1. Open admin sync panel
2. resolve workbook share link
3. select worksheet and data range
4. preview and validate mapping
5. save Graph sync configuration
6. run manual sync or scheduled auto-sync

If delegated token bootstrap is configured, backend can use delegated auth with refresh token encryption. Otherwise application token fallback may be used depending on configuration.

## Reporting and Export

The dashboard supports:

- CSV/Excel exports from filtered opportunities
- report document generation from summary + funnel + client metrics

## Build and Quality Commands

Frontend:

```sh
npm run lint
npm run build
```

Backend syntax check:

```sh
node --check backend/server.js
```

## Troubleshooting

1. Frontend loads but API fails
- check backend container logs
- verify `/api/health` returns `ok: true`
- confirm Nginx proxy is active and backend is healthy

2. Mongo connection failure
- validate `MONGODB_URI`
- verify mongo service/container status
- confirm network reachability between backend and mongo

3. Graph sync access errors
- verify app registration permissions and tenant consent
- validate workbook/site access scope
- confirm sync config fields (drive ID, file ID, worksheet)

4. Authentication issues
- ensure token headers are present from frontend requests

## Lightsail Quick Launch

If you want a fast production boot after cloning, use one of these two paths.

### Option A: Docker on Lightsail (easiest)

1. Clone repo and enter it.
2. Create `backend/.env` with production values (minimum):
   - `PORT=3001`
   - `MONGODB_URI=mongodb://mongo:27017/opportunity-dashboard`
   - `SESSION_JWT_SECRET=<long-random-secret>`
   - `ALLOW_LEGACY_EMAIL_BEARER=false`
   - `REQUEST_BODY_LIMIT=10mb`
   - Graph vars (`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`)
   - Optional delegated safety: `GRAPH_BOOTSTRAP_ALLOWED_USERS=service.user@yourdomain.com`
3. Run:

```sh
docker compose up --build -d
```

4. Verify:

```sh
docker compose ps
curl http://127.0.0.1:3001/healthz
```

### Option B: Node + local Mongo on Lightsail

1. Install Node 20+ and MongoDB 7.
2. Clone repo.
3. Create `backend/.env` with:
   - `PORT=3001`
   - `MONGODB_URI=mongodb://127.0.0.1:27017/opportunity-dashboard`
   - `SESSION_JWT_SECRET=<long-random-secret>`
   - `ALLOW_LEGACY_EMAIL_BEARER=false`
   - Graph vars + optional `GRAPH_BOOTSTRAP_ALLOWED_USERS`
4. Install + build + run:

```sh
npm install
cd backend && npm install && cd ..
npm run build
node backend/server.js
```

5. Serve frontend build using Nginx (recommended), reverse-proxy `/api` to `127.0.0.1:3001`.

Security note for Lightsail:
- Keep MongoDB private/local only (`bindIp: 127.0.0.1` or private subnet), never publicly exposed.
- verify `JWT_SECRET` consistency in backend runtime

## Security Notes

- keep all secrets server-side only
- do not commit `backend/.env`
- rotate Graph and JWT secrets periodically
- apply least-privilege Graph permissions

## Browser Branding

Legacy scaffold branding has been removed from this repository's user-facing surfaces:

- browser tab title
- meta description/author tags
- Open Graph and Twitter metadata
- favicon now uses project branding (`public/favicon.svg`)

## License and Ownership

Internal project for Avenir opportunity operations. Follow your organization's standard code, security, and release governance policies.
