# Env Verification Report

**Date:** 2026-06-16  
**Method:** Local boot test with provided Render env file loaded into `node backend/server.js`. Secrets not printed anywhere in this file.

---

## Boot result

| Check | Result |
|-------|--------|
| Server starts with env file | PASS — `[startup] Server listening on port 3001` |
| MongoDB connection established | PASS — `readyState=1`, `ping OK` (51ms round-trip) |
| `/api/health` returns `ok: true` | PASS — `dbState: 1, dbPingMs: 51` |
| JWT sign + verify round-trip | PASS — 96-char secret, correct `email` field |
| Unauthed access to `/api/opportunities` | PASS — HTTP 401 |
| Invalid Bearer token | PASS — HTTP 401 |
| MSAL config endpoint | PASS — returns tenant/client IDs (values redacted) |
| Token-gated DB lookup | PARTIAL — JWT verified correctly; Atlas free-tier latency caused timeouts on user lookup queries from local machine. Not a config error — initial connection and ping succeed. |

---

## Secret scan — tracked files

| Check | Result |
|-------|--------|
| `MONGODB_URI` connection string in `render.yaml` | CLEAN — `sync: false` only; comment line only has format placeholder |
| `JWT_SECRET` in `render.yaml` | CLEAN — `sync: false` only |
| MongoDB credentials in any git-tracked source file | CLEAN — zero hits |
| Azure client secret pattern in tracked files | CLEAN — zero hits |
| ROPC password in tracked files | CLEAN — zero hits |
| Tracked `.env.*` files | CLEAN — only `REPLACE_ME` placeholders; no real values |

---

## Env file coverage vs server.js

All 16 server-read env vars are present and correctly wired. `SESSION_JWT_SECRET` is absent but `JWT_SECRET` satisfies the same fallback chain (`process.env.JWT_SECRET || process.env.SESSION_JWT_SECRET`).

### Vars in env file not read by server.js

| Variable | Status |
|----------|--------|
| `BASIC_USERS` | Not referenced in server.js — no effect |
| `DEFAULT_SERVICE_ACCOUNT` | Not referenced in server.js — no effect |
| `VITE_API_URL` | Frontend build-time only; baked into bundle, not read at runtime |
| `VITE_DIAG_LOGS` | Frontend build-time only; baked into bundle, not read at runtime |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` / `CLIENT_SECRET` | Aliases; covered by `GRAPH_*` fallback chain in server.js |

Setting `VITE_*` vars in Render's dashboard will not affect the already-built frontend bundle. They only matter at build time.

---

## Mongoose startup warnings

Two pre-existing schema warnings appear at boot (not caused by env):

```
Duplicate schema index on {"accessId":1}
Duplicate schema index on {"opportunityRefNo":1} (×2)
```

These are from Mongoose schema definitions that declare the same index twice (`index: true` on the field + `schema.index()` call). Warnings only — not errors. Indexes are not duplicated in Atlas. Low-priority schema hygiene cleanup.

---

## Operator actions required before next Render deploy

1. **Set `MONGODB_URI` in Render dashboard** — Environment tab → Add Secret → key `MONGODB_URI`. If the credential was ever exposed in git history, rotate the Atlas password first.
2. **Set `JWT_SECRET` in Render dashboard** — Environment tab → Add Secret → key `JWT_SECRET`. Use the value from the provided env file (or generate a new one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
3. **Set `VITE_API_URL=/api` in Render dashboard** if Render rebuilds from source (currently baked into the bundle as `/api` — no change needed unless redeploying from scratch).

---

## Notes

- The `VITE_*` values (`VITE_API_URL=/api`, `VITE_DIAG_LOGS=true`) in the env file are correctly set for the Render deployment. They are build-time values; the current bundle already has them baked in.
- Auth flow uses the `email` field in the JWT payload (not `username`). Any custom token generation must use `{ email: '...' }`.
- MongoDB Atlas M0 free tier may show high query latency (~400ms+) under concurrent load. This is expected and is why the auth cache (90s TTL) and system config cache (30s TTL) were added.
