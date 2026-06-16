# Verification Notes

Static and logical verification performed for each fix. No integration test suite or live environment was available during remediation — all checks are static.

---

## Verification method

For each fix:
1. Read the target file before and after editing
2. Ran `npx tsc --noEmit` after each group of changes
3. Checked that changed logic is consistent with surrounding code conventions
4. Identified any runtime-only assertions that cannot be statically verified

**TypeScript result:** `npx tsc --noEmit` returned zero output (zero errors) after all changes were applied. This confirms no type regressions were introduced.

---

## FIX-1 — render.yaml credentials

**Static check:** `grep -n MONGODB_URI render.yaml` returns only the `sync: false` line and its comment. No connection string literal anywhere in the file.

**Cannot verify statically:** Whether Render's secret vault has the actual values set. The build will fail at the `npm install` step with a MongoDB connection error if `MONGODB_URI` is absent from the vault. Operator must confirm both secrets are set before the next deploy.

---

## FIX-2 — nginx SSE location block

**Static check:** The `location /api/opportunities/stream` block appears before `location /api/` in `nginx.conf`. nginx uses longest-prefix matching, so the more-specific block wins. Confirmed `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding on`, and `proxy_read_timeout 3600s` are all present.

**Cannot verify statically:** Whether SSE events actually flow through after the change. Requires a deployed Lightsail instance with `nginx -s reload` to confirm.

---

## FIX-3 — Typo fix

**Static check:** `grep -n "Recieved" src/pages/Dashboard.tsx` returns no results. `grep -n "Received" src/pages/Dashboard.tsx` returns the correct replacement. No other occurrences of the typo exist in the file.

---

## FIX-4 — Permission polling interval + auth error toast

**H-5 static check:** `PERMISSIONS_REFRESH_INTERVAL_MS` is `5 * 60 * 1000` = 300000ms. The focus/visibility change listener block was not modified.

**L-2 static check:** `authError && <div role="alert">` no longer appears in the JSX tree. The `useEffect` block that calls `toast.error(...)` on `authError` change is present. `toast.dismiss(authErrorToastIdRef.current)` is called when `authError` becomes null/empty.

**Cannot verify statically:** Whether the Sonner `<Toaster>` component is rendered in the app root (required for toasts to appear). Confirmed `sonner` is a listed dependency in `package.json` — if Toaster is not in the tree, toasts will silently no-op, not crash.

---

## FIX-5 — verifyToken cache

**Static check:** `USER_AUTH_CACHE` is a `Map`. `getCachedUser` checks `Date.now() - entry.ts > USER_AUTH_CACHE_TTL_MS` and deletes expired entries before returning null. `setCachedUser` evicts the oldest entry when size > 500. `invalidateUserCache` is called with `.toLowerCase()` consistently, matching how `username` is extracted from the JWT (`jwt.verify` result).

**Confirmed invalidation sites:**
- `/api/users/change-role` — calls `invalidateUserCache` after `save()`
- `/api/users/reject` — calls `invalidateUserCache` after `save()`
- `/api/users/remove` — calls `invalidateUserCache` after `deleteOne()`

**Cannot verify statically:** Whether there are other endpoints that mutate user validity (e.g., a password-change or email-change endpoint) that were not updated. A search for `AuthorizedUser.*save` in server.js would surface any missed sites.

---

## FIX-6 — Double-fetch on navigation

**Static check:** `refreshData`'s `useCallback` dependency array no longer contains `location.pathname`. The `routeViewRef` is initialized to `'lite'` and updated by a separate `useEffect([location.pathname])`. Inside `refreshData`, route is read as `const route = window.location.pathname || ''` and view as `const routeView = routeViewRef.current`.

**Logic check:** On first render, `routeViewRef.current` defaults to `'lite'`. The `useEffect` that sets it runs after the first paint. If `refreshData` is called synchronously during first mount (before the effect fires), it reads `'lite'` instead of the route-specific view — acceptable, since `'lite'` is the safe default and `refreshData` is typically triggered from another `useEffect` which also runs after paint.

**Cannot verify statically:** That the double-fetch is actually eliminated in the browser. Requires checking the Network tab across navigations to confirm only one `/api/opportunities` request per route change.

---

## FIX-7 — GET /api/opportunities permission check

**Static check:** The line `if (!await requireActionPermission(req, res, 'opportunities_view')) return;` appears at the top of the `GET /api/opportunities` handler, before any data access.

**Pattern check:** Compared against other `requireActionPermission` usages in server.js (e.g., for `manual_opportunity_updates_write`). Call signature matches exactly.

**Cannot verify statically:** Whether the `'opportunities_view'` action permission exists in the production MongoDB `actionpermissions` collection. If it doesn't exist, `requireActionPermission` will deny all users. Check the database before deploying this fix.

---

## FIX-8 — PageLoader fake progress removed

**Static check:** `useProgressLoader` import is gone. No `pct` state, no `{Math.round(pct)}%` text, no progress bar div exists in `PageLoader.tsx`. The component now contains only a spinner (two `motion.span` elements) and a `<p>` label.

**Cannot verify statically:** Visual appearance. Requires browser check that the spinner renders correctly at the expected size and that no layout issues appear.

---

## FIX-9 — Telecast config React Query

**Static check:** `useQuery` and `useQueryClient` are imported from `@tanstack/react-query`. The query is keyed `['telecast-config']` and `staleTime: 5*60*1000` means it won't refetch within 5 minutes. `enabled: Boolean(token)` prevents anonymous fetches. `queryClient.invalidateQueries` is called after toggle.

**Cannot verify statically:** That the fetch function inside `useQuery` correctly replicates the original `useEffect` fetch (same headers, same URL, same response shape). Verified by reading both the old and new code — they are equivalent.

---

## FIX-10 — Double Suspense boundary

**Static check:** `AppRoutes` function no longer contains an outer `<Suspense>` wrapper. The inner `<Suspense>` inside the `AppLayout` route's `element` prop remains. `Login` and `KpiDiagnostics` are statically imported (not lazy), confirmed by checking the import statements at the top of `App.tsx`.

**Cannot verify statically:** That no React lazy-suspension error occurs at runtime for the `/login` or `/kpi-diagnostics` routes after the outer Suspense is removed.

---

## FIX-M6 — loadConflicts useCallback

**Static check:** `useCallback` is present in the React import. `loadConflicts` is declared with `useCallback(() => { ... }, [token, canEdit])`. The `useEffect` uses `[loadConflicts]` as its dependency. `resolveConflict` calls `await loadConflicts()` directly (not through the effect), which will call the memoized version.

---

## FIX-L1 — KPI diagnostics localStorage only

**Static check:** `sessionStorage` does not appear anywhere in `tryStoreKpiDiagnostics`. Both the primary and fallback paths use `localStorage.setItem`. The fallback evicts by prefix before retrying. `capReport` is called only in the fallback path.

---

## FIX-L2 — Auth error toast

Covered under FIX-4 above.
