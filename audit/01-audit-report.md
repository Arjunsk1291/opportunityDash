# Codebase Audit Report
**Generated**: 2026-06-16  
**Scope**: Full stack — React frontend, Express/Node backend, MongoDB, Render + Lightsail deployments  
**Status**: Phase 1 complete. No code changes made yet.

---

## System Architecture Summary

### Stack
- **Frontend**: React 18, Vite + SWC, TanStack Query (configured but largely unused), Zustand, framer-motion, Tailwind + shadcn/ui + MUI v9 (dual UI system)
- **Backend**: Express (single monolithic `server.js`, ~8,500 lines), Mongoose + MongoDB Atlas
- **Auth**: Custom JWT session tokens stored in `sessionStorage`. No MSAL/OAuth active — comment stubs only
- **Realtime**: Server-Sent Events (SSE) for opportunity stream push; polling fallback every 5 minutes
- **Deployments**:
  - **Render**: `render.yaml` deploys frontend build + backend as a single Node process on a free plan. Port 3001. Nginx NOT used.
  - **Lightsail**: `docker-compose.yml` + `Dockerfile.frontend` + `nginx.conf` — separates frontend (nginx) and backend (Node). nginx proxies `/api/` to `backend:3001`.

### Data Flow
```
User browser
  → JWT session in sessionStorage (12h TTL, auto-refresh before expiry)
  → DataContext: fetch /api/opportunities (full or lite view per route)
  → SSE stream /api/opportunities/stream (keep-alive push, reconnect backoff 2.5s→30s)
  → Permissions: /permissions/bootstrap + /permissions/v2 polled every 30s + on focus/visibility
  → Background refresh: every 5 minutes (setInterval), on tab re-focus
  → sessionStorage cache: 10-minute TTL, hydrated before first fetch
```

### Key Files
| Path | Role |
|------|------|
| `src/contexts/DataContext.tsx` | All opportunity data fetching, caching, SSE |
| `src/contexts/AuthContext.tsx` | Auth state, JWT handling, permissions polling |
| `src/App.tsx` | Routing, lazy loading, QueryClient config |
| `backend/server.js` | Full backend: ~8500 lines, all routes in one file |
| `nginx.conf` | Lightsail nginx config (proxies /api/) |
| `render.yaml` | Render deployment config |

---

## HIGH PRIORITY FAULTS

---

### H-1: Render YAML has hardcoded MongoDB credentials
**File**: `render.yaml:9-10`  
**Severity**: Critical security

```yaml
- key: MONGODB_URI
  value: mongodb+srv://avenir:13Avenir2025%40@avenirapproval.irpnuud.mongodb.net/opportunity-dashboard
```

**Root cause**: The connection string with plaintext credentials is committed directly to the repo. Anyone with read access to the git repository has full MongoDB access, including the ability to drop the database or read all data.

**Fix**: Remove from `render.yaml`. Set `MONGODB_URI` as a secret environment variable in Render's dashboard (not in the YAML file). The YAML should reference it as a secret reference, not inline value.

---

### H-2: `verifyToken` middleware hits MongoDB on EVERY authenticated request — no caching
**File**: `backend/server.js:2643`  
**Severity**: High performance

```js
const user = await AuthorizedUser.findOne({ email: username });
```

Every single authenticated API call does a MongoDB round-trip to validate the user. On Render free tier with MongoDB Atlas (likely cross-region), each lookup costs 20-80ms minimum. Since the frontend fires multiple concurrent requests on page load (permissions bootstrap + v2 + opportunities + telecast config), that's 4-8 serial or parallel MongoDB user-lookups per user action.

**Root cause**: No in-memory session cache. The JWT is already cryptographically verified before line 2643, so the MongoDB lookup is only needed to check if the user is still `approved` (not `rejected`/`pending`/deleted). This changes rarely.

**Fix**: Add a short TTL in-memory cache (Map) keyed by email. Cache the user record for 60-120 seconds. On logout or role change, invalidate. This eliminates the per-request DB lookup for the hot path. The cache doesn't need to be persistent — process restart clears it automatically.

---

### H-3: `refreshData` captures `location.pathname` in closure — causes double-fetch on every navigation
**File**: `src/contexts/DataContext.tsx:172-379`  
**Severity**: High — UX latency

The `refreshData` function has `location.pathname` in its `useCallback` dependency array (line 372). Every route change creates a new `refreshData` function. The `useEffect` at line 381 depends on `[refreshData, location.pathname, token, isAuthLoading]`, so it fires twice per navigation: once because `location.pathname` changed, and again because `refreshData` (a new function reference) changed.

This is a guaranteed double-fetch on every navigation. On the second fetch, the `inFlightRefreshRef` dedup guard at line 173 catches the concurrent call — but only if the first hasn't resolved yet. If it has, both fetches complete and state is set twice.

**Root cause**: The route view (`lite` vs `full`) logic needed `location.pathname`, so it was baked into the closure. This could be extracted as a `useRef` that tracks current view without triggering re-renders.

**Fix**: Move `getOpportunityViewForRoute(location.pathname)` into a `useRef` updated in a separate effect. Pass the view explicitly to the fetch logic rather than reading it from the closure.

---

### H-4: nginx.conf missing SSE-critical proxy settings — SSE stream dies on Lightsail
**File**: `nginx.conf`  
**Severity**: High — SSE broken on Lightsail deployment

Current config:
```nginx
location /api/ {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Missing:
- `proxy_buffering off;` — nginx buffers the SSE response body by default. Events won't reach the client until nginx's internal buffer fills or the connection closes.
- `proxy_read_timeout 3600s;` — default is 60s. An idle SSE connection will be killed after 60 seconds. The backend sends keep-alive pings every 25s (`server.js:616`), which prevents the 60s timeout — but only if nginx passes the ping through (it won't if buffering is on).
- `proxy_cache_bypass 1;` — prevents any caching of the SSE stream

**Impact**: On Lightsail, the `DataContext` SSE stream at `/api/opportunities/stream` will connect, receive the initial `ready` event (if the buffer happens to flush), and then go silent. The client will see no live updates, and will reconnect every 2.5-30 seconds indefinitely.

**Fix**: Add dedicated SSE location block:
```nginx
location /api/opportunities/stream {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    chunked_transfer_encoding on;
}
```

---

### H-5: Permissions re-fetched every 30 seconds + every window focus + every tab switch
**File**: `src/contexts/AuthContext.tsx:449-473`  
**Severity**: High — unnecessary load, noisy network

```js
const intervalId = window.setInterval(refresh, PERMISSIONS_REFRESH_INTERVAL_MS); // every 30s
document.addEventListener('visibilitychange', onVisibilityChange); // every tab focus
window.addEventListener('focus', onFocus); // every window focus
window.addEventListener('app:config-updated', onConfigUpdated); // each config change
```

Each `refresh()` call fires 2 concurrent requests: `/permissions/bootstrap` + `/permissions/v2`. Each of those hits `verifyToken` (MongoDB lookup per H-2). With H-2 unresolved, that's 4+ DB queries every 30 seconds per active user.

The permissions system (`loadPermissionsBundle`) has a dedup guard (`permissionsRefreshRef`), but it clears itself in `.finally()`. If two events fire close together (e.g., `focus` + `visibilitychange` simultaneously), both may bypass the guard before the first resolves.

**Root cause**: The interval was set to 30s for reactive permission changes in a multi-admin environment. The focus/visibility refresh is reasonable, but 30s polling is excessive and duplicates it.

**Fix**: Change `PERMISSIONS_REFRESH_INTERVAL_MS` to 5-10 minutes. Keep the `focus`/`visibilitychange` refresh for immediate response. The polling interval is the redundant layer.

---

## MEDIUM PRIORITY FAULTS

---

### M-1: Fake progress counter misleads users — no connection to actual data loading
**Files**: `src/lib/useProgressLoader.ts`, `src/hooks/useTrackedAction.ts`, `src/components/PageLoader.tsx`

`useProgressLoader` ramps from 12% to 90% based on elapsed time intervals with no connection to network progress. `useTrackedAction` does the same (5% → 85% via `setInterval`). Both display a percentage counter that the user interprets as "X% of data loaded."

This is false. At 87%, the backend may not have responded yet. At 12%, the page may already be fully rendered.

The `PageLoader` specifically fires `useProgressLoader(true, ...)` permanently while the Suspense fallback is shown. The timer ramps to 90% and stays there indefinitely if the chunk download stalls (mobile/slow connection). The warning at `useProgressLoader.ts:29` fires after 5s — purely in console, never surfaced to the user.

**Root cause**: Progress % is a UI comfort pattern designed to mask loading delays. The implementation is honest about this in comments ("UI-only progress for async actions where backend does not provide true %"). The problem is the % number. A spinner or skeleton conveys "loading" without the false specificity.

**Fix option A (minimal)**: Replace the `{Math.round(pct)}%` number in `PageLoader.tsx` with no number — just the spinner and "Loading page…" text. The progress bar can stay for aesthetic continuity.

**Fix option B (correct)**: Remove `useProgressLoader` from `PageLoader` entirely. Use `<Skeleton>` variants since the page content shape is known per route.

---

### M-2: `GET /api/opportunities` lacks action permission check — inconsistency with sibling routes
**File**: `backend/server.js:6904`

```js
app.get('/api/opportunities', verifyToken, async (req, res) => {
```

`/api/opportunities/changes` (line 6936) and `/api/opportunities/stream` (line 6975) both call `requireActionPermission(req, res, 'opportunities_view')`. The main list endpoint does not. A `TempUser` with zero `allowedPages` can call `/api/opportunities` directly and receive all data.

**Fix**: Add `if (!await requireActionPermission(req, res, 'opportunities_view')) return;` immediately after the `isDatabaseReady()` check.

---

### M-3: Dashboard fires separate `fetch` on every mount to get telecast config
**File**: `src/pages/Dashboard.tsx:630-636`

```js
useEffect(() => {
  if (!token) return;
  fetch(`${import.meta.env.VITE_API_URL || '/api'}/telecast/config`, ...)
    .then(...)
}, [token]);
```

`token` is stable after login (doesn't change). But `Dashboard` unmounts/remounts on every navigation away and back. So every dashboard visit fires an additional request. The config response is not cached anywhere.

**Fix**: Move telecast config into the `DataContext` or a dedicated `useQuery` (TanStack Query is already installed and configured) with a long `staleTime`.

---

### M-4: `OPPORTUNITY_LITE_PROJECTION` vs `FULL_PROJECTION` — lite only excludes `rawGraphData` + `updateHistory`
**File**: `backend/server.js:575-584`

```js
const OPPORTUNITY_LITE_PROJECTION = {
  rawGoogleData: 0,
  rawGraphData: 0,
  updateHistory: 0,
};

const OPPORTUNITY_FULL_PROJECTION = {
  rawGoogleData: 0,
};
```

The "lite" view only removes 2 fields (`rawGraphData` and `updateHistory`) compared to full. If `rawGraphData` and `updateHistory` are large fields, the savings are meaningful. But if they're small or empty, the "lite" optimization provides no real bandwidth reduction. The client-side logic to pick `lite` vs `full` by route adds complexity for potentially no gain.

**Recommendation**: Measure average document sizes with and without these fields. If the size delta is <10%, remove the `lite`/`full` split to simplify the code.

---

### M-5: Double `Suspense` boundary around lazy routes
**File**: `src/App.tsx:73, 108`

```jsx
// AppLayout (line 73):
<Layout>
  <Suspense fallback={<PageLoader />}>
    <Outlet />
  </Suspense>
</Layout>

// AppRoutes (line 108):
<Suspense fallback={<PageLoader />}>
  <Routes>
    ...
    <Route element={<AppLayout />}> ... </Route>
  </Routes>
</Suspense>
```

The outer `Suspense` at line 108 wraps the `Routes` tree including `AppLayout`. The inner `Suspense` at line 73 wraps `<Outlet>` inside `AppLayout`. Both have `<PageLoader />` as fallback.

React resolves Suspense from the innermost boundary. When a lazy route chunk loads, the inner `Suspense` catches it first. The outer `Suspense` only fires if the lazy load happens before `AppLayout` mounts (very unlikely). The outer is effectively dead code.

**Fix**: Remove the outer `Suspense` at line 108 in `AppRoutes`.

---

### M-6: `Opportunities.tsx:105` — `loadConflicts` called in `useEffect` without memoization
**File**: `src/pages/Opportunities.tsx:87-105`

`loadConflicts` is a plain `async function` (not `useCallback`). The `useEffect` at line 105 has `[token, canEdit]` as dependencies. If `canEdit` is derived from permission state that re-renders AuthContext (which it does every 30s per H-5), the `useEffect` re-fires every 30 seconds, reloading conflicts unnecessarily.

**Fix**: Memoize `loadConflicts` with `useCallback([token, canEdit])`. Then `eslint-plugin-react-hooks` will correctly track it.

---

## LOW PRIORITY ISSUES

---

### L-1: KPI diagnostics `localStorage` fallback to `sessionStorage` breaks cross-tab reads
**File**: `src/pages/Dashboard.tsx:577-619`

When `localStorage` is full, `tryStoreKpiDiagnostics` falls back to `sessionStorage`. The diagnostics open in a **new tab** via `window.open(...)`. New tabs have separate `sessionStorage` but share `localStorage`. So if the fallback fires, the new tab opens `/kpi-diagnostics?report=XXX` and finds nothing in its own `sessionStorage`.

**Fix**: Always try `sessionStorage` first as the fallback, or pass the report data inline (e.g., `window.postMessage` after the tab opens, or use `BroadcastChannel`).

---

### L-2: Auth error banner renders into the document flow — not a portal
**File**: `src/contexts/AuthContext.tsx:684-700`

```jsx
{authError && (
  <div role="alert" style={{ ... }}>
    Auth service unavailable
  </div>
)}
{children}
```

This renders the error banner as the first DOM child, pushing all children down. It's not a toast or overlay. If auth fails mid-session while viewing a complex page, the layout shifts abruptly.

**Fix**: Use a `toast` (Sonner is already installed) or an overlay. Don't render inline in the AuthProvider.

---

### L-3: Typo in Dashboard — "Recieved" instead of "Received"
**File**: `src/pages/Dashboard.tsx:1293`

```jsx
<p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Recieved</p>
```

---

### L-4: `TenderSpreadsheetV2` redirects to `/opportunities` — dead page that still builds as a lazy chunk
**File**: `src/App.tsx:139`

```jsx
<Route path="tender-spreadsheet-v2" element={<Navigate to="/opportunities" replace />} />
```

But `TenderSpreadsheetV2` is still imported as a lazy page:
```js
// NOT imported — checked. This is a false alarm from the route file.
```

Actually `TenderSpreadsheetV2` is not imported in App.tsx. But the redirect still needlessly exists. Minor cleanup.

---

### L-5: React Query configured but used for nothing meaningful
**File**: `src/App.tsx:59-68`

```js
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000, ... }
  }
});
```

TanStack Query v5 is installed and configured, but almost no data fetching uses it. All data fetching is done manually in `DataContext`, `AuthContext`, and component-level `useEffect` + `fetch`. The QueryClient exists but its cache is empty.

This means all the benefits of React Query (deduplication, background refresh, cache, devtools) are bypassed.

**Not a bug**, but architectural dead weight. Either use React Query for fetching, or remove it.

---

### L-6: `server.js` is 8,500+ lines — single monolithic file
**Structural issue, not a bug**. All routes, middleware, services, models, background jobs, mail sending, SSE, and startup logic are in one file. This makes it:
- Hard to audit (can't read in one pass)
- Easy to introduce regressions when editing unrelated sections
- Hard to test individual routes

Not requesting a refactor now, but flagging for future work.

---

### L-7: `render.yaml` sets `VITE_API_URL` as a backend env var — has no effect
**File**: `render.yaml:16-17`

```yaml
- key: VITE_API_URL
  value: https://opportunitydash.onrender.com/api
```

`VITE_API_URL` is a build-time Vite env variable. It's baked into the frontend bundle at build time (via `import.meta.env.VITE_API_URL`). Setting it as a runtime environment variable for the Node process (backend) has zero effect — `VITE_*` vars are only used during `vite build`.

The actual value is correctly embedded at build time via the `buildCommand` step. This entry is misleading but harmless.

---

## Root Cause Analysis

### Why does the app feel slow?

1. **On every navigation**: `refreshData` (new function reference) fires a full opportunities fetch. Combined with the permissions 30s poll potentially firing simultaneously, the backend receives bursts of 3-6 concurrent requests, each doing a MongoDB user lookup plus the main query. MongoDB Atlas free tier throttles concurrent connections.

2. **On page load**: Auth restore (`/api/auth/user`) → permissions bootstrap + v2 (concurrent) → opportunities fetch — all fire before the user sees anything. Each of these goes through `verifyToken` (DB lookup). On Render free tier, if the instance is cold, add 15-30s.

3. **Progress counters**: The fake % UI makes the slowness feel worse. When the user sees "87%" and the page still hasn't loaded, it feels broken — not just slow.

4. **SSE on Lightsail**: If nginx buffering is not disabled, SSE events never arrive. The client reconnects every 2.5→5→10→20→30s forever, generating a constant stream of authentication + SSE setup requests.

### Why do UI updates not reflect instantly?

The `upsertOpportunities` function in `DataContext.tsx` correctly does an optimistic local merge. But most mutations (`resolveConflict`, entry dialog saves) call `refreshData({ background: true })` AFTER the API call, which fetches a full or incremental update. This is correct behavior but has 200-800ms latency before the UI reflects the change.

The `upsertOpportunities` path (used in sheet upload and SSE push) IS instant because it merges into existing state without waiting. Mutations that go through `refreshData` instead of `upsertOpportunities` will always feel slower.

---

## Risk Assessment

| Finding | Risk if Unfixed |
|---------|----------------|
| H-1 (hardcoded credentials) | Database breach, data loss |
| H-2 (no auth cache) | Latency degrades with scale; DB throttling under load |
| H-3 (double-fetch on nav) | Users see stale flicker + unnecessary bandwidth |
| H-4 (nginx SSE broken) | Live updates dead on Lightsail; constant reconnect loop |
| H-5 (permissions poll) | Unnecessary backend load; user perceives random slowness |
| M-1 (fake progress %) | User confusion; perceived reliability issues |
| M-2 (missing permission check) | TempUser data leak |
| M-3 (dashboard fetch on mount) | Extra DB queries per visit |

---

## Uncertainties / Missing Context

1. **MongoDB Atlas cluster tier**: If Atlas is on a paid tier with multiple nodes and connection pooling, H-2 is less severe. On the free tier (M0), connection limits are 500 and can be hit with many concurrent users.

2. **Lightsail vs Render primary**: Which deployment is production? The `render.yaml` has Render as the explicit deployment target. If Lightsail is primary, the nginx SSE issue (H-4) is critical immediately.

3. **Are the SSE events from `/api/opportunities/stream` actually firing?** The backend maintains `opportunityStreamClients` (server.js:591) and `publishOpportunityEvent` (line 594). But I don't see where `publishOpportunityEvent` is called from the data mutation paths (sheet upload, manual entry, sync). If nothing calls it, SSE is a keep-alive-only connection that never sends real data.

4. **`rawGraphData` field sizes**: Without knowing actual document sizes, the lite/full projection savings are unknown (M-4).
