# Remediation Plan
**Generated**: 2026-06-16  
**Based on**: `01-audit-report.md`  
**Approach**: Smallest reversible changes first. Each fix is self-contained. Verify before moving to the next.

---

## Fix Order

```
FIX-1  (H-1)  Remove hardcoded credentials from render.yaml          [5 min]  [SECURITY]
FIX-2  (H-4)  Fix nginx.conf SSE proxy settings                      [10 min] [LIGHTSAIL]
FIX-3  (L-3)  Fix "Recieved" typo                                    [1 min]  [COSMETIC]
FIX-4  (H-5)  Reduce permissions polling from 30s to 5 min           [5 min]  [PERF]
FIX-5  (H-2)  Add in-memory user cache to verifyToken                [30 min] [PERF]
FIX-6  (H-3)  Fix double-fetch on navigation in DataContext           [45 min] [PERF]
FIX-7  (M-2)  Add missing permission check to GET /api/opportunities  [5 min]  [SECURITY]
FIX-8  (M-1)  Remove fake % counter from PageLoader                  [10 min] [UX]
FIX-9  (M-3)  Cache telecast config in Dashboard                     [15 min] [PERF]
FIX-10 (M-5)  Remove outer Suspense wrapper in AppRoutes             [5 min]  [CLEANUP]
```

---

## FIX-1: Remove hardcoded MongoDB credentials from render.yaml

**Finding**: H-1  
**Risk of fix**: Low — Render will use the env var set in the dashboard instead. If not set in dashboard, the deploy will fail (which is correct — it should fail before exposing credentials in code).

**Before**: `render.yaml:9-10` has `MONGODB_URI` with full credentials inline.

**After**: Remove the `MONGODB_URI` block from `render.yaml`. Add it as a secret in Render's environment variable settings in the dashboard. Mark it as a secret (not shown in logs).

**Steps**:
1. Log into render.com → open the service → Environment → add `MONGODB_URI` as a secret
2. Remove the `MONGODB_URI` stanza from `render.yaml`
3. Do NOT commit the actual URI value anywhere in the codebase

**Verify**: Deploy succeeds. Check backend logs for `[startup] Connected to MongoDB`. The URI should NOT appear in any log line.

**Dependencies**: None.

---

## FIX-2: Fix nginx.conf SSE proxy settings (Lightsail)

**Finding**: H-4  
**Risk of fix**: Low — only affects the Lightsail deployment. Render doesn't use nginx.

**Change to `nginx.conf`**:

Add a dedicated location block for the SSE endpoint BEFORE the generic `/api/` block:

```nginx
# SSE streaming — must come before the generic /api/ block
location /api/opportunities/stream {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    chunked_transfer_encoding on;
}

location /api/ {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Verify**: On Lightsail, open the dashboard in browser. Open Network tab → filter by `stream`. Confirm the SSE connection stays open (status column shows `pending`). Trigger a sheet upload — verify an SSE event arrives in the browser Network tab (look for `event: opportunities\ndata: {"type":"incremental"...}` in the response body).

**Dependencies**: None (independent of Render fixes).

---

## FIX-3: Fix "Recieved" typo

**Finding**: L-3  
**File**: `src/pages/Dashboard.tsx:1293`

```jsx
// Before:
<p ...>Recieved</p>

// After:
<p ...>Received</p>
```

**Verify**: Dashboard header card reads "Received".

---

## FIX-4: Reduce permissions polling interval from 30s to 5 minutes

**Finding**: H-5  
**File**: `src/contexts/AuthContext.tsx:73`  
**Risk of fix**: Low. Focus/visibility refresh is preserved. Only the poll interval changes. Permission changes propagate within 5 min or instantly on next tab focus.

```ts
// Before:
const PERMISSIONS_REFRESH_INTERVAL_MS = 30 * 1000;

// After:
const PERMISSIONS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
```

**Impact**: Reduces background API calls by ~10x per user (from 2 requests every 30s to 2 requests every 5min). Combined with H-2 fix, reduces DB queries by ~20x in the steady state.

**Verify**: After login, permissions are loaded once. On tab focus, they refresh. No hammer-poll visible in Network tab.

**Dependencies**: None.

---

## FIX-5: Add in-memory user cache to `verifyToken` middleware

**Finding**: H-2  
**File**: `backend/server.js` (~line 2604)  
**Risk of fix**: Low. Cache TTL is 90s. A revoked user can still make authenticated calls for up to 90s after revocation. This is an accepted trade-off for all session-based auth systems — JWT itself doesn't invalidate until expiry. If this is unacceptable, lower TTL to 15-30s.

**Implementation** (add near line 333, after `LOCAL_AUTH_USERS`):

```js
const USER_AUTH_CACHE = new Map(); // email → { user, expiresAt }
const USER_AUTH_CACHE_TTL_MS = 90 * 1000;

const getCachedUser = (email) => {
  const entry = USER_AUTH_CACHE.get(email);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    USER_AUTH_CACHE.delete(email);
    return null;
  }
  return entry.user;
};

const setCachedUser = (email, user) => {
  USER_AUTH_CACHE.set(email, { user, expiresAt: Date.now() + USER_AUTH_CACHE_TTL_MS });
  // Keep map size bounded
  if (USER_AUTH_CACHE.size > 500) {
    const now = Date.now();
    for (const [k, v] of USER_AUTH_CACHE.entries()) {
      if (v.expiresAt < now) USER_AUTH_CACHE.delete(k);
    }
  }
};

const invalidateUserCache = (email) => {
  USER_AUTH_CACHE.delete(String(email || '').trim().toLowerCase());
};
```

**Change `verifyToken`** (replace the `AuthorizedUser.findOne` block):

```js
// Line ~2643 — replace:
const user = await AuthorizedUser.findOne({ email: username });

// With:
let user = getCachedUser(username);
if (!user) {
  user = await AuthorizedUser.findOne({ email: username });
  if (user) setCachedUser(username, user);
}
```

**Invalidation**: Call `invalidateUserCache(email)` in:
- `/api/users/change-role` after role update (line ~4105)
- `/api/users/reject` after rejection (line ~4076)
- `/api/users/remove` after removal (line ~4157)

**Verify**: Under normal load, `/api/opportunities` responds in <100ms (was 150-400ms on cold DB). Check logs — DB `AuthorizedUser.findOne` calls should drop from N-per-second to near-zero.

**Dependencies**: None.

---

## FIX-6: Fix double-fetch on navigation in DataContext

**Finding**: H-3  
**File**: `src/contexts/DataContext.tsx`  
**Risk of fix**: Medium — this is the most invasive frontend change. Test carefully.

**Root cause**: `refreshData` reads `location.pathname` to determine the view (`lite` vs `full`). Since `location.pathname` is in the `useCallback` deps, every navigation creates a new function reference, which fires the `useEffect` again.

**Strategy**: Extract the view logic from inside `refreshData` into a `useRef` that is read at call time (not captured at creation time).

**Implementation**:

1. Replace the `location` import:
```tsx
// Before (line 6 in DataContext.tsx):
import { useLocation } from 'react-router-dom';

// After: keep the import, but only use it for an effect, not in refreshData
```

2. Add a `routeViewRef` that stays current:
```tsx
const routeViewRef = useRef<OpportunityFetchView>('lite');

// Add this effect near the top, BEFORE the refreshData useCallback:
useEffect(() => {
  routeViewRef.current = getOpportunityViewForRoute(location.pathname);
}, [location.pathname]);
```

3. Remove `location.pathname` from inside `refreshData`:
```tsx
// Replace (line ~188 in refreshData):
const route = location.pathname || '';
const routeView = getOpportunityViewForRoute(route);

// With:
const route = window.location.pathname || '';
const routeView = routeViewRef.current;
```

4. Remove `location.pathname` from `refreshData`'s dependency array (line 372):
```tsx
// Before:
}, [
  isAuthLoading, token, location.pathname, mergeOpportunityRows, ...
]);

// After:
}, [
  isAuthLoading, token, mergeOpportunityRows, normalizeOpportunityRows,
  persistOpportunityCache, buildVisibleOpportunity,
]);
```

5. The existing `useEffect` at line 381 that fires on route change can keep `location.pathname` as a dep — it now triggers navigation fetch via the stable `refreshData` function, not a new function reference.

**Verify**: Navigate between Dashboard → Opportunities → Analytics. In Network tab, confirm exactly ONE `/api/opportunities` request fires per navigation (not two). The second fetch (background) should not appear within 100ms of the first.

**Dependencies**: None, but complete FIX-4 first to reduce permission polling noise during testing.

---

## FIX-7: Add missing permission check to GET /api/opportunities

**Finding**: M-2  
**File**: `backend/server.js:6904`

Add immediately after `isDatabaseReady()` check:

```js
app.get('/api/opportunities', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'opportunities_view')) return;  // ADD THIS LINE
    ...
```

**Verify**: Log in as a `TempUser` with no `allowedPages`. Direct API call `GET /api/opportunities` should return 403.

**Dependencies**: None.

---

## FIX-8: Remove fake percentage from PageLoader

**Finding**: M-1  
**File**: `src/components/PageLoader.tsx`

Remove the `{Math.round(pct)}%` text and the progress bar's % width animation. Keep the spinner. The "Loading page…" text is fine.

```tsx
// Before:
export function PageLoader() {
  const pct = useProgressLoader(true, { startAt: 12, capAt: 90, stepMs: 90 });

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative h-20 w-20">
        <motion.span className="absolute inset-0 rounded-full border-4 border-muted" aria-hidden />
        <motion.span
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          aria-hidden
        />
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-foreground">
          {Math.round(pct)}%           ← REMOVE THIS
        </span>
      </div>
      <div className="w-56">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${pct}%` }}   ← REMOVE animate, make static
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        </div>
        ...
      </div>
    </div>
  );
}

// After:
export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative h-20 w-20">
        <motion.span className="absolute inset-0 rounded-full border-4 border-muted" aria-hidden />
        <motion.span
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          aria-hidden
        />
      </div>
      <p className="text-sm text-muted-foreground">Loading page…</p>
    </div>
  );
}
```

Also remove the `useProgressLoader` import and the framer-motion progress bar div.

**Verify**: Navigate to a lazy route. See spinner + "Loading page…" with no fake %. No console warning about progress stalling.

**Dependencies**: None.

---

## FIX-9: Cache telecast config in Dashboard using React Query

**Finding**: M-3  
**File**: `src/pages/Dashboard.tsx`

Replace the bare `useEffect` + `fetch` with a `useQuery`:

```tsx
// Remove the useEffect fetch (lines 630-636)
// Add:
import { useQuery } from '@tanstack/react-query';

// Inside Dashboard:
const { data: telecastConfig } = useQuery({
  queryKey: ['telecast-config'],
  queryFn: async () => {
    const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/telecast/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return r.json();
  },
  enabled: Boolean(token),
  staleTime: 5 * 60 * 1000,   // 5 minute cache
  gcTime: 10 * 60 * 1000,
});

// Replace topPerformerConfigVisible state:
const topPerformerConfigVisible = Boolean(telecastConfig?.topPerformerCardVisible);
```

This caches the config for 5 minutes and shares it across all Dashboard instances (navigating away and back won't refetch for 5 min).

**Verify**: Navigate to Dashboard twice. Network tab shows only ONE `/api/telecast/config` call in the first 5 minutes.

**Dependencies**: None. React Query is already installed and configured.

---

## FIX-10: Remove outer Suspense wrapper in AppRoutes

**Finding**: M-5  
**File**: `src/App.tsx:108-172`

```tsx
// Before:
function AppRoutes() {
  ...
  return (
    <>
      <RoutePerfLogger />
      <Suspense fallback={<PageLoader />}>    ← REMOVE THIS
      <Routes>
        ...
      </Routes>
      </Suspense>                              ← AND THIS
    </>
  );
}

// After:
function AppRoutes() {
  ...
  return (
    <>
      <RoutePerfLogger />
      <Routes>
        ...
      </Routes>
    </>
  );
}
```

The `AppLayout` already wraps the `Outlet` in `<Suspense>`, which is the correct place.

**Verify**: Navigate to lazy routes. `PageLoader` still shows. No visual change.

**Dependencies**: None. Do last since it's cosmetic cleanup.

---

## Estimated Impact Table

| Fix | Latency Improvement | Security | Complexity |
|-----|--------------------|-----------|----|
| FIX-1 | None | Critical | Trivial |
| FIX-2 | High (on Lightsail) | None | Low |
| FIX-3 | None | None | Trivial |
| FIX-4 | Medium (steady state) | None | Trivial |
| FIX-5 | High (per-request) | None | Low |
| FIX-6 | High (on navigation) | None | Medium |
| FIX-7 | None | Medium | Trivial |
| FIX-8 | None | None | Low |
| FIX-9 | Low | None | Low |
| FIX-10 | None | None | Trivial |

---

## What to Verify After All Fixes

1. **Auth flow**: Login, logout, session restore after refresh all work correctly
2. **Navigation**: Click through Dashboard → Opportunities → Analytics → Clients → back. Confirm no white flash or double loading state
3. **Live refresh**: Upload a sheet. Confirm the table updates within 2 seconds without a manual refresh
4. **Permissions**: As an Admin, confirm you cannot access Master pages. As Master, confirm all pages accessible
5. **Lightsail SSE**: If on Lightsail, confirm SSE connection in Network tab stays open and delivers events on sheet upload
6. **Performance**: Check Network tab — on steady state (no navigation), requests per minute should drop from ~8 (before) to ~1 (only the 5-min background refresh)
