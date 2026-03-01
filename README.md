# Opportunity Dashboard

A full-stack tender/opportunity management dashboard with role-based access, approval workflows, Microsoft Graph Excel sync, and admin operations.

---

## Table of Contents
- [1) What this repository contains](#1-what-this-repository-contains)
- [2) Tech stack](#2-tech-stack)
- [3) Project structure walkthrough](#3-project-structure-walkthrough)
- [4) Local development setup](#4-local-development-setup)
- [5) Environment variables](#5-environment-variables)
- [6) Running the app](#6-running-the-app)
- [7) Core application flows](#7-core-application-flows)
- [8) Admin & Telecast workflow](#8-admin--telecast-workflow)
- [9) Data sync (Microsoft Graph Excel)](#9-data-sync-microsoft-graph-excel)
- [10) API/backend notes](#10-apibackend-notes)
- [11) Frontend architecture notes](#11-frontend-architecture-notes)
- [12) Common scripts](#12-common-scripts)
- [13) Troubleshooting guide](#13-troubleshooting-guide)
- [14) Contribution guidelines](#14-contribution-guidelines)

---

## 1) What this repository contains

This repo has:
- A **React + TypeScript frontend** (Vite, Tailwind, shadcn/ui).
- A **Node.js/Express backend** connected to MongoDB.
- Role-based access with user authorization + approval flow.
- Admin tools for data sync, user management, navigation permissions, logs, and notifications.

Main use-case:
- Track opportunities/tenders from Excel/Graph source.
- Review status, value, timelines, approvals.
- Notify groups and stakeholders when new rows are detected.

---

## 2) Tech stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui + Radix components
- React Router
- TanStack Query

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Microsoft Graph integration for Excel sync
- JWT auth and role/permission checks

---

## 3) Project structure walkthrough

```text
.
├─ src/
│  ├─ components/              # Reusable UI and feature components
│  │  ├─ Admin/                # Admin panel widgets (access, sync, monitoring, telecast)
│  │  ├─ Dashboard/            # KPI cards, filters, table, charts
│  │  └─ ui/                   # Base UI primitives (button, dialog, table, etc.)
│  ├─ contexts/                # App state/context providers (Auth, Data, Currency, Approval)
│  ├─ pages/                   # Route pages (Dashboard, Opportunities, Clients, Admin, etc.)
│  ├─ services/                # Frontend service helpers / API wrappers
│  ├─ config/                  # Navigation and auth configuration
│  └─ main.tsx                 # Frontend entry point
│
├─ backend/
│  ├─ models/                  # Mongoose models (users, approvals, config, logs)
│  ├─ services/                # Sync / graph / crypto / bootstrap services
│  ├─ server.js                # Main API server and route handlers
│  └─ package.json             # Backend dependencies/scripts
│
├─ public/                     # Static assets
├─ index.html                  # HTML shell/meta
└─ README.md
```

---

## 4) Local development setup

### Prerequisites
- Node.js 18+
- npm 9+
- MongoDB instance (local or hosted)

### Install dependencies
```bash
npm install
cd backend && npm install
```

---

## 5) Environment variables

Set frontend env in root `.env` (example values):

```bash
VITE_API_URL=http://localhost:5000/api
VITE_DEFAULT_SERVICE_ACCOUNT=tender-notify@yourdomain.com
```

Set backend env in `backend/.env`:

```bash
PORT=5000
MONGODB_URI=mongodb://localhost:27017/opportunity-dashboard
JWT_SECRET=replace_with_secure_secret

# Microsoft Graph
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
```

If telecast/delegated auth is enabled in your environment, keep all credentials server-side.

---

## 6) Running the app

### Terminal 1: backend
```bash
cd backend
npm run start
```

### Terminal 2: frontend
```bash
npm run dev
```

Frontend default: `http://localhost:5173`  
Backend default: `http://localhost:5000`

---

## 7) Core application flows

### Authentication and routing
- Users authenticate and receive app role context.
- Page visibility is role-driven (Master/Admin/ProposalHead/SVP/Basic).

### Dashboard and Opportunities
- Dashboard aggregates KPIs and charts.
- Opportunities page provides advanced filters + table.
- Clicking a table row opens a focused detail modal with table-aligned fields.

### Approval flow
- Approval context tracks proposal head and SVP approval state.
- Opportunity table displays approval state and actions based on role permissions.

---

## 8) Admin & Telecast workflow

Admin page includes:
- Authorized user management (add/remove/change role/group).
- Navigation permission management by role.
- Sync controls and collection stats.
- Telecast configuration:
  - Template subject/body
  - Group recipients (GES/GDS/GTS)
  - Recipient picker with search + manual add
  - Test mail trigger

Telecast recipients are normalized to lowercase arrays to avoid duplicate/formatting issues.

---

## 9) Data sync (Microsoft Graph Excel)

Typical setup flow:
1. Open Admin panel as Master/Admin.
2. Configure share link, drive/file IDs, worksheet, range.
3. Preview rows and verify mapping.
4. Save config.
5. Trigger sync.

System stores sync config and periodically checks for changes/new rows.

---

## 10) API/backend notes

Key backend concerns in `backend/server.js`:
- Auth middleware and role checks
- User authorization endpoints
- Opportunity stats/sync endpoints
- Notification/telecast endpoints
- System config persistence

Models under `backend/models` include:
- `AuthorizedUser`
- `SystemConfig`
- `Approval` / `ApprovalLog`
- `LoginLog`
- `SyncedOpportunity`

---

## 11) Frontend architecture notes

- `src/contexts/AuthContext.tsx`: auth state, role helpers, page permissions.
- `src/contexts/DataContext.tsx`: opportunity data lifecycle.
- `src/components/Dashboard/OpportunitiesTable.tsx`: table UI + row selection.
- `src/pages/Opportunities.tsx` + `src/pages/Dashboard.tsx`: detail modal rendering.
- `src/pages/Admin.tsx`: admin operations and telecast configuration.

---

## 12) Common scripts

From repo root:

```bash
npm run dev      # Start frontend dev server
npm run build    # Build frontend for production
npm run lint     # Lint frontend
npm run preview  # Preview production build
```

Backend scripts (inside `backend/`):

```bash
npm run start
```

---

## 13) Troubleshooting guide

### Build passes but UI looks stale
- Restart dev server.
- Hard refresh browser (Ctrl/Cmd + Shift + R).

### No data in dashboard
- Verify backend is running.
- Check MongoDB connection and seeded/synced data.
- Trigger sync from Admin panel.

### Graph sync failing
- Confirm tenant/client credentials.
- Re-check worksheet name and data range.
- Ensure permissions are consented in the tenant.

### Approval actions disabled
- Confirm logged-in user role and assigned group.
- Check page permission settings in Admin.

---

## 14) Contribution guidelines

1. Create a focused branch for each feature/fix.
2. Keep UI changes consistent with existing Tailwind patterns.
3. Run `npm run build` and `npm run lint` before opening PR.
4. Include screenshots for visible frontend changes.
5. Prefer small, reviewable commits.

---

## License

This repository is private/internal unless stated otherwise by the project owner.
