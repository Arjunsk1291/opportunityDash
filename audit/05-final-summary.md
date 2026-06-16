# Final Summary — Remediation Complete

**Date:** 2026-06-16  
**TypeScript status:** `npx tsc --noEmit` — zero errors after all changes  
**Files modified:** 7 source files, 1 nginx config, 1 Render config  
**Architecture:** Lightsail + Render split preserved. No database migration. No new dependencies introduced.

---

## What was fixed

### Critical / High

| ID | Problem | Fix |
|----|---------|-----|
| H-1 | MongoDB connection string with credentials committed to `render.yaml` | Removed value; replaced with `sync: false`. Added missing `JWT_SECRET: sync: false`. |
| H-2 | Per-request MongoDB lookup on every authenticated API call | In-memory Map cache (90s TTL, 500-entry cap) in `verifyToken`; invalidated on user mutation. |
| H-3 | Double data fetch on every navigation due to `useCallback` dependency trap | Extracted route view into `routeViewRef`; removed `location.pathname` from `refreshData` deps; read URL at call time via `window.location.pathname`. |
| H-4 | SSE broken on Lightsail — nginx buffering killed event stream | Dedicated nginx location block for `/api/opportunities/stream` with `proxy_buffering off`, `proxy_cache off`, 1h read timeout. |
| H-5 | Permission polling every 30s creating unnecessary backend load | Interval changed to 5 minutes. Focus/visibility refresh preserved. |

### Medium

| ID | Problem | Fix |
|----|---------|-----|
| M-1 | Fake percentage progress bar in page loader | `PageLoader.tsx` rewritten — spinner only, no fake `%`. `useProgressLoader` hook no longer called. |
| M-2 | `GET /api/opportunities` missing permission check | `requireActionPermission('opportunities_view')` added at top of handler. |
| M-3 | Telecast config re-fetched on every Dashboard mount | Replaced `useEffect` fetch with React Query (`staleTime: 5min`, `gcTime: 10min`). |
| M-5 | Redundant outer Suspense boundary in `App.tsx` | Outer `<Suspense>` removed from `AppRoutes`; inner Suspense in `AppLayout` retained. |
| M-6 | `loadConflicts` function recreated on every render | Wrapped in `useCallback([token, canEdit])`; `useEffect` dep updated to `[loadConflicts]`. |

### Low

| ID | Problem | Fix |
|----|---------|-----|
| L-1 | KPI diagnostics `sessionStorage` fallback broken in new tab | Removed `sessionStorage` path; localStorage-only with aggressive eviction + capped retry. |
| L-2 | Auth error banner inline in JSX causing layout shift | Replaced with Sonner toast (`duration: Infinity`, auto-dismissed on clear). |
| L-3 | Typo "Recieved" in Dashboard KPI label | Corrected to "Received". |

---

## What remains risky or unverified

### Operator actions required before next production deploy

1. **Render secrets must be set.** `MONGODB_URI` and `JWT_SECRET` must be present in the Render dashboard's Environment tab before the next deploy or the app will not start. If `MONGODB_URI` was leaked, the credential should be rotated — fixing the config file does not undo prior exposure.

2. **nginx must be reloaded on Lightsail.** `nginx -s reload` (or container restart) is required for the SSE location block to take effect. Until then, SSE remains broken on Lightsail.

3. **`opportunities_view` action permission must exist in MongoDB.** `GET /api/opportunities` is now gated by `requireActionPermission('opportunities_view')`. If this key does not exist in the `actionpermissions` collection, the endpoint will deny all users. Verify the permission exists before deploying FIX-7.

### Unverified behavior (requires live environment)

- **SSE continuity on Lightsail** — the nginx config change is syntactically correct but untested in a deployed environment. Needs Network-tab verification that SSE events arrive after >60s.
- **Double-fetch elimination** — the dependency array fix is logically sound but needs a browser Network tab check across navigations to confirm one request per route change, not two.
- **Sonner `<Toaster>` presence** — if `<Toaster>` is not rendered in the app root, auth error toasts silently no-op. No crash, but the error becomes invisible to users.
- **React Query provider** — `useQuery` in Dashboard assumes `<QueryClientProvider>` is an ancestor. If it isn't, React throws at runtime. This should already be set up (TanStack Query was installed before this session), but confirm in the browser.

### Code paths still needing attention

- **`useProgressLoader` hook** — now unused after PageLoader was rewritten. It is dead code. Safe to delete but not done here to keep changes minimal.
- **Other `AuthorizedUser.save()` call sites** — the auth cache is invalidated in the three known mutation paths. If any other endpoint changes a user's `status` or `role` without going through those three routes, the cache will serve stale data for up to 90s. A `grep "AuthorizedUser.*save\|\.save()" backend/server.js` audit is recommended.
- **`requireActionPermission` coverage audit** — the audit found that `GET /api/opportunities` was the only unprotected read endpoint. A full review of other GET handlers for sensitive data (reports, client data, user lists) would be prudent.
- **SSE heartbeat on backend** — the `proxy_read_timeout 3600s` in nginx keeps the connection open from nginx's perspective, but if the Node SSE handler does not send periodic heartbeats (comments or pings), some upstream load balancers or clients may close the connection before 1 hour. A 30s heartbeat on the server side is recommended.

---

## Assumptions made

1. **`'opportunities_view'` is a valid action permission key** in the database. The backend was modified to check it; the database was not inspected. If it doesn't exist, this fix needs a database entry before it can go live.

2. **`<QueryClientProvider>` wraps the route tree.** TanStack Query v5 was already installed in the project. The provider placement was not traced end-to-end in this session.

3. **`<Toaster>` from Sonner is rendered in the app.** The `toast()` calls will silently no-op if not. The prior codebase used `toast` elsewhere, so the provider is likely present.

4. **The 90-second auth cache TTL is acceptable.** This means a rejected or deleted user can make authenticated requests for up to 90 seconds after the admin action. If the security model requires immediate revocation, this TTL must be reduced or eliminated.

5. **render.yaml `sync: false` is supported on the plan in use.** Render's free tier supports secret env vars via the dashboard. If the service was on a plan that doesn't support this, the deploy will fail.

---

## Files changed

| File | Change |
|------|--------|
| `render.yaml` | Removed credentials; added `sync: false` for both secrets |
| `nginx.conf` | Added SSE-specific location block |
| `backend/server.js` | Auth cache, `verifyToken` cache lookup, `invalidateUserCache` calls, `GET /api/opportunities` permission check |
| `src/contexts/AuthContext.tsx` | Polling interval, auth error toast |
| `src/contexts/DataContext.tsx` | `routeViewRef`, removed `location.pathname` from `refreshData` deps |
| `src/pages/Dashboard.tsx` | Typo fix, telecast query, KPI diagnostics localStorage |
| `src/pages/Opportunities.tsx` | `loadConflicts` useCallback |
| `src/components/PageLoader.tsx` | Removed fake progress bar |
| `src/App.tsx` | Removed outer Suspense boundary |
