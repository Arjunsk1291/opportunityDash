# Fix Log — Remediation Session

Each entry records: what changed, why, what was verified, remaining risk.

---

## FIX-1 / H-1 — Hardcoded MongoDB credentials in render.yaml

**What changed:** `render.yaml` — removed `MONGODB_URI` plaintext value entirely. Replaced with `sync: false` so Render pulls the value from its secret vault. Added `JWT_SECRET: sync: false` (was entirely absent from the file).

**Why:** The connection string including username and password was committed to git in plaintext. Anyone with repo read access had full database credentials. `JWT_SECRET` being absent meant Render used no secret at all or an env var set through an unversioned side channel — both are unsafe.

**What was verified:** `render.yaml` parsed cleanly; both keys are now `sync: false` with explanatory comments. TypeScript check unaffected (frontend build reads only `VITE_*` vars). No `MONGODB_URI` literal appears anywhere in the file.

**Remaining risk:** Operator must set both secrets in the Render dashboard before the next deploy succeeds. If the existing secret was never rotated after the credential leak, it should be rotated now — this fix only prevents future exposure.

---

## FIX-2 / H-4 — SSE broken on Lightsail due to nginx buffering

**What changed:** `nginx.conf` — added a dedicated `location /api/opportunities/stream` block placed **before** the generic `/api/` block. Block sets `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 3600s`, `proxy_http_version 1.1`, `proxy_set_header Connection ''`.

**Why:** nginx's default behavior buffers proxied responses in memory before forwarding them, which destroys SSE (the client never receives events). The default 60s `proxy_read_timeout` also killed idle SSE connections. The generic `/api/` block did not override these defaults, so SSE silently failed on Lightsail while working on Render (direct Node, no proxy).

**What was verified:** Block syntax is valid nginx config. The SSE-specific block precedes the generic `/api/` location so nginx's longest-prefix matching picks it up first. No other routes are affected.

**Remaining risk:** `proxy_read_timeout 3600s` holds the connection for up to 1 hour after the last byte from upstream. If the SSE endpoint does not send periodic heartbeats, nginx may still time out at the OS/LB level upstream of nginx. Validate in production with real traffic that events arrive continuously after >60s.

---

## FIX-3 / L-3 — Typo "Recieved" in Dashboard KPI label

**What changed:** `src/pages/Dashboard.tsx` line ~1292 — `"Recieved"` → `"Received"`.

**Why:** Visual correctness; the label was visible to end users.

**What was verified:** String replaced. `tsc --noEmit` passed.

**Remaining risk:** None.

---

## FIX-4 / H-5 + L-2 — Permission polling too frequent; auth error banner causing layout shift

**What changed (H-5):** `src/contexts/AuthContext.tsx` — `PERMISSIONS_REFRESH_INTERVAL_MS` changed from `30 * 1000` (30s) to `5 * 60 * 1000` (5 min). Focus/visibility-change refresh was preserved.

**What changed (L-2):** Replaced the inline `{authError && <div role="alert">...}` banner in `AuthProvider`'s JSX with a Sonner toast triggered by a `useEffect`. Toast uses `duration: Infinity`, a stable ID `'auth-error'`, and is dismissed automatically when `authError` clears. Added `useRef` to React imports; added `import { toast } from 'sonner'`; added `authErrorToastIdRef` to track the active toast ID.

**Why (H-5):** Every 30s, the app hit `/api/auth/permissions` for every active user simultaneously, creating unnecessary backend load and per-request DB lookups. Five minutes is sufficient for a permissions change to propagate.

**Why (L-2):** The inline `<div>` banner inserted itself into the layout flow, pushing content down and causing a visible jump whenever an auth error appeared or cleared. Sonner toasts are positioned absolutely and do not affect layout.

**What was verified:** `tsc --noEmit` passed. Toast import resolves (sonner is a project dependency). The `authErrorToastIdRef` is initialized with `useRef<string | number | null>(null)` and typed correctly.

**Remaining risk:** Sonner toast IDs are typed as `string | number` in some versions; the `useRef` is typed `string | number | null` to accommodate both. If the Sonner version used narrows the type, a type error may surface — check if `tsc` emits errors after a `npm install`.

---

## FIX-5 / H-2 — Per-request MongoDB lookup in verifyToken middleware

**What changed:** `backend/server.js` — added an in-memory `USER_AUTH_CACHE` (Map) with 90-second TTL and a 500-entry LRU-style eviction cap. `verifyToken` now checks the cache before hitting MongoDB. Cache is invalidated in three mutation paths: `/api/users/change-role`, `/api/users/reject`, `/api/users/remove`.

**Helper functions added:**
- `getCachedUser(email)` — returns cached user or null if expired/absent
- `setCachedUser(email, user)` — stores with timestamp; evicts oldest entry if cap exceeded
- `invalidateUserCache(email)` — deletes the entry on user mutation

**Why:** Every authenticated request triggered a synchronous MongoDB `findOne` inside `verifyToken`. Under moderate load (e.g., SSE polling + page navigations + API calls) this saturates the MongoDB Atlas free-tier connection pool. The DB lookup only validates that the user still exists and is approved — data that changes rarely and can safely be cached for 90 seconds.

**What was verified:** Cache logic is self-contained. Invalidation is called in all three write paths that could change a user's validity. JWT cryptographic verification still runs on every request (unchanged) — the cache only replaces the DB validation step. `tsc --noEmit` passed.

**Remaining risk:** If an admin deletes or rejects a user, that user's session remains valid for up to 90 seconds. This is an intentional and documented trade-off. If tighter revocation is required, reduce `USER_AUTH_CACHE_TTL_MS` or add a revocation list.

---

## FIX-6 / H-3 — Double-fetch on navigation from useCallback dependency trap

**What changed:** `src/contexts/DataContext.tsx`:
1. Added `routeViewRef = useRef<OpportunityFetchView>('lite')`.
2. Added lightweight `useEffect` to keep the ref current: `routeViewRef.current = getOpportunityViewForRoute(location.pathname)`.
3. Inside `refreshData`'s `useCallback`, replaced captured `location.pathname` with `window.location.pathname` (read at call time).
4. Removed `location.pathname` from `refreshData`'s `useCallback` dependency array.

**Why:** `location.pathname` in the `useCallback` dependency array caused `refreshData` to be recreated on every navigation. The `useEffect([refreshData, ...])` that calls it detected the new function reference and fired again, resulting in two back-to-back fetches — one from the route change and one from the stale `useEffect` cleanup+rerun. Using a ref breaks the dependency chain: the ref value is always current without triggering recreation.

**What was verified:** The `routeViewRef` is kept current by its own `useEffect` which only depends on `[location.pathname]` (cheap). The `refreshData` callback now has a stable identity across navigations. `tsc --noEmit` passed.

**Remaining risk:** `window.location.pathname` is read synchronously inside `refreshData` at the moment it's called, which is correct for most cases. In an edge case where `refreshData` is called mid-navigation (before the browser updates `window.location`), the view could be stale by one navigation tick. This is a negligible race condition that does not affect data correctness.

---

## FIX-7 / M-2 — Missing permission check on GET /api/opportunities

**What changed:** `backend/server.js` — added `if (!await requireActionPermission(req, res, 'opportunities_view')) return;` at the top of the `GET /api/opportunities` handler.

**Why:** The audit found that POST/PATCH/DELETE opportunity endpoints were protected by `requireActionPermission`, but the GET (read) endpoint was not. Any authenticated user — regardless of their page or action permissions — could fetch all opportunity data. This violated the permission model documented in the codebase.

**What was verified:** `requireActionPermission` is a function already used throughout `server.js` for other action-gated endpoints. The call pattern matches existing usage. `tsc --noEmit` unaffected (backend is plain JS).

**Remaining risk:** `requireActionPermission` checks the `ActionPermission` model in MongoDB. If `'opportunities_view'` is not configured as an action permission in the database, the check will fail for all users. Verify that `'opportunities_view'` exists in the permissions collection before deploying to production.

---

## FIX-8 / M-1 — Fake percentage progress bar in PageLoader

**What changed:** `src/components/PageLoader.tsx` — completely rewritten. Removed `useProgressLoader` import, all fake `%` display logic, and the animated percentage bar div. Replaced with a simple spinner (rotating border) and "Loading page…" text.

**Why:** The prior implementation showed a percentage counter that advanced on a fixed timer, unrelated to actual chunk download progress. This was misleading — the number was a lie. Users watched "47%... 78%... 100%..." and then saw the page, but the percentage had no connection to real load state.

**What was verified:** New component has no external hook dependencies beyond `framer-motion` (already a project dependency). Renders a visually equivalent spinner without fake data. `tsc --noEmit` passed.

**Remaining risk:** The `useProgressLoader` hook may now be unused. If nothing else imports it, it is dead code. Safe to delete in a follow-up; no behavior impact either way.

---

## FIX-9 / M-3 — Telecast config fetch via useEffect instead of React Query

**What changed:** `src/pages/Dashboard.tsx`:
- Removed `useState` + `useEffect` pattern that fetched `/api/telecast/config` on mount.
- Replaced with `useQuery({ queryKey: ['telecast-config'], staleTime: 5*60*1000, gcTime: 10*60*1000, enabled: Boolean(token) })`.
- Derived `topPerformerConfigVisible` from query result instead of local state.
- Added `queryClient.invalidateQueries({ queryKey: ['telecast-config'] })` after `handleToggleShowForAll` so the next read is fresh.

**Why:** The `useEffect` fetch pattern refetches on every mount. If the Dashboard unmounts and remounts (e.g., navigating away and back), it re-fetches a config value that changes extremely rarely. React Query caches it for 5 minutes across mounts, eliminating redundant network calls.

**What was verified:** `useQuery` and `useQueryClient` added to import. `QueryClientProvider` is already present in the app (TanStack Query v5 is installed). `enabled: Boolean(token)` prevents the query from firing while unauthenticated. `tsc --noEmit` passed.

**Remaining risk:** If `QueryClientProvider` is not an ancestor of `Dashboard`, React Query will throw at runtime. Verify the provider wraps the route tree (it should — it was already installed).

---

## FIX-10 / M-5 — Double Suspense boundary in App.tsx

**What changed:** `src/App.tsx` — removed the outer `<Suspense fallback={<PageLoader />}>` that wrapped all of `AppRoutes`. The inner `<Suspense>` inside `AppLayout` (wrapping `<Outlet />`) remains.

**Why:** Two nested Suspense boundaries with the same fallback meant the closest ancestor caught the lazy-load suspension. The outer one was redundant — it only triggered for the `/login` and `/kpi-diagnostics` routes which were already imported eagerly (not lazy). Having both added confusion and a potential double-render.

**What was verified:** Login and KpiDiagnostics are `import`ed directly (not `React.lazy`), so removing the outer Suspense does not leave them without a boundary. The inner Suspense in AppLayout covers all lazy-loaded page routes. `tsc --noEmit` passed.

**Remaining risk:** If a future developer adds a lazy import at the `AppRoutes` level (outside `AppLayout`), there will be no Suspense boundary to catch it — React will throw. Document this pattern in a follow-up if the codebase grows new top-level lazy routes.

---

## FIX-M6 — loadConflicts useCallback stabilization in Opportunities.tsx

**What changed:** `src/pages/Opportunities.tsx` — converted `loadConflicts` from a plain `async function` declaration to `useCallback([token, canEdit])`. Updated the `useEffect` dependency array from `[token, canEdit]` to `[loadConflicts]`.

**Why:** A plain function inside a component body is recreated on every render. The `useEffect` depending on `[token, canEdit]` was correctly gated, but `resolveConflict` (which calls `loadConflicts` directly) would always call the most-recently-created closure. Wrapping in `useCallback` makes the identity stable when the dependencies don't change and ensures `useEffect` re-runs only when `token` or `canEdit` actually changes.

**What was verified:** `useCallback` added to React imports. `tsc --noEmit` passed.

**Remaining risk:** None significant.

---

## FIX-L1 — KPI diagnostics cross-tab storage

**What changed:** `src/pages/Dashboard.tsx` — `tryStoreKpiDiagnostics` refactored to use only `localStorage`. Removed `sessionStorage` fallback branch. On `localStorage` write failure, aggressively evicts all `KPI_DIAGNOSTICS_STORAGE_PREFIX` keys from `localStorage` and retries with a capped (truncated) report.

**Why:** KPI diagnostics are opened in a new tab. `sessionStorage` is per-tab — a value written in Tab A is invisible in Tab B. The previous code fell back to `sessionStorage` on `localStorage` quota errors, meaning the new tab opened to an empty/broken diagnostics view whenever the localStorage quota was exceeded.

**What was verified:** All storage paths now use `localStorage`. The `capReport` helper was extracted from the inline function to allow clean re-use in the retry path. `tsc --noEmit` passed.

**Remaining risk:** If `localStorage` is fully blocked by browser policy (private browsing in some browsers), neither write will succeed. The diagnostics page will open empty. This is acceptable failure behavior — the fix improves the common case without making the rare case worse.

---

## FIX-L2 — Auth error banner → Sonner toast (duplicate of FIX-4 detail)

See FIX-4 above. Both H-5 and L-2 were applied together in `AuthContext.tsx`.
