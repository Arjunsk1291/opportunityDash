import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual, createHash } from 'crypto';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import os from 'os';
import approvalDb from './approvalDb.js';
import SyncedOpportunity from './models/SyncedOpportunity.js';
import OpportunityManualUpdate from './models/OpportunityManualUpdate.js';
import OpportunityFieldConflict from './models/OpportunityFieldConflict.js';
import LeadEmailMapping from './models/LeadEmailMapping.js';
import Approval from './models/Approval.js';
import AuthorizedUser from './models/AuthorizedUser.js';
import AuthDiagnosticLog from './models/AuthDiagnosticLog.js';
import LoginLog from './models/LoginLog.js';
import TempAccess from './models/TempAccess.js';
import Client from './models/Client.js';
import Vendor from './models/Vendor.js';
import PqActivity, { getPqModel } from './models/PqActivity.js';
import PotentialOpportunity from './models/PotentialOpportunity.js';
import BidDecision from './models/BidDecision.js';
import UpcomingFeature from './models/UpcomingFeature.js';
import { syncTendersFromGraph, transformTendersToOpportunities } from './services/dataSyncService.js';
import GraphSyncConfig from './models/GraphSyncConfig.js';
import BDEngagement from './models/BDEngagement.js';
import {
  resolveShareLink,
  getWorksheets,
  getWorksheetRangeValues,
  protectRefreshToken,
  unprotectRefreshToken,
  buildDelegatedConsentUrl,
  getAccessTokenWithConfig,
  getMailAccessToken,
  startDeviceCodeFlow,
  exchangeDeviceCodeForToken,
} from './services/graphExcelService.js';
import { buildOpportunitiesWorkbookForSpreadsheet } from './services/spreadsheetWorkbookService.js';
import SystemConfig from './models/SystemConfig.js';
import { encryptSecret } from './services/cryptoService.js';
import { z } from 'zod';
import XLSX from 'xlsx';
import multer from 'multer';
import fs from 'fs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const DIAG_LOGS = String(process.env.DIAG_LOGS || '').toLowerCase() === '1' || String(process.env.DIAG_LOGS || '').toLowerCase() === 'true';
const AUTH_DIAG_LOGS = String(process.env.AUTH_DIAG_LOGS || '').toLowerCase() === '1' || String(process.env.AUTH_DIAG_LOGS || '').toLowerCase() === 'true';

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
};

const clampLog = (value, max = 800) => {
  const str = typeof value === 'string' ? value : safeJson(value);
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
};

let DIAG_REQ_SEQ = 0;
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/opportunity-dashboard';

const DEFAULT_TELECAST_SENDER = 'tender-notify@avenirenergy.me';
const getTelecastSender = () => String(process.env.TELECAST_SENDER || DEFAULT_TELECAST_SENDER).trim();

const DISABLE_MONGODB = String(process.env.DISABLE_MONGODB || '').toLowerCase() === 'true';
const JWT_SECRET = String(process.env.JWT_SECRET || process.env.SESSION_JWT_SECRET || '').trim();
const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const ALLOW_LEGACY_USERNAME_AUTH = String(process.env.ALLOW_LEGACY_USERNAME_AUTH || '').toLowerCase() === 'true';
const EFFECTIVE_JWT_SECRET = JWT_SECRET || (IS_PROD ? '' : (String(process.env.DEV_JWT_SECRET || '').trim() || randomBytes(48).toString('hex')));
const BOOTSTRAP_ADMIN_SECRET = String(process.env.BOOTSTRAP_ADMIN_SECRET || '').trim();
const ALLOW_PROD_USERNAME_ALIASES = String(process.env.ALLOW_PROD_USERNAME_ALIASES || '').toLowerCase() === 'true';
const DEFAULT_ADMIN_PASSWORD = String(process.env.DEFAULT_ADMIN_PASSWORD || '').trim();
const ADMIN_USERS = String(process.env.ADMIN_USERS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_USERS_SET = new Set(ADMIN_USERS);
const normalizeLoginEmail = (value) => String(value || '').trim().toLowerCase();
const isConfiguredAdminUsername = (value) => {
  const normalized = normalizeLoginEmail(value);
  if (!normalized) return false;
  if (ADMIN_USERS_SET.has(normalized)) return true;
  if (!normalized.includes('@') && ADMIN_USERS_SET.has(`${normalized}@dev.local`)) return true;
  return false;
};

const shouldExposeAuthDiag = (req) => AUTH_DIAG_LOGS || String(req.headers['x-auth-diagnose'] || '').toLowerCase() === '1';
const sendAuthFailure = (res, req, status, error, code, details = {}) => {
  void AuthDiagnosticLog.create({
    email: String(details?.email || details?.username || details?.requestedLogin || '').trim(),
    route: String(req.originalUrl || req.path || '/api/auth/login-password'),
    method: String(req.method || 'POST'),
    code,
    message: error,
    status,
    details,
    userAgent: String(req.headers['user-agent'] || ''),
    ipAddress: String(req.ip || ''),
  }).catch((logError) => {
    console.error('[auth.diagnostics.log-failed]', logError?.message || String(logError));
  });

  const payload = { error };
  if (shouldExposeAuthDiag(req)) {
    payload.code = code;
    payload.details = details;
  }
  return res.status(status).json(payload);
};

const hasGraphAppCredentialsConfigured = () => {
  const tenantId = String(process.env.GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID || '').trim();
  const clientId = String(process.env.GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '').trim();
  return !!(tenantId && clientId && clientSecret);
};

// Ensure req.ip is the real client IP behind proxies (Render/nginx).
if (String(process.env.TRUST_PROXY || '').trim()) {
  app.set('trust proxy', process.env.TRUST_PROXY);
} else if (IS_PROD) {
  app.set('trust proxy', 1);
}

if (IS_PROD && !JWT_SECRET) {
  console.error('[startup.security] Missing JWT secret in production; refusing to start. Set `JWT_SECRET` (or `SESSION_JWT_SECRET`) to a long random value.');
  process.exit(1);
}

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://opportunitydash.onrender.com',
];
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = configuredCorsOrigins.length ? configuredCorsOrigins : DEFAULT_CORS_ORIGINS;

const isCorsOriginAllowed = (origin, req) => {
  if (!origin) return true; // Non-browser clients or same-origin requests without Origin header.
  if (allowedCorsOrigins.includes(origin)) return true;
  const host = req.headers.host;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  return false;
};

app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  const allowed = isCorsOriginAllowed(origin, req);
  callback(null, { origin: allowed });
}));

app.use(compression());

// Security headers (ISO/IEC 27001 compliance) using Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
      'script-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'", 'https:'],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: IS_PROD ? { maxAge: 31536000, preload: true } : false,
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use((req, res, next) => {
  if (!DIAG_LOGS) return next();
  if (!req.path.startsWith('/api/')) return next();

  const reqId = `${Date.now().toString(36)}-${(++DIAG_REQ_SEQ).toString(36)}`;
  const startedAt = process.hrtime.bigint();

  res.setHeader('X-Diag-Req-Id', reqId);

  const startLog = {
    tag: 'DIAG_REQ_START',
    reqId,
    ts: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query || {},
    contentLength: req.headers['content-length'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
  console.log(`[diag] ${clampLog(startLog)}`);

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const finishLog = {
      tag: 'DIAG_REQ_FINISH',
      reqId,
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
    };
    console.log(`[diag] ${clampLog(finishLog)}`);
  });

  return next();
});

const createRateLimiter = ({ windowMs, max, keyPrefix }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}`;
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    if (Math.random() < 0.01) {
      for (const [storedKey, stored] of hits.entries()) {
        if (now - stored.start >= windowMs) hits.delete(storedKey);
      }
    }
    return next();
  };
};

const authRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, keyPrefix: 'auth' });
const privilegedRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120, keyPrefix: 'priv' });
const pqImportRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 8, keyPrefix: 'pq-import' });
const passwordResetRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'pwd-reset' });

// Global mail rate limiter — max 5 emails per 10-minute window across all automated sends.
const MAIL_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAIL_RATE_LIMIT = 5;
const _mailRateWindow = { count: 0, windowStart: 0 };
const _mailQueue = [];

const canSendMail = () => {
  const now = Date.now();
  if (now - _mailRateWindow.windowStart > MAIL_RATE_WINDOW_MS) {
    _mailRateWindow.count = 0;
    _mailRateWindow.windowStart = now;
  }
  return _mailRateWindow.count < MAIL_RATE_LIMIT;
};

const queueMail = (label, sendFn) => {
  _mailQueue.push({ fn: sendFn, label });
};

const drainMailQueue = async () => {
  while (_mailQueue.length > 0 && canSendMail()) {
    const item = _mailQueue.shift();
    try {
      _mailRateWindow.count++;
      await item.fn();
    } catch (e) {
      console.error('[mailQueue.error]', item.label, e?.message);
    }
  }
  if (_mailQueue.length > 0) {
    console.log(`[mailQueue] ${_mailQueue.length} mail(s) queued — rate limit active, will retry next cycle`);
  }
};

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (req.path.startsWith('/api/health') || req.path.startsWith('/healthz')) return next();
  if (req.method === 'GET') return next();
  return privilegedRateLimiter(req, res, next);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const isDatabaseReady = () => {
  if (DISABLE_MONGODB) return true;
  return mongoose.connection.readyState === 1;
};

const respondDatabaseUnavailable = (res) => {
  return res.status(503).json({ error: 'Database unavailable. Please try again shortly.' });
};

// Detect Mongoose/MongoDB driver errors so catch blocks can return 503 instead of 500.
const isDbError = (err) =>
  Boolean(
    err?.name?.includes('Mongo') ||
    /server selection|socket timeout|topology|timed out|not connected|buffering timed out|ECONNRESET|ETIMEDOUT/i.test(err?.message || '')
  );

// Unified catch handler — returns 503 for DB errors, 500 for everything else.
const handleApiError = (res, err, context = '') => {
  if (context) console.error(`[${context}]`, err?.message || err);
  if (!res.headersSent) {
    if (isDbError(err)) return respondDatabaseUnavailable(res);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
};

const clampString = (value, maxLen) => String(value || '').trim().slice(0, maxLen);
const deriveContactPersonFromEmail = (email) => {
  const raw = String(email || '').trim();
  const local = raw.includes('@') ? raw.split('@')[0] : raw;
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
};

const LOCAL_AUTH_USERS = new Map();
const upsertLocalAuthorizedUser = (email, updates = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = LOCAL_AUTH_USERS.get(normalizedEmail) || { email: normalizedEmail };
  const next = { ...existing, ...updates, email: normalizedEmail };
  LOCAL_AUTH_USERS.set(normalizedEmail, next);
  return next;
};

// Short-lived in-memory cache for verified users. Eliminates per-request DB lookup.
// TTL is intentionally short so role/status changes propagate quickly.
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

const createSessionToken = (user, extraPayload = {}) => {
  const secret = EFFECTIVE_JWT_SECRET;
  const payload = {
    email: String(user?.email || '').trim().toLowerCase(),
    role: String(user?.role || '').trim(),
    ...extraPayload,
  };
  return jwt.sign(payload, secret, { expiresIn: '12h' });
};

const hashResetToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');
const generateTempCredential = () => randomBytes(6).toString('hex').toUpperCase();
const normalizeTempCredentialInput = (value) => String(value || '')
  .trim()
  .replace(/[\s-]+/g, '')
  .toUpperCase();

const scryptAsync = (password, salt, options) => new Promise((resolve, reject) => {
  nodeScrypt(password, salt, options.keylen, { N: options.N, r: options.r, p: options.p, maxmem: options.maxmem }, (err, derivedKey) => {
    if (err) return reject(err);
    resolve(derivedKey);
  });
});

const PASSWORD_HASH_PREFIX = 'scrypt';
const hashPassword = async (password) => {
  const normalized = String(password || '');
  if (!normalized) throw new Error('Password is required');
  const salt = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
  const params = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
  const derived = await scryptAsync(normalized, salt, params);
  const hash = Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
  return [
    PASSWORD_HASH_PREFIX,
    `N=${params.N}`,
    `r=${params.r}`,
    `p=${params.p}`,
    `salt=${salt.toString('base64')}`,
    `hash=${hash.toString('base64')}`,
  ].join('$');
};

const verifyPassword = async (password, storedHash) => {
  const raw = String(storedHash || '');
  if (!raw) return false;
  const parts = raw.split('$');
  if (parts.length < 6 || parts[0] !== PASSWORD_HASH_PREFIX) return false;
  const parse = (prefix) => {
    const match = parts.find((p) => p.startsWith(prefix));
    return match ? match.slice(prefix.length) : '';
  };
  const N = Number(parse('N='));
  const r = Number(parse('r='));
  const p = Number(parse('p='));
  const saltB64 = parse('salt=');
  const hashB64 = parse('hash=');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(String(password || ''), salt, { N, r, p, keylen: expected.length, maxmem: 64 * 1024 * 1024 });
  const actual = Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};

const assertStrongPassword = (password) => {
  const value = String(password || '');
  // Minimum baseline: 10+ chars, mixed case, number, symbol.
  if (value.length < 10) throw new Error('Password must be at least 10 characters');
  if (!/[a-z]/.test(value)) throw new Error('Password must include a lowercase letter');
  if (!/[A-Z]/.test(value)) throw new Error('Password must include an uppercase letter');
  if (!/[0-9]/.test(value)) throw new Error('Password must include a number');
  if (!/[^A-Za-z0-9]/.test(value)) throw new Error('Password must include a symbol');
};

const findAuthorizedUserByEmail = async (email) => {
  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) return null;
  const exact = await AuthorizedUser.findOne({ email: normalizedEmail });
  if (exact) return exact;
  return AuthorizedUser.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
};

app.get('/healthz', (_req, res) => {
  const dbReady = DISABLE_MONGODB ? true : mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    ok: dbReady,
    service: 'backend',
    dbState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const system = getSystemHealthSnapshot();
  let dbPingMs = null;
  if (dbReady) {
    try {
      const t0 = Date.now();
      await mongoose.connection.db.command({ ping: 1 });
      dbPingMs = Date.now() - t0;
    } catch {
      dbPingMs = null;
    }
  }
  res.status(dbReady ? 200 : 503).json({
    ok: dbReady,
    service: 'backend',
    dbState: mongoose.connection.readyState,
    dbPingMs,
    system,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (_req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    gitSha: BUILD_INFO.gitSha,
    buildTime: BUILD_INFO.buildTime,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/msal-config', (_req, res) => {
  const tenantId = process.env.AZURE_TENANT_ID || '';
  const clientId = process.env.AZURE_CLIENT_ID || '';
  const redirectUri = process.env.AZURE_REDIRECT_URI || 'https://opportunitydash.onrender.com/auth/callback';
  const redirectUriDev = process.env.AZURE_REDIRECT_URI_DEV || 'http://localhost:5173';
  const useDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

  res.json({
    tenantId,
    clientId,
    redirectUri: useDev ? redirectUriDev : redirectUri,
  });
});

let httpServer = null;
const startHttpServer = () => {
  if (httpServer) return httpServer;
  httpServer = app.listen(PORT, () => {
    console.log(`[startup] Server listening on port ${PORT}`);
  });
  return httpServer;
};

if (DISABLE_MONGODB) {
  console.log('[startup] MongoDB disabled via environment variable.');
  startHttpServer();
} else {
// Fail queries immediately when disconnected instead of buffering them.
// Without this, a dropped Atlas connection causes every request to queue up
// silently and nginx returns 504 before Mongoose ever gives up.
mongoose.set('bufferCommands', false);

mongoose.connection.on('disconnected', () => {
  console.warn('[mongo.disconnected] MongoDB connection lost — requests will receive 503 until reconnected');
});
mongoose.connection.on('reconnected', () => {
  console.log('[mongo.reconnected] MongoDB connection restored');
});
mongoose.connection.on('error', (err) => {
  console.error('[mongo.error]', err.message);
});

mongoose.connect(MONGODB_URI, {
  monitorCommands: DIAG_LOGS,
  autoIndex: !IS_PROD,
  autoCreate: !IS_PROD,
  // Fail fast on server selection — 5s in prod so slow queries surface quickly
  serverSelectionTimeoutMS: IS_PROD ? 5000 : 15000,
  // Socket-level timeout — abort hung queries after 15s in prod
  socketTimeoutMS: IS_PROD ? 15000 : 30000,
  // TCP-level keepalive prevents silent connection drops through firewalls / Atlas idle timeout
  family: 4,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 5,
  minPoolSize: 1,
})
  .then(() => {
    if (DIAG_LOGS) {
      try {
        const client = mongoose.connection.getClient();
        const startedAtByRequestId = new Map();

        client.on('commandStarted', (event) => {
          const key = event.requestId;
          startedAtByRequestId.set(key, process.hrtime.bigint());
          console.log(`[diag] ${clampLog({
            tag: 'DIAG_MONGO_START',
            ts: new Date().toISOString(),
            requestId: event.requestId,
            db: event.databaseName,
            commandName: event.commandName,
            command: event.command ? { ...event.command, lsid: undefined, $db: undefined } : undefined,
          })}`);
        });

        client.on('commandSucceeded', (event) => {
          const startedAt = startedAtByRequestId.get(event.requestId);
          startedAtByRequestId.delete(event.requestId);
          const elapsedMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1e6 : null;
          console.log(`[diag] ${clampLog({
            tag: 'DIAG_MONGO_OK',
            ts: new Date().toISOString(),
            requestId: event.requestId,
            commandName: event.commandName,
            elapsedMs: elapsedMs != null ? Math.round(elapsedMs * 100) / 100 : null,
            reply: event.reply ? { ok: event.reply.ok, n: event.reply.n, nModified: event.reply.nModified } : undefined,
          })}`);
        });

        client.on('commandFailed', (event) => {
          const startedAt = startedAtByRequestId.get(event.requestId);
          startedAtByRequestId.delete(event.requestId);
          const elapsedMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1e6 : null;
          console.log(`[diag] ${clampLog({
            tag: 'DIAG_MONGO_FAIL',
            ts: new Date().toISOString(),
            requestId: event.requestId,
            commandName: event.commandName,
            elapsedMs: elapsedMs != null ? Math.round(elapsedMs * 100) / 100 : null,
            failure: { name: event.failure?.name, message: event.failure?.message },
          })}`);
        });
      } catch (err) {
        console.error('[diag.mongo.hooks.error]', err);
      }
    }
    startHttpServer();
  })
  .then(() => {
    scheduleDailyNotificationCheck();
  })
  .catch(err => {
    console.error('[mongo.connect.failure]', JSON.stringify({
      timestamp: new Date().toISOString(),
      name: err?.name || 'Error',
      message: err?.message || String(err),
      stack: err?.stack || null,
    }));
  });
}

const mapIdField = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc._id?.toString() || doc._id || null,
  };
};

const OPPORTUNITY_LITE_PROJECTION = {
  rawGoogleData: 0,
  rawGraphData: 0,
  updateHistory: 0,
};

const OPPORTUNITY_FULL_PROJECTION = {
  rawGoogleData: 0,
};

const getOpportunityProjection = (view = 'full') => (
  String(view || '').trim().toLowerCase() === 'lite'
    ? OPPORTUNITY_LITE_PROJECTION
    : OPPORTUNITY_FULL_PROJECTION
);

const opportunityStreamClients = new Set();
let opportunityStreamHeartbeat = null;

const publishOpportunityEvent = (payload = {}) => {
  if (!opportunityStreamClients.size) return;
  const message = `event: opportunities\ndata: ${JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  })}\n\n`;

  for (const client of Array.from(opportunityStreamClients)) {
    try {
      client.write(message);
    } catch {
      opportunityStreamClients.delete(client);
    }
  }
};

const ensureOpportunityStreamHeartbeat = () => {
  if (opportunityStreamHeartbeat) return;
  opportunityStreamHeartbeat = setInterval(() => {
    for (const client of Array.from(opportunityStreamClients)) {
      try {
        client.write(': keep-alive\n\n');
      } catch {
        opportunityStreamClients.delete(client);
      }
    }
    if (!opportunityStreamClients.size && opportunityStreamHeartbeat) {
      clearInterval(opportunityStreamHeartbeat);
      opportunityStreamHeartbeat = null;
    }
  }, 25000);
};

const _snapshotAtCache = { value: null, expiresAt: 0 };
const getLatestOpportunitySnapshotAt = async () => {
  if (_snapshotAtCache.value && _snapshotAtCache.expiresAt > Date.now()) {
    return _snapshotAtCache.value;
  }
  const latest = await SyncedOpportunity.findOne({}, { syncedAt: 1 })
    .sort({ syncedAt: -1 })
    .lean();
  _snapshotAtCache.value = latest?.syncedAt || null;
  _snapshotAtCache.expiresAt = Date.now() + 5000;
  return _snapshotAtCache.value;
};

const getMergedReportStatus = (item = {}) => {
  const rawStatus = item.tenderResult || item.avenirStatus || item.canonicalStage || item.status || '';
  return String(rawStatus || '').trim().toUpperCase();
};

const isTerminalTenderResult = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'AWARDED' || normalized === 'LOST';
};

const calculateSummaryStats = (data = []) => {
  const canonicalStage = (item) => String(item?.canonicalStage || '').trim().toUpperCase();
  const awardedCount = data.filter((item) => getMergedReportStatus(item) === 'AWARDED').length;
  const lostCount = data.filter((item) => getMergedReportStatus(item) === 'LOST').length;
  const regrettedCount = data.filter((item) => canonicalStage(item) === 'REGRETTED').length;
  const workingCount = data.filter((item) => canonicalStage(item) === 'WORKING').length;
  const toStartCount = data.filter((item) => canonicalStage(item) === 'TO START').length;
  const atRiskCount = data.filter((item) => Boolean(item?.isAtRisk || item?.atRisk)).length;
  const totalActive = data.filter((item) => {
    const stage = canonicalStage(item);
    if (stage === 'WORKING' || stage === 'SUBMITTED') return true;
    return getMergedReportStatus(item) === 'AWARDED';
  }).length;

  return {
    awardedCount,
    wonCount: awardedCount,
    lostCount,
    regrettedCount,
    workingCount,
    toStartCount,
    atRiskCount,
    totalActive,
  };
};

const getRecentTenderData = (data = []) => {
  return [...data]
    .sort((a, b) => {
      const aTime = parseDateValue(a?.dateTenderReceived || a?.createdAt)?.getTime() || 0;
      const bTime = parseDateValue(b?.dateTenderReceived || b?.createdAt)?.getTime() || 0;
      return bTime - aTime;
    })
    .map((item) => ({
      refNo: item?.opportunityRefNo || item?.tenderNo || '—',
      tenderName: item?.tenderName || 'Untitled Tender',
      clientName: item?.clientName || '—',
      receivedDate: item?.dateTenderReceived || item?.createdAt || '',
      status: getMergedReportStatus(item) || 'UNSPECIFIED',
      lead: item?.internalLead || '—',
    }))
    .slice(0, 5);
};

const formatDateForReport = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return String(value || '—');
  return parsed.toLocaleDateString('en-GB');
};

const REPORT_COLORS = {
  navy: '0f172a',
  blue: '1d4ed8',
  blueSoft: 'dbeafe',
  slate: 'e2e8f0',
  slateSoft: 'f8fafc',
  greenSoft: 'dcfce7',
  amberSoft: 'fef3c7',
  redSoft: 'fee2e2',
  white: 'ffffff',
};

const createReportHeaderCell = (text, fill = REPORT_COLORS.slate) => new TableCell({
  borders,
  shading: { fill, type: ShadingType.CLEAR },
  children: [new Paragraph({ text })],
});

const createReportValueCell = (text, fill) => new TableCell({
  borders,
  ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
  children: [new Paragraph({ text: String(text) })],
});

const buildTroubleshootingFromMessage = (message = '') => {
  const text = String(message || '').toLowerCase();
  const hints = [];
  if (text.includes('access denied') || text.includes('accessdenied')) {
    hints.push('Graph permissions may be insufficient. Validate Files.Read.Selected/Sites.Selected/Mail.Send permissions and admin consent.');
    hints.push('Grant resource-level site/file access for Sites.Selected/Files.Read.Selected.');
    hints.push('Verify service mailbox user can access the target workbook and worksheet.');
  }
  if (text.includes('config is incomplete') || text.includes('missing driveid/fileid/worksheetname')) {
    hints.push('Open Admin > Data Sync and complete Share Link, Drive ID, File ID, and Worksheet Name.');
  }
  return hints;
};

const toApiError = (error, fallbackCode = 'SERVER_ERROR') => {
  const message = String(error?.message || 'Unexpected server error');
  const troubleshooting = [
    ...(Array.isArray(error?.details?.troubleshooting) ? error.details.troubleshooting : []),
    ...buildTroubleshootingFromMessage(message),
  ];

  return {
    error: message,
    code: error?.code || error?.details?.code || fallbackCode,
    status: error?.status || error?.details?.status || null,
    details: error?.details || null,
    troubleshooting: [...new Set(troubleshooting)].filter(Boolean),
  };
};

const CONFIG_CACHE_TTL_MS = Number(process.env.CONFIG_CACHE_TTL_MS || 30_000);
const graphConfigCache = {
  value: null,
  expiresAt: 0,
  inFlight: null,
};

const getGraphConfig = async (options = {}) => {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && graphConfigCache.value && graphConfigCache.expiresAt > now) {
    return graphConfigCache.value;
  }
  if (!force && graphConfigCache.inFlight) {
    return graphConfigCache.inFlight;
  }
  graphConfigCache.inFlight = (async () => {
    let config = await GraphSyncConfig.findOne();
    if (!config) config = await GraphSyncConfig.create({});
    graphConfigCache.value = config;
    graphConfigCache.expiresAt = Date.now() + CONFIG_CACHE_TTL_MS;
    return config;
  })().finally(() => {
    graphConfigCache.inFlight = null;
  });
  return graphConfigCache.inFlight;
};

const invalidateGraphConfigCache = () => {
  graphConfigCache.value = null;
  graphConfigCache.expiresAt = 0;
  graphConfigCache.inFlight = null;
};

const REQUIRED_NEW_ROW_COLUMNS = ['YEAR', 'TENDER NO', 'TENDER NAME', 'CLIENT', 'GDS/GES', 'TENDER TYPE', 'DATE TENDER RECD'];
const TELECAST_RECENT_WINDOW_DAYS = 28;
const MAX_ALERTED_TRACKED_KEYS = 50000;
const MAX_ALERTED_TRACKED_REFS = 50000;

const normalizeColumnKey = (value = '') => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeCompanyName = (name = '') => {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const normalizeCompanyKey = (name = '') => normalizeCompanyName(name).toLowerCase();

const splitStringList = (value = []) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((entry) => String(entry || '').trim()).filter(Boolean))];
};

const normalizeAgreementStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'nda') return 'NDA';
  if (normalized === 'association agreement' || normalized === 'association') return 'Association Agreement';
  return 'Pending';
};

const buildVendorPayload = (input = {}) => {
  const companyName = normalizeCompanyName(input.companyName || '');
  return {
    companyName,
    companyKey: normalizeCompanyKey(companyName),
    primaryIndustries: splitStringList(input.primaryIndustries),
    confirmedServices: splitStringList(input.confirmedServices),
    confirmedTechStack: splitStringList(input.confirmedTechStack),
    nonSpecializedTechStack: splitStringList(input.nonSpecializedTechStack),
    sampleProjects: splitStringList(input.sampleProjects),
    certifications: splitStringList(input.certifications),
    partners: splitStringList(input.partners),
    companySize: String(input.companySize || '').trim(),
    sources: splitStringList(input.sources),
    focusArea: String(input.focusArea || '').trim(),
    agreementStatus: normalizeAgreementStatus(input.agreementStatus),
    agreementDocuments: splitStringList(input.agreementDocuments),
    contactPerson: String(input.contactPerson || '').trim(),
    emails: splitStringList(input.emails).map((email) => email.toLowerCase()),
  };
};

const DUMMY_VENDOR_KEYS = [
  'blue ridge analytics',
  'northstar systems',
  'crescent cyber labs',
  'vertex automation works',
  'helix cloud engineering',
  'atlas gis solutions',
];

let vendorCleanupPromise = null;
const cleanupDummyVendors = async () => {
  if (!vendorCleanupPromise) {
    vendorCleanupPromise = Vendor.deleteMany({ companyKey: { $in: DUMMY_VENDOR_KEYS } }).catch((error) => {
      vendorCleanupPromise = null;
      throw error;
    });
  }
  return vendorCleanupPromise;
};

const contactKey = (contact = {}) => {
  const first = String(contact.firstName || '').trim().toLowerCase();
  const last = String(contact.lastName || '').trim().toLowerCase();
  const email = String(contact.email || '').trim().toLowerCase();
  const phone = String(contact.phone || '').trim().replace(/\s+/g, '');
  if (!first && !last && !email && !phone) return '';
  return `${email}|${phone}|${first}|${last}`;
};

const mergeContacts = (existing = [], incoming = []) => {
  const seen = new Set(existing.map((contact) => contactKey(contact)).filter(Boolean));
  const merged = [...existing];
  incoming.forEach((contact) => {
    const key = contactKey(contact);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({
      firstName: String(contact.firstName || '').trim(),
      lastName: String(contact.lastName || '').trim(),
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
    });
  });
  return merged;
};

const getSubmitterFromOpportunity = (opportunity = {}) => {
  const snapshot = opportunity?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  const normalizedEntries = Object.entries(snapshot).reduce((acc, [key, value]) => {
    acc[normalizeColumnKey(key)] = String(value || '').trim();
    return acc;
  }, {});
  return normalizedEntries['SUBMITTED BY'] || normalizedEntries['SUBMITTER'] || normalizedEntries['SUBMITTEDBY'] || '';
};

const normalizeFilterValue = (value = '') => String(value || '').trim().toLowerCase();

const matchFilterValue = (source = '', target = '') => {
  if (!target) return true;
  return normalizeFilterValue(source) === normalizeFilterValue(target);
};

const filterOpportunitiesForBulkApprove = (opportunities = [], filters = {}) => {
  const dateFromRaw = filters?.dateFrom ? parseDateValue(filters.dateFrom) : null;
  const dateToRaw = filters?.dateTo ? parseDateValue(filters.dateTo) : null;
  const dateFrom = dateFromRaw && !Number.isNaN(dateFromRaw.getTime()) ? dateFromRaw : null;
  const dateTo = dateToRaw && !Number.isNaN(dateToRaw.getTime()) ? dateToRaw : null;

  const group = normalizeFilterValue(filters.group || '');
  const lead = normalizeFilterValue(filters.lead || '');
  const client = normalizeFilterValue(filters.client || '');
  const submitter = normalizeFilterValue(filters.submitter || '');
  const status = normalizeFilterValue(filters.status || '');

  return opportunities.filter((opportunity) => {
    if (group && normalizeFilterValue(opportunity.groupClassification || '') !== group) return false;
    if (lead && normalizeFilterValue(opportunity.internalLead || '') !== lead) return false;
    if (client && normalizeFilterValue(opportunity.clientName || '') !== client) return false;
    if (submitter) {
      const submittedBy = getSubmitterFromOpportunity(opportunity);
      if (normalizeFilterValue(submittedBy) !== submitter) return false;
    }

    if (status) {
      const mergedStatus = normalizeFilterValue(getMergedReportStatus(opportunity));
      const canonicalStage = normalizeFilterValue(opportunity?.canonicalStage || opportunity?.status || '');
      if (isTerminalTenderResult(status)) {
        if (mergedStatus !== status) return false;
      } else if (mergedStatus !== status && canonicalStage !== status) {
        return false;
      }
    }

    if (dateFrom || dateTo) {
      const received = getTenderReceivedDate(opportunity);
      if (!received) return false;
      if (dateFrom && received < dateFrom) return false;
      if (dateTo && received > dateTo) return false;
    }

    return true;
  });
};

const buildClientSeedFromOpportunity = (opportunity = {}) => {
  const rawName = opportunity?.clientName || opportunity?.rawGraphData?.rowSnapshot?.CLIENT || '';
  const companyName = normalizeCompanyName(rawName);
  if (!companyName) return null;
  const companyKey = normalizeCompanyKey(companyName);
  const group = String(opportunity?.groupClassification || '').trim();
  return { companyName, companyKey, group };
};

const syncClientsFromOpportunities = async (opportunities = []) => {
  const clientMap = new Map();
  opportunities.forEach((opportunity) => {
    const seed = buildClientSeedFromOpportunity(opportunity);
    if (!seed) return;
    clientMap.set(seed.companyKey, seed);
  });

  const keys = Array.from(clientMap.keys());
  if (!keys.length) return { created: 0, updated: 0 };

  const existing = await Client.find({ companyKey: { $in: keys } }).lean();
  const existingKeys = new Set(existing.map((client) => client.companyKey));

  const ops = [];
  keys.forEach((key) => {
    const seed = clientMap.get(key);
    if (!seed) return;
    const companyName = seed.companyName;
    const group = seed.group || '';
    if (!existingKeys.has(key)) {
      ops.push({
        insertOne: {
          document: {
            companyName,
            companyKey: key,
            group,
            domain: '',
            location: { city: '', country: '' },
            contacts: [],
          },
        },
      });
    } else {
      const update = { companyName };
      if (group) update.group = group;
      ops.push({
        updateOne: {
          filter: { companyKey: key },
          update: { $set: update },
        },
      });
    }
  });

  if (!ops.length) return { created: 0, updated: 0 };
  const result = await Client.bulkWrite(ops, { ordered: false });
  return {
    created: result.insertedCount || 0,
    updated: result.modifiedCount || 0,
  };
};

const getNormalizedRowSnapshot = (opportunity) => {
  const snapshot = opportunity?.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return {};
  return Object.entries(snapshot).reduce((acc, [key, value]) => {
    acc[normalizeColumnKey(key)] = String(value || '').trim();
    return acc;
  }, {});
};

const hasRequiredRowValues = (opportunity) => {
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  return REQUIRED_NEW_ROW_COLUMNS.every((col) => Boolean(normalizedEntries[col]));
};

const buildRowSignature = (opportunity) => {
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  const parts = REQUIRED_NEW_ROW_COLUMNS.map((col) => normalizedEntries[col] || '');
  return parts.map((part) => String(part).trim().toUpperCase()).join('||');
};

const normalizeRefNo = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getTenderRefNo = (opportunity) => {
  const direct = normalizeRefNo(opportunity?.opportunityRefNo || '');
  if (direct) return direct;
  const normalizedEntries = getNormalizedRowSnapshot(opportunity);
  return normalizeRefNo(normalizedEntries['TENDER NO'] || '');
};

const buildNotificationKey = (opportunity) => {
  const ref = getTenderRefNo(opportunity);
  if (ref) return `REF::${ref}`;
  const signature = buildRowSignature(opportunity);
  return signature ? `SIG::${signature}` : '';
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const yearRaw = Number(dmyMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    const asDmy = new Date(Date.UTC(year, month - 1, day));
    if (
      asDmy.getUTCFullYear() === year
      && asDmy.getUTCMonth() === month - 1
      && asDmy.getUTCDate() === day
    ) {
      return asDmy;
    }

    const asMdy = new Date(Date.UTC(year, day - 1, month));
    if (
      asMdy.getUTCFullYear() === year
      && asMdy.getUTCMonth() === day - 1
      && asMdy.getUTCDate() === month
    ) {
      return asMdy;
    }
  }

  return null;
};

const getTenderReceivedDate = (opportunity) => (
  parseDateValue(opportunity?.dateTenderReceived)
  || parseDateValue(opportunity?.rawGraphData?.rowSnapshot?.['DATE TENDER RECD'])
);

const isTenderRecentForTelecast = (opportunity, now = new Date()) => {
  const received = getTenderReceivedDate(opportunity);
  if (!received) return false;
  const ageMs = now.getTime() - received.getTime();
  if (ageMs < 0) return false;
  return ageMs <= TELECAST_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

const TELECAST_TEMPLATE_KEYWORDS = [
  '{{TENDER_NO}}', '{{TENDER_NAME}}', '{{CLIENT}}', '{{GROUP}}', '{{TENDER_TYPE}}', '{{DATE_TENDER_RECD}}', '{{SUBMISSION_DATE}}', '{{YEAR}}', '{{LEAD}}', '{{OPPORTUNITY_ID}}', '{{COMMENTS}}',
];

const normalizeEmailList = (value) => {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[\n,;]+/g);
  return [...new Set(parts.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeLeadValue = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeLeadKey = (value = '') => normalizeLeadValue(value).replace(/\s+/g, ' ').trim();

const buildLeadNameRegex = (leadName = '') => {
  const normalized = normalizeLeadKey(leadName);
  if (!normalized) return null;
  const tokens = normalized.split(' ').map((token) => escapeRegex(token));
  const pattern = `^\\s*${tokens.join('\\s+')}\\s*$`;
  return new RegExp(pattern, 'i');
};

const buildLeadEmailDirectory = (mappings = []) => {
  const directory = new Map();
  mappings.forEach((mapping) => {
    const email = String(mapping?.leadEmail || '').trim().toLowerCase();
    if (!email) return;
    const key = normalizeLeadKey(mapping?.leadNameKey || mapping?.leadNameDisplay || '');
    if (key && !directory.has(key)) {
      directory.set(key, email);
    }
  });
  return directory;
};

const tokenizeLeadValue = (value = '') => normalizeLeadValue(value).split(' ').filter(Boolean);

const scoreLeadEmailMatch = (leadName = '', user = {}) => {
  const leadNorm = normalizeLeadValue(leadName);
  if (!leadNorm) return 0;

  const displayNorm = normalizeLeadValue(user.displayName || '');
  const emailLocal = normalizeLeadValue(String(user.email || '').split('@')[0].replace(/[._-]+/g, ' '));

  if (leadNorm && displayNorm && leadNorm === displayNorm) return 100;
  if (leadNorm && emailLocal && leadNorm === emailLocal) return 95;

  const leadTokens = tokenizeLeadValue(leadNorm);
  if (!leadTokens.length) return 0;

  const overlapScore = (candidate) => {
    const candidateTokens = tokenizeLeadValue(candidate);
    if (!candidateTokens.length) return 0;
    let matches = 0;
    leadTokens.forEach((token) => {
      if (candidateTokens.includes(token)) matches += 1;
    });
    return matches / leadTokens.length;
  };

  const displayScore = overlapScore(displayNorm);
  const emailScore = overlapScore(emailLocal);
  const maxScore = Math.max(displayScore, emailScore);

  if (!maxScore) return 0;
  const baseScore = Math.round(85 * maxScore);
  const includesBonus = (displayNorm.includes(leadNorm) || emailLocal.includes(leadNorm)) ? 5 : 0;
  return Math.min(90, baseScore + includesBonus);
};

const findBestLeadEmailMatch = (leadName = '', users = []) => {
  let best = null;
  let bestScore = 0;
  users.forEach((user) => {
    const score = scoreLeadEmailMatch(leadName, user);
    if (score > bestScore) {
      bestScore = score;
      best = user;
    }
  });
  return { best, score: bestScore };
};

const resolveLeadEmailForOpportunity = (opportunity, leadDirectory = null) => {
  const direct = String(opportunity?.leadEmail || '').trim().toLowerCase();
  if (direct) {
    return { email: direct, source: 'opportunity' };
  }
  if (!leadDirectory) {
    return { email: '', source: 'missing' };
  }
  const leadKey = normalizeLeadKey(opportunity?.internalLead || '');
  if (leadKey && leadDirectory.has(leadKey)) {
    return { email: leadDirectory.get(leadKey), source: 'mapping' };
  }
  return { email: '', source: 'missing' };
};

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const getGroupFromOpportunity = (opportunity) => {
  const raw = String(opportunity?.groupClassification || opportunity?.rawGraphData?.rowSnapshot?.['GDS/GES'] || '').toUpperCase().trim();
  if (raw.includes('GES')) return 'GES';
  if (raw.includes('GDS')) return 'GDS';
  if (raw.includes('GTS')) return 'GTS';
  return 'UNKNOWN';
};

const getSubmissionDate = (opportunity) => (
  opportunity?.tenderSubmittedDate
  || opportunity?.tenderPlannedSubmissionDate
  || opportunity?.rawGraphData?.rowSnapshot?.['SUBMISSION DATE']
  || ''
);

const getTemplateValues = (opportunity) => {
  const row = opportunity?.rawGraphData?.rowSnapshot || {};
  const tenderNo = opportunity?.opportunityRefNo || row['TENDER NO'] || '';
  const tenderName = opportunity?.tenderName || row['TENDER NAME'] || '';
  const client = opportunity?.clientName || row.CLIENT || '';
  const group = getGroupFromOpportunity(opportunity);
  const tenderType = opportunity?.opportunityClassification || row['TENDER TYPE'] || '';
  const dateTenderRecd = opportunity?.dateTenderReceived || row['DATE TENDER RECD'] || '';
  const submissionDate = getSubmissionDate(opportunity);
  const year = row.YEAR || opportunity?.rawGraphData?.year || '';
  const lead = opportunity?.internalLead || row.LEAD || '';
  const comments = opportunity?.comments || row.COMMENTS || '';

  return {
    TENDER_NO: String(tenderNo || ''),
    TENDER_NAME: String(tenderName || ''),
    CLIENT: String(client || ''),
    GROUP: String(group || ''),
    TENDER_TYPE: String(tenderType || ''),
    DATE_TENDER_RECD: String(dateTenderRecd || ''),
    SUBMISSION_DATE: String(submissionDate || ''),
    YEAR: String(year || ''),
    LEAD: String(lead || ''),
    OPPORTUNITY_ID: String(opportunity?.id || ''),
    COMMENTS: String(comments || ''),
  };
};

const renderTemplate = (template = '', values = {}) => {
  let output = String(template || '');
  Object.entries(values).forEach(([key, value]) => {
    const token = `{{${key}}}`;
    output = output.split(token).join(String(value ?? ''));
  });
  return output;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const nl2br = (value = '') => escapeHtml(value).replace(/\n/g, '<br />');

const TELECAST_TEMPLATE_STYLES = {
  avenir_blue: {
    key: 'avenir_blue',
    label: 'Avenir Blue',
    description: 'Deep navy header with blue summary styling.',
    colors: {
      pageBg: '#f8fafc',
      cardBorder: '#dbeafe',
      headerBg: '#0f172a',
      headerGradient: 'linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%)',
      summaryBg: '#eff6ff',
      summaryBorder: '#bfdbfe',
      summaryText: '#1e3a8a',
      tableHeaderBg: '#f8fafc',
      tableHeaderText: '#475569',
      tableRowAlt: '#f8fafc',
    },
  },
  emerald_signal: {
    key: 'emerald_signal',
    label: 'Emerald Signal',
    description: 'Green alert palette for softer operational notifications.',
    colors: {
      pageBg: '#f0fdf4',
      cardBorder: '#bbf7d0',
      headerBg: '#14532d',
      headerGradient: 'linear-gradient(135deg,#14532d 0%,#059669 100%)',
      summaryBg: '#ecfdf5',
      summaryBorder: '#86efac',
      summaryText: '#166534',
      tableHeaderBg: '#f0fdf4',
      tableHeaderText: '#166534',
      tableRowAlt: '#f7fee7',
    },
  },
  sunset_alert: {
    key: 'sunset_alert',
    label: 'Sunset Alert',
    description: 'Warm amber/orange palette for high-visibility tender alerts.',
    colors: {
      pageBg: '#fff7ed',
      cardBorder: '#fed7aa',
      headerBg: '#7c2d12',
      headerGradient: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 100%)',
      summaryBg: '#ffedd5',
      summaryBorder: '#fdba74',
      summaryText: '#9a3412',
      tableHeaderBg: '#fff7ed',
      tableHeaderText: '#9a3412',
      tableRowAlt: '#fffaf0',
    },
  },
};

const getTelecastTemplateStyle = (styleKey = '') =>
  TELECAST_TEMPLATE_STYLES[String(styleKey || '').trim()] || TELECAST_TEMPLATE_STYLES.avenir_blue;

const buildTelecastEmailHtml = ({ values, renderedBody = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = [
    ['Tender Ref', values.TENDER_NO || '—'],
    ['Tender Name', values.TENDER_NAME || '—'],
    ['Client', values.CLIENT || '—'],
    ['Group', values.GROUP || '—'],
    ['Tender Type', values.TENDER_TYPE || '—'],
    ['Date Received', values.DATE_TENDER_RECD || '—'],
    ['Lead', values.LEAD || '—'],
  ];

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">&#9888; Tender Alert</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A new tender row was detected and matched your telecast rules.</p>
        </div>
        <div style="padding:24px 28px;">
          ${renderedBody ? `<div style="margin-bottom:18px;font-size:14px;line-height:1.7;color:#334155;">${nl2br(renderedBody)}</div>` : ''}
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:10px;">Summary</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <tbody>
                ${rows.map(([label, value], index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <th style="width:32%;padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};background:${colors.tableHeaderBg};border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(label)}</th>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(value)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:28px;text-align:center;">
            <a href="${DASHBOARD_URL}" style="display:inline-block;padding:12px 28px;background:${colors.headerBg};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.04em;">Open Dashboard &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  `;
};

const DASHBOARD_URL = String(process.env.APP_URL || 'https://avin.avenirenergy.me').replace(/\/$/, '');

const buildAwardBatchEmailHtml = ({ rows = [], group = '', bodyText = '', styleKey = 'emerald_signal' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const formatValue = (v) => {
    const n = Number(v);
    if (!n) return '—';
    return n >= 1_000_000 ? `AED ${(n / 1_000_000).toFixed(2)}M` : `AED ${n.toLocaleString()}`;
  };
  const rowsHtml = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(r.opportunityRefNo || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(r.tenderName || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(r.clientName || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(r.internalLead || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(r.awardedDate || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(formatValue(r.opportunityValue))}</td>
    </tr>
  `).join('');
  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:800px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Award Alert</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">&#127942; Newly Awarded Tenders — ${escapeHtml(group)}</h1>
        </div>
        <div style="padding:24px 28px;">
          ${bodyText ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;">${nl2br(escapeHtml(bodyText))}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;border-spacing:0;border:1px solid ${colors.summaryBorder};border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:${colors.tableHeaderBg};">
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Ref No</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Name</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Client</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Lead</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Awarded Date</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Value</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div style="margin-top:28px;text-align:center;">
            <a href="${DASHBOARD_URL}" style="display:inline-block;padding:12px 28px;background:${colors.headerBg};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.04em;">Open Dashboard &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  `;
};

const buildAwardValueReportEmailHtml = ({ missing = [], dateStr = '' }) => {
  const style = getTelecastTemplateStyle('sunset_alert');
  const colors = style.colors;
  const rowsHtml = missing.map((o, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.opportunityRefNo || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.tenderName || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.clientName || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.groupClassification || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.internalLead || '—')}</td>
      <td style="padding:10px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(o.awardedDate || '—')}</td>
    </tr>
  `).join('');
  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:800px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Reports</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">&#128200; Award Value Report — ${escapeHtml(dateStr)}</h1>
          <p style="margin:10px 0 0;font-size:14px;opacity:0.92;">Awarded tenders with missing or zero value requiring attention.</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="margin-bottom:18px;padding:14px 18px;border-radius:12px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};">
            <p style="margin:0;font-size:14px;color:${colors.summaryText};">
              <strong>${missing.length} tender${missing.length !== 1 ? 's' : ''}</strong> with missing or zero value found as of ${escapeHtml(dateStr)}. Please update the opportunity value in the dashboard.
              The full Excel report is attached to this email.
            </p>
          </div>
          ${missing.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;border-spacing:0;border:1px solid ${colors.summaryBorder};border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:${colors.tableHeaderBg};">
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Ref No</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Name</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Client</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Group</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Lead</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Awarded Date</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>` : ''}
          <div style="margin-top:28px;text-align:center;">
            <a href="${DASHBOARD_URL}" style="display:inline-block;padding:12px 28px;background:${colors.headerBg};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.04em;">Open Dashboard &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  `;
};

const buildIssueReportEmailHtml = ({
  styleKey = 'avenir_blue',
  reporter = '',
  role = '',
  email = '',
  page = '',
  reportedAt = '',
  issueTypes = '',
  feature = '',
  summary = '',
  steps = '',
  comments = '',
}) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Reporting</div>
          <h2 style="margin:0;font-size:24px;line-height:1.2;">Issue Report</h2>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A new issue report was submitted from the dashboard.</p>
        </div>
        <div style="padding:24px 28px;">
          <table style="border-collapse:collapse;width:100%;max-width:704px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Reporter</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${reporter} (${role})</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Email</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${email}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Page</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${page}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Time (UTC)</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${reportedAt}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Issue Type(s)</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${issueTypes}</td>
            </tr>
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Feature</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${feature}</td>
            </tr>
            ${summary ? `<tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Summary</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;">${summary}</td>
            </tr>` : ''}
            ${steps ? `<tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Steps to Reproduce</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;"><div style="white-space:pre-wrap;line-height:1.7;">${steps}</div></td>
            </tr>` : ''}
            <tr>
              <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border:1px solid ${colors.cardBorder};">Comments</th>
              <td style="padding:10px 12px;border:1px solid #e2e8f0;"><div style="white-space:pre-wrap;line-height:1.7;">${comments}</div></td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
};

const buildApprovalAlertEmailHtml = ({ values, renderedBody = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = [
    ['Tender Ref', values.TENDER_NO || '—'],
    ['Tender Name', values.TENDER_NAME || '—'],
    ['Client', values.CLIENT || '—'],
    ['Group', values.GROUP || '—'],
    ['Tender Type', values.TENDER_TYPE || '—'],
    ['Date Received', values.DATE_TENDER_RECD || '—'],
    ['Lead', values.LEAD || '—'],
  ];

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Approval Alert</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">A tender has been approved by the Tender Manager and is ready for SVP review.</p>
        </div>
        <div style="padding:24px 28px;">
          ${renderedBody ? `<div style="margin-bottom:18px;font-size:14px;line-height:1.7;color:#334155;">${nl2br(renderedBody)}</div>` : ''}
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:10px;">Summary</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <tbody>
                ${rows.map(([label, value], index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <th style="width:32%;padding:10px 12px;text-align:left;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.tableHeaderText};background:${colors.tableHeaderBg};border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(label)}</th>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(value)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
};

const formatIsoDate = (value) => {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toISOString().slice(0, 10) : '—';
};

const buildBulkApprovalAlertEmailHtml = ({ group = '', opportunities = [], summaryText = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const rows = opportunities.map((opp) => ({
    tenderNo: opp?.opportunityRefNo || opp?.rawGraphData?.rowSnapshot?.['TENDER NO'] || '—',
    tenderName: opp?.tenderName || opp?.rawGraphData?.rowSnapshot?.['TENDER NAME'] || '—',
    client: opp?.clientName || opp?.rawGraphData?.rowSnapshot?.CLIENT || '—',
    lead: opp?.internalLead || opp?.rawGraphData?.rowSnapshot?.LEAD || '—',
    received: formatIsoDate(getTenderReceivedDate(opp)),
  }));

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
          <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Bulk Approval</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">${summaryText || `Tenders approved for ${escapeHtml(group || 'Group')}`}</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="margin-bottom:18px;padding:16px 18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};color:${colors.summaryText};">
            <strong style="display:block;margin-bottom:12px;">Approved Tenders (${rows.length})</strong>
            <table style="width:100%;border-collapse:collapse;border-spacing:0;overflow:hidden;border:1px solid ${colors.summaryBorder};border-radius:12px;background:#ffffff;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Ref</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Tender Name</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Client</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Lead</th>
                  <th style="text-align:left;padding:10px 12px;background:${colors.tableHeaderBg};color:${colors.tableHeaderText};border-bottom:1px solid ${colors.summaryBorder};">Date Received</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row, index) => `
                  <tr style="background:${index % 2 === 0 ? '#ffffff' : colors.tableRowAlt};">
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.tenderNo)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.tenderName)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.client)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.lead)}</td>
                    <td style="padding:10px 12px;font-size:14px;color:#0f172a;border-bottom:1px solid ${colors.summaryBorder};">${escapeHtml(row.received)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
};

const sendApprovalAlertForOpportunity = async ({ opportunity, approvedBy = '' }) => {
  const config = await getSystemConfig();
  if (!config.approvalAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const telecastSender = telecastRopcUsername();
  if (!telecastSender) return { success: true, skipped: 'telecast_sender_not_configured' };

  const group = getGroupFromOpportunity(opportunity);
  if (!group) {
    return { success: true, skipped: 'no_group' };
  }

  const recipients = await AuthorizedUser.find({
    role: { $in: ['SVP'] },
    status: 'approved',
    assignedGroup: group,
  }).lean();
  const recipientEmails = normalizeEmailList(recipients.map((user) => user.email));
  if (!recipientEmails.length) {
    return { success: true, skipped: 'no_recipients' };
  }

  const values = {
    ...getTemplateValues(opportunity),
    COMMENTS: approvedBy ? `Approved by Tender Manager: ${approvedBy}` : getTemplateValues(opportunity).COMMENTS,
  };
  const subjectTemplate = config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.';
  const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
  const subject = renderTemplate(subjectTemplate, values);
  const renderedBody = renderTemplate(bodyTemplate, values);
  const html = buildApprovalAlertEmailHtml({ values, renderedBody, styleKey: style.key });
  const { accessToken } = await getTelecastSendMailAccessToken();

  const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: recipientEmails.map((email) => ({ emailAddress: { address: email } })),
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const payload = await graphResponse.json().catch(() => ({}));
    telecastDebug('Approval alert sendMail failed.', { status: graphResponse.status, message: payload?.error?.message });
    throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
  }

  return { success: true, recipients: recipientEmails.length };
};

const getDateKeyLocal = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : parseDateValue(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shouldSendDeadlineAlert = (opportunity, now = new Date()) => {
  const deadlineKey = getDateKeyLocal(getSubmissionDate(opportunity));
  if (!deadlineKey) return { shouldSend: false };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = getDateKeyLocal(tomorrow);
  if (deadlineKey !== tomorrowKey) return { shouldSend: false };
  if (String(opportunity?.deadlineAlertedDateKey || '') === deadlineKey) return { shouldSend: false };
  return { shouldSend: true, deadlineKey };
};

const sendDeadlineAlertForOpportunity = async ({ opportunity, config, leadDirectory }) => {
  if (!config.deadlineAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const telecastSender = telecastRopcUsername();
  if (!telecastSender) return { success: true, skipped: 'telecast_sender_not_configured' };

  const { email: leadEmail, source: leadEmailSource } = resolveLeadEmailForOpportunity(opportunity, leadDirectory);
  if (!leadEmail) {
    return { success: true, skipped: 'no_lead_email' };
  }

  const selectedClients = Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [];
  if (selectedClients.length) {
    const normalizedClients = new Set(selectedClients.map((client) => String(client || '').trim().toLowerCase()).filter(Boolean));
    const clientName = String(opportunity?.clientName || '').trim().toLowerCase();
    if (!normalizedClients.has(clientName)) {
      return { success: true, skipped: 'client_not_selected' };
    }
  }

  const { shouldSend, deadlineKey } = shouldSendDeadlineAlert(opportunity, new Date());
  if (!shouldSend) {
    return { success: true, skipped: 'not_due' };
  }

  const values = getTemplateValues(opportunity);
  const subjectTemplate = config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.';
  const style = getTelecastTemplateStyle(config.deadlineAlertTemplateStyle || 'sunset_alert');
  const subject = renderTemplate(subjectTemplate, values);
  const renderedBody = renderTemplate(bodyTemplate, values);
  const html = buildTelecastEmailHtml({ values, renderedBody, styleKey: style.key });
  const { accessToken } = await getTelecastSendMailAccessToken();

  const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: leadEmail } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const payload = await graphResponse.json().catch(() => ({}));
    telecastDebug('Deadline alert sendMail failed.', { status: graphResponse.status, message: payload?.error?.message });
    throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
  }

  return { success: true, deadlineKey, leadEmail, leadEmailSource };
};

const buildDateRangeForOpportunities = (opportunities = [], filters = {}) => {
  const explicitFrom = parseDateValue(filters?.dateFrom);
  const explicitTo = parseDateValue(filters?.dateTo);
  const receivedDates = opportunities
    .map((opp) => getTenderReceivedDate(opp))
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const start = explicitFrom || receivedDates[0] || null;
  const end = explicitTo || (receivedDates.length ? receivedDates[receivedDates.length - 1] : null);
  const format = (value) => (value ? value.toISOString().slice(0, 10) : '—');

  return {
    start,
    end,
    text: start || end ? `${format(start)} to ${format(end || start)}` : 'recent period',
  };
};

const sendBulkApprovalAlerts = async ({ opportunities = [], approvedBy = '', filters = {} }) => {
  if (!opportunities.length) return { success: true, skipped: 'no_new_opportunities' };

  const config = await getSystemConfig();
  if (!config.approvalAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const telecastSender = getTelecastSender();
  if (!telecastSender) {
    return { success: true, skipped: 'telecast_sender_not_configured' };
  }

  const grouped = opportunities.reduce((acc, opp) => {
    const group = getGroupFromOpportunity(opp);
    if (!group || group === 'UNKNOWN') return acc;
    if (!acc[group]) acc[group] = [];
    acc[group].push(opp);
    return acc;
  }, {});

  const { accessToken } = await getTelecastSendMailAccessToken(config);
  const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
  const results = {};

  for (const [group, groupOpps] of Object.entries(grouped)) {
    const recipients = await AuthorizedUser.find({
      role: { $in: ['SVP'] },
      status: 'approved',
      assignedGroup: group,
    }).lean();
    const recipientEmails = normalizeEmailList(recipients.map((user) => user.email));
    if (!recipientEmails.length) {
      results[group] = { success: true, skipped: 'no_recipients' };
      continue;
    }

    const { text: rangeText } = buildDateRangeForOpportunities(groupOpps, filters);
    const count = groupOpps.length;
    const subject = `Tender Manager Bulk Approval: ${group} (${count} tenders)`;

    let html;
    if (count > 10) {
      const summary = `${approvedBy || 'Tender Manager'} approved ${count} tenders for ${group} (received ${rangeText}).`;
      html = `
        <div style="margin:0;padding:24px;background:${style.colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${style.colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
            <div style="padding:24px 28px;background-color:${style.colors.headerBg};background:${style.colors.headerGradient};color:#ffffff;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Approval Telecast</div>
              <h1 style="margin:0;font-size:24px;line-height:1.2;">✅ Tender Manager Bulk Approval</h1>
            </div>
            <div style="padding:24px 28px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(summary)}</div>
          </div>
        </div>
      `;
    } else {
      const summaryText = `${approvedBy || 'Tender Manager'} approved ${count} tender${count === 1 ? '' : 's'} for ${group} (received ${rangeText}).`;
      html = buildBulkApprovalAlertEmailHtml({ group, opportunities: groupOpps, summaryText, styleKey: style.key });
    }

    telecastDebug('Sending bulk approval alert mail.', {
      group,
      recipients: recipientEmails.length,
      tenders: count,
      sender: telecastSender,
    });

    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${telecastSender}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: recipientEmails.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      telecastDebug('Bulk approval alert mail failed.', { group, status: graphResponse.status, message: payload?.error?.message });
      throw new Error(payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`);
    }

    results[group] = { success: true, recipients: recipientEmails.length, tenders: count };
  }

  return { success: true, results };
};

const sendAwardAlerts = async () => {
  if (!isDatabaseReady()) return;
  const config = await getSystemConfig();
  if (!config.tlAssignAlertEnabled && !config.pmAssignAlertEnabled) return;

  const newlyAwarded = await SyncedOpportunity.find({
    canonicalStage: 'AWARDED',
    awardEventNotified: { $ne: true },
  }, {
    opportunityRefNo: 1, tenderName: 1, clientName: 1, internalLead: 1,
    awardedDate: 1, opportunityValue: 1, groupClassification: 1,
  }).lean();
  if (!newlyAwarded.length) return;

  const byGroup = {};
  for (const opp of newlyAwarded) {
    const g = String(opp.groupClassification || 'OTHER').trim().toUpperCase();
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(opp);
  }

  const { accessToken } = await getTelecastSendMailAccessToken();
  const telecastSender = getTelecastSender();

  for (const group of Object.keys(byGroup)) {
    const rows = byGroup[group];
    const svps = await AuthorizedUser.find({ role: 'SVP', assignedGroup: group, status: 'approved' }).lean();
    const svpEmails = svps.map(s => String(s.email || '').trim().toLowerCase()).filter(Boolean);
    if (!svpEmails.length) continue;

    const toRecipients = svpEmails.map(e => ({ emailAddress: { address: e } }));

    if (config.tlAssignAlertEnabled) {
      const subject = (config.tlAssignAlertTemplateSubject || 'Action Required: TL Assignment — {{GROUP}}').replace('{{GROUP}}', group);
      const html = buildAwardBatchEmailHtml({ rows, group, bodyText: config.tlAssignAlertTemplateBody, styleKey: config.tlAssignAlertTemplateStyle || 'emerald_signal' });
      queueMail(`award-tl-${group}`, async () => {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients }, saveToSentItems: true }),
        });
        if (!resp.ok) {
          const p = await resp.json().catch(() => ({}));
          throw new Error(p?.error?.message || `Graph sendMail failed ${resp.status}`);
        }
        console.log(`[award-tl-alert] Sent to ${svpEmails.join(',')} for group ${group}, ${rows.length} rows`);
      });
    }

    if (config.pmAssignAlertEnabled) {
      const subject = (config.pmAssignAlertTemplateSubject || 'Action Required: PM Assignment — {{GROUP}}').replace('{{GROUP}}', group);
      const html = buildAwardBatchEmailHtml({ rows, group, bodyText: config.pmAssignAlertTemplateBody, styleKey: config.pmAssignAlertTemplateStyle || 'emerald_signal' });
      queueMail(`award-pm-${group}`, async () => {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients }, saveToSentItems: true }),
        });
        if (!resp.ok) {
          const p = await resp.json().catch(() => ({}));
          throw new Error(p?.error?.message || `Graph sendMail failed ${resp.status}`);
        }
        console.log(`[award-pm-alert] Sent to ${svpEmails.join(',')} for group ${group}, ${rows.length} rows`);
      });
    }
  }

  const ids = newlyAwarded.map(r => r._id);
  await SyncedOpportunity.bulkWrite(ids.map(id => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { awardEventNotified: true, awardEventNotifiedAt: new Date(), awardEventSource: 'award_batch_scheduler' } },
    },
  })), { ordered: false });
};

const sendLeadNotifications = async () => {
  if (!isDatabaseReady()) return;
  const config = await getSystemConfig();
  if (!config.leadNotifEnabled) return;
  const recipients = Array.isArray(config.leadNotifRecipients) ? config.leadNotifRecipients.filter(Boolean) : [];
  if (!recipients.length) return;

  let query;
  if (config.leadNotifTrigger === 'awarded') {
    query = { canonicalStage: 'AWARDED', leadNotifAlerted: { $ne: true } };
  } else if (config.leadNotifTrigger === 'any_stage') {
    query = { leadNotifAlerted: { $ne: true } };
  } else {
    const since = config.leadNotifSeededAt ? new Date(config.leadNotifSeededAt) : new Date(0);
    query = { createdAt: { $gt: since }, leadNotifAlerted: { $ne: true } };
  }

  const rows = await SyncedOpportunity.find(query, {
    opportunityRefNo: 1, tenderName: 1, clientName: 1, groupClassification: 1,
    internalLead: 1, canonicalStage: 1, syncedAt: 1,
  }).lean();
  if (!rows.length) return;

  const { accessToken } = await getTelecastSendMailAccessToken();
  const toRecipients = recipients.map(e => ({ emailAddress: { address: e } }));

  for (const row of rows) {
    const values = getTemplateValues(row);
    const subject = renderTemplate(config.leadNotifTemplateSubject || 'Notification: {{TENDER_NO}}', values);
    const bodyRendered = renderTemplate(config.leadNotifTemplateBody || '{{TENDER_NAME}} — {{CLIENT}}', values);
    const html = buildTelecastEmailHtml({ values, renderedBody: bodyRendered, styleKey: config.leadNotifTemplateStyle || 'avenir_blue' });
    const refNo = String(row.opportunityRefNo || row._id);
    queueMail(`lead-notif-${refNo}`, async () => {
      const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients }, saveToSentItems: true }),
      });
      if (!resp.ok) {
        const p = await resp.json().catch(() => ({}));
        throw new Error(p?.error?.message || `Graph sendMail failed ${resp.status}`);
      }
    });
  }

  await SyncedOpportunity.bulkWrite(rows.map(r => ({
    updateOne: {
      filter: { _id: r._id },
      update: { $set: { leadNotifAlerted: true, leadNotifAlertedAt: new Date(), leadNotifAlertedKey: `lead_notif_${r.opportunityRefNo || r._id}` } },
    },
  })), { ordered: false });
};

const sendDeadlineAlerts = async () => {
  const config = await getSystemConfig();
  if (!config.deadlineAlertEnabled) {
    return { success: true, skipped: 'disabled' };
  }

  const leadMappings = await LeadEmailMapping.find({}).lean();
  const leadDirectory = buildLeadEmailDirectory(leadMappings);
  const opportunities = await SyncedOpportunity.find({
    $or: [
      { leadEmail: { $exists: true, $ne: '' } },
      { internalLead: { $exists: true, $ne: '' } },
    ],
  }).lean();

  let sent = 0;
  let skipped = 0;
  const bulkOps = [];
  const now = new Date();
  for (const opportunity of opportunities) {
    try {
      const result = await sendDeadlineAlertForOpportunity({ opportunity, config, leadDirectory });
      if (result?.success && result.deadlineKey) {
        const leadEmailUpdate = result.leadEmailSource === 'mapping' && !opportunity.leadEmail
          ? {
            leadEmail: result.leadEmail,
            leadEmailSource: 'mapping',
            leadEmailAssignedBy: 'system',
            leadEmailAssignedAt: now,
          }
          : {};
        bulkOps.push({
          updateOne: {
            filter: { _id: opportunity._id },
            update: {
              $set: {
                deadlineAlerted: true,
                deadlineAlertedAt: now,
                deadlineAlertedDateKey: result.deadlineKey,
                ...leadEmailUpdate,
              },
            },
          },
        });
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      console.error('[deadline-alert.error]', error?.message || error);
      skipped += 1;
    }
  }

  if (bulkOps.length) {
    await SyncedOpportunity.bulkWrite(bulkOps, { ordered: false });
  }

  return { success: true, sent, skipped };
};

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

const getWeekWindow = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const weekKey = `${start.getUTCFullYear()}-W${Math.ceil((((start - new Date(Date.UTC(start.getUTCFullYear(),0,1))) / 86400000) + 1) / 7)}`;
  return { weekKey, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
};

const pushWeeklyTelecastStats = (config, newRows = []) => {
  const { weekKey, startDate, endDate } = getWeekWindow(new Date());
  const byGroup = newRows.reduce((acc, row) => {
    const g = getGroupFromOpportunity(row);
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  const history = Array.isArray(config.telecastWeeklyStats) ? [...config.telecastWeeklyStats] : [];
  const idx = history.findIndex((item) => item?.weekKey === weekKey);
  if (idx >= 0) {
    history[idx].newRowsCount = Number(history[idx].newRowsCount || 0) + newRows.length;
    history[idx].byGroup = { ...(history[idx].byGroup || {}), ...Object.fromEntries(Object.entries(byGroup).map(([k,v]) => [k, Number(v) + Number(history[idx].byGroup?.[k] || 0)])) };
    history[idx].updatedAt = new Date();
  } else {
    history.push({ weekKey, startDate, endDate, newRowsCount: newRows.length, byGroup, updatedAt: new Date() });
  }
  config.telecastWeeklyStats = history.slice(-12);
};

const getExistingTelecastStateFromSyncedOpportunities = async () => {
  const rows = await SyncedOpportunity.find(
    {},
    {
      telecastAlerted: 1,
      telecastAlertedKey: 1,
      telecastAlertedRefNo: 1,
      telecastAlertedAt: 1,
      telecastAlertSource: 1,
      opportunityRefNo: 1,
      rawGraphData: 1,
    }
  ).lean();

  const alertedKeySet = new Set();
  const refSet = new Set();
  const keyAlertedAt = new Map();
  const keyState = new Map();

  rows.forEach((row) => {
    const key = String(row?.telecastAlertedKey || '').trim() || buildNotificationKey(row);
    const ref = normalizeRefNo(String(row?.telecastAlertedRefNo || '').trim() || getTenderRefNo(row));
    const telecastAlerted = Boolean(row?.telecastAlerted);
    const alertedAt = row?.telecastAlertedAt || null;
    const telecastAlertSource = String(row?.telecastAlertSource || '').trim();

    if (key) {
      keyState.set(key, {
        telecastAlerted,
        alertedAt,
        telecastAlertSource,
      });
      if (telecastAlerted) alertedKeySet.add(key);
      if (alertedAt) keyAlertedAt.set(key, alertedAt);
    }
    if (ref && telecastAlerted) refSet.add(ref);
  });

  return { keyState, alertedKeySet, refSet, keyAlertedAt, count: rows.length };
};

const sendTelecastForRows = async ({ systemConfig, rowsToSend = [] }) => {
  if (!rowsToSend.length) {
    return {
      sent: 0,
      skipped: 'no_rows_to_send',
      staleCount: 0,
      eligibleCount: 0,
      skippedNoRecipients: 0,
      dispatchedKeys: [],
      dispatchedRefNos: [],
    };
  }
  const telecastSender = telecastRopcUsername();
  if (!telecastSender) {
    return {
      sent: 0,
      skipped: 'telecast_sender_not_configured',
      staleCount: 0,
      eligibleCount: 0,
      skippedNoRecipients: 0,
      dispatchedKeys: [],
      dispatchedRefNos: [],
    };
  }

  const groupRecipients = {
    GES: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GES || []),
    GDS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GDS || []),
    GTS: normalizeEmailList(systemConfig?.telecastGroupRecipients?.GTS || []),
  };

  const { accessToken } = await getTelecastSendMailAccessToken();
  const subjectTemplate = systemConfig.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
  const bodyTemplate = systemConfig.telecastTemplateBody || 'New row detected for {{TENDER_NO}}';
  const templateStyle = getTelecastTemplateStyle(systemConfig.telecastTemplateStyle);
  const delayMinutes = Math.max(0, Number(systemConfig.telecastSendDelayMinutes) || 0);
  const delayMs = delayMinutes * 60 * 1000;
  const staleCount = 0;
  let sent = 0;
  let skippedNoRecipients = 0;
  const dispatchedKeys = [];
  const dispatchedRefNos = [];

  for (let index = 0; index < rowsToSend.length; index += 1) {
    const row = rowsToSend[index];
    const group = getGroupFromOpportunity(row);
    const recipients = groupRecipients[group] || [];
    if (!recipients.length) {
      skippedNoRecipients += 1;
      continue;
    }

    const values = getTemplateValues(row);
    const subject = renderTemplate(subjectTemplate, values);
    const content = renderTemplate(bodyTemplate, values);
    const htmlContent = buildTelecastEmailHtml({ values, renderedBody: content, styleKey: templateStyle.key });

    telecastDebug('Sending telecast mail.', {
      idx: index,
      group,
      recipients: recipients.length,
      subject: String(subject || '').slice(0, 140),
      sender: telecastSender,
    });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlContent },
          toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (graphResponse.ok) {
      sent += 1;
      const key = buildNotificationKey(row);
      if (key) dispatchedKeys.push(key);
      const refNo = getTenderRefNo(row);
      if (refNo) dispatchedRefNos.push(refNo);
      telecastDebug('Telecast mail sent OK.', { idx: index, group, status: graphResponse.status });
    } else {
      const payload = await graphResponse.json().catch(() => ({}));
      telecastDebug('Telecast mail failed.', { idx: index, group, status: graphResponse.status, message: payload?.error?.message });
    }

    if (delayMs > 0 && index < rowsToSend.length - 1) {
      await sleep(delayMs);
    }
  }

  return {
    sent,
    skipped: null,
    staleCount,
    eligibleCount: rowsToSend.length,
    skippedNoRecipients,
    dispatchedKeys: [...new Set(dispatchedKeys)],
    dispatchedRefNos: [...new Set(dispatchedRefNos)],
  };
};

const runSyncFromConfiguredGraph = async ({ source = 'manual_sync' } = {}) => {
  const config = await getGraphConfig();
  if (!config.driveId || !config.fileId || !config.worksheetName) {
    throw new Error('Graph config is incomplete. Please configure Share Link / Drive / File / Worksheet in admin panel.');
  }

  let tenders;
  let statusWarnings = [];
  try {
    const syncPayload = await syncTendersFromGraph(config);
    if (Array.isArray(syncPayload)) {
      tenders = syncPayload;
    } else {
      tenders = Array.isArray(syncPayload?.tenders) ? syncPayload.tenders : [];
      statusWarnings = Array.isArray(syncPayload?.statusWarnings) ? syncPayload.statusWarnings : [];
    }
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      driveId: config.driveId || '',
      fileId: config.fileId || '',
      worksheetName: config.worksheetName || '',
      dataRange: config.dataRange || '',
      syncIntervalMinutes: config.syncIntervalMinutes || 10,
    };
    throw error;
  }
  const opportunities = await transformTendersToOpportunities(tenders);

  const systemConfig = await getSystemConfig();
  const existingTelecastState = await getExistingTelecastStateFromSyncedOpportunities();
  const previousKeys = new Set(systemConfig.notificationRowSignatures || []);
  const eligibleSignatures = opportunities
    .filter(hasRequiredRowValues)
    .map(buildNotificationKey)
    .filter(Boolean);

  const uniqueCurrentSignatures = [...new Set(eligibleSignatures)];
  const newRowSignatures = uniqueCurrentSignatures.filter((signature) => !previousKeys.has(signature));
  const signatureToOpportunity = new Map(
    opportunities
      .filter(hasRequiredRowValues) // stable key prevents "old row edited" from being treated as new
      .map((item) => [buildNotificationKey(item), item])
      .filter(([sig]) => Boolean(sig))
  );
  const newRows = newRowSignatures.map((sig) => signatureToOpportunity.get(sig)).filter(Boolean);
  const newRowsPreview = newRows.slice(0, 50).map((row) => ({
    signature: buildRowSignature(row),
    tenderNo: row?.opportunityRefNo || '',
    tenderName: row?.tenderName || '',
    client: row?.clientName || '',
    group: getGroupFromOpportunity(row),
    type: row?.opportunityClassification || '',
    dateTenderReceived: row?.dateTenderReceived || '',
    value: row?.opportunityValue ?? null,
  }));
  const now = new Date();
  const alertedKeySet = new Set([
    ...(systemConfig.telecastAlertedKeys || []),
    ...Array.from(existingTelecastState.alertedKeySet),
  ]);
  const alertedRefSet = new Set([
    ...(systemConfig.telecastAlertedRefNos || []).map((ref) => normalizeRefNo(ref)).filter(Boolean),
    ...Array.from(existingTelecastState.refSet),
  ]);
  let seededAlertBaseline = false;

  if (!systemConfig.telecastAlertSeededAt) {
    uniqueCurrentSignatures.forEach((key) => alertedKeySet.add(key));
    opportunities.forEach((opportunity) => {
      const ref = getTenderRefNo(opportunity);
      if (ref) alertedRefSet.add(ref);
    });
    systemConfig.telecastAlertSeededAt = now;
    systemConfig.telecastAlertSeededCount = uniqueCurrentSignatures.length;
    seededAlertBaseline = true;
  }

  systemConfig.notificationRowSignatures = uniqueCurrentSignatures;
  systemConfig.notificationLastCheckedAt = now;
  systemConfig.notificationLastNewRowsCount = newRowSignatures.length;
  systemConfig.notificationLastNewRows = newRowSignatures.slice(0, 50);
  systemConfig.notificationLastNewRowsPreview = newRowsPreview;
  systemConfig.telecastKeywordHelp = TELECAST_TEMPLATE_KEYWORDS;
  systemConfig.updatedBy = source;

  const telecastCandidates = newRows;
  const recentRows = telecastCandidates.filter((row) => isTenderRecentForTelecast(row, now));
  const staleCount = telecastCandidates.length - recentRows.length;
  const telecastEligiblePreview = recentRows.slice(0, 50).map((row) => ({
    signature: buildRowSignature(row),
    tenderNo: row?.opportunityRefNo || '',
    tenderName: row?.tenderName || '',
    client: row?.clientName || '',
    group: getGroupFromOpportunity(row),
    type: row?.opportunityClassification || '',
    dateTenderReceived: row?.dateTenderReceived || '',
    value: row?.opportunityValue ?? null,
  }));
  systemConfig.telecastLastEligibleRowsPreview = telecastEligiblePreview;
  const rowsToSend = recentRows.filter((row) => {
    const key = buildNotificationKey(row);
    if (!key) return false;
    const previousState = existingTelecastState.keyState.get(key);
    return !previousState?.telecastAlerted;
  });
  const alreadyAlertedCount = recentRows.length - rowsToSend.length;

  let telecastDispatch = {
    sent: 0,
    skipped: seededAlertBaseline ? 'baseline_seeded_existing_rows' : 'not_attempted',
    staleCount,
    alreadyAlertedCount,
    eligibleCount: 0,
    skippedNoRecipients: 0,
    dispatchedKeys: [],
    dispatchedRefNos: [],
  };
  try {
    if (!seededAlertBaseline) {
      telecastDispatch = await sendTelecastForRows({ systemConfig, rowsToSend });
      telecastDispatch.staleCount = staleCount;
      telecastDispatch.alreadyAlertedCount = alreadyAlertedCount;
      telecastDispatch.dispatchedKeys.forEach((key) => alertedKeySet.add(key));
      telecastDispatch.dispatchedRefNos.forEach((ref) => alertedRefSet.add(ref));
    }
  } catch (telecastError) {
    console.error('[telecast.dispatch.error]', telecastError?.message || telecastError);
    telecastDispatch = { ...telecastDispatch, sent: 0, skipped: 'error' };
  }

  const existingOpportunityMeta = await SyncedOpportunity.find(
    {},
    {
      opportunityRefNo: 1,
      leadEmail: 1,
      leadEmailSource: 1,
      leadEmailAssignedAt: 1,
      leadEmailAssignedBy: 1,
      deadlineAlerted: 1,
      deadlineAlertedAt: 1,
      deadlineAlertedDateKey: 1,
    }
  ).lean();
  const metaByRef = new Map(
    existingOpportunityMeta
      .map((row) => [normalizeRefNo(row?.opportunityRefNo || ''), row])
      .filter(([ref]) => Boolean(ref))
  );

  const opportunitiesForInsert = opportunities.map((opportunity) => {
    const key = buildNotificationKey(opportunity);
    const ref = getTenderRefNo(opportunity);
    const metaSnapshot = ref ? metaByRef.get(normalizeRefNo(ref)) : null;
    const previousState = key ? existingTelecastState.keyState.get(key) : null;
    const isDispatchedNow = Boolean(key && telecastDispatch.dispatchedKeys.includes(key));
    const isAlerted = seededAlertBaseline || isDispatchedNow || Boolean(previousState?.telecastAlerted) || Boolean(key && alertedKeySet.has(key));
    const historicalAlertedAt = key ? existingTelecastState.keyAlertedAt.get(key) : null;
    const telecastAlertedAt = isAlerted ? (historicalAlertedAt || now) : null;
    let telecastAlertSource = '';

    if (isAlerted) {
      if (isDispatchedNow) telecastAlertSource = 'telecast_dispatch';
      else if (seededAlertBaseline) telecastAlertSource = 'baseline_seed';
      else telecastAlertSource = previousState?.telecastAlertSource || 'history_preserved';
    }

    return {
      ...opportunity,
      leadEmail: metaSnapshot?.leadEmail || opportunity?.leadEmail || '',
      leadEmailSource: metaSnapshot?.leadEmailSource || opportunity?.leadEmailSource || '',
      leadEmailAssignedAt: metaSnapshot?.leadEmailAssignedAt || opportunity?.leadEmailAssignedAt || null,
      leadEmailAssignedBy: metaSnapshot?.leadEmailAssignedBy || opportunity?.leadEmailAssignedBy || '',
      deadlineAlerted: metaSnapshot?.deadlineAlerted || opportunity?.deadlineAlerted || false,
      deadlineAlertedAt: metaSnapshot?.deadlineAlertedAt || opportunity?.deadlineAlertedAt || null,
      deadlineAlertedDateKey: metaSnapshot?.deadlineAlertedDateKey || opportunity?.deadlineAlertedDateKey || '',
      telecastAlerted: isAlerted,
      telecastAlertedAt,
      telecastAlertedKey: key || '',
      telecastAlertedRefNo: ref || '',
      telecastAlertSource,
    };
  });

  await SyncedOpportunity.deleteMany({});
  const inserted = await SyncedOpportunity.insertMany(opportunitiesForInsert);
  const clientSyncResult = await syncClientsFromOpportunities(opportunities);

  config.lastSyncAt = now;
  await config.save();

  const nextSystemConfig = {
    ...((typeof systemConfig.toObject === 'function' ? systemConfig.toObject() : systemConfig) || {}),
    telecastAlertedKeys: Array.from(alertedKeySet).slice(-MAX_ALERTED_TRACKED_KEYS),
    telecastAlertedRefNos: Array.from(alertedRefSet).slice(-MAX_ALERTED_TRACKED_REFS),
  };
  pushWeeklyTelecastStats(nextSystemConfig, newRows);
  await persistSystemConfigFields(systemConfig, {
    telecastAlertedKeys: nextSystemConfig.telecastAlertedKeys,
    telecastAlertedRefNos: nextSystemConfig.telecastAlertedRefNos,
    telecastWeeklyStats: nextSystemConfig.telecastWeeklyStats,
  }, source, 'telecast_sync_refresh');
  publishOpportunityEvent({
    type: 'full-reload',
    source,
    snapshotAt: now.toISOString(),
    insertedCount: inserted.length,
  });

  console.log(JSON.stringify({
    source,
    checkedAt: now.toISOString(),
    eligibleRows: uniqueCurrentSignatures.length,
    newRows: newRowSignatures.length,
    seededAlertBaseline,
    alertedKeyCount: systemConfig.telecastAlertedKeys.length,
    alertedRefCount: systemConfig.telecastAlertedRefNos.length,
    telecastEligibleRows: telecastDispatch.eligibleCount,
    telecastStaleRows: telecastDispatch.staleCount,
    telecastAlreadyAlertedRows: telecastDispatch.alreadyAlertedCount,
    telecastNoRecipientsRows: telecastDispatch.skippedNoRecipients,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    clientsSeeded: clientSyncResult?.created || 0,
    clientsUpdated: clientSyncResult?.updated || 0,
  }));

  return {
    insertedCount: inserted.length,
    newRowsCount: newRowSignatures.length,
    newRowSignatures: newRowSignatures.slice(0, 50),
    eligibleRows: uniqueCurrentSignatures.length,
    seededAlertBaseline,
    alertedKeysTracked: systemConfig.telecastAlertedKeys.length,
    alertedRefNosTracked: systemConfig.telecastAlertedRefNos.length,
    telecastEligibleRows: telecastDispatch.eligibleCount,
    telecastStaleRows: telecastDispatch.staleCount,
    telecastAlreadyAlertedRows: telecastDispatch.alreadyAlertedCount,
    telecastNoRecipientsRows: telecastDispatch.skippedNoRecipients,
    telecastSent: telecastDispatch.sent,
    telecastSkipped: telecastDispatch.skipped,
    clientsSeeded: clientSyncResult?.created || 0,
    clientsUpdated: clientSyncResult?.updated || 0,
    newRowsPreview,
    statusWarnings,
  };
};

let syncInFlightPromise = null;

const syncFromConfiguredGraph = async ({ source = 'manual_sync' } = {}) => {
  if (syncInFlightPromise) {
    return syncInFlightPromise;
  }

  syncInFlightPromise = runSyncFromConfiguredGraph({ source })
    .finally(() => {
      syncInFlightPromise = null;
    });

  return syncInFlightPromise;
};

const scheduleGraphAutoSync = async () => {};

let dailyNotificationTimer = null;
let notificationCheckRunning = false;

const scheduleDailyNotificationCheck = () => {
  if (dailyNotificationTimer) {
    clearInterval(dailyNotificationTimer);
    dailyNotificationTimer = null;
  }

  dailyNotificationTimer = setInterval(async () => {
    if (notificationCheckRunning) return;
    notificationCheckRunning = true;

    try {
      await drainMailQueue().catch(e => console.error('[mailQueue.drain.error]', e?.message));
      const deadlineResult = await sendDeadlineAlerts();
      await sendAwardAlerts().catch(e => console.error('[award-alerts.error]', e?.message));
      await sendLeadNotifications().catch(e => console.error('[lead-notif.error]', e?.message));
      const runKey = new Date().toISOString();
      console.log(JSON.stringify({
        runKey,
        deadlineSent: deadlineResult?.sent || 0,
        deadlineSkipped: deadlineResult?.skipped || 0,
        mailQueued: _mailQueue.length,
      }));
    } catch (error) {
      const runKey = new Date().toISOString();
      console.error('[notification.daily-check.failure]', JSON.stringify({
        runKey,
        message: error?.message || String(error),
      }));
    } finally {
      notificationCheckRunning = false;
    }
  }, 60 * 1000);

};

const getUsernameFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const looksLikeJwt = token.split('.').length === 3;
    if (!looksLikeJwt) {
      if (!IS_PROD && ALLOW_LEGACY_USERNAME_AUTH) return token.toLowerCase();
      return null;
    }
    try {
      const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
      const email = decoded && typeof decoded === 'object' ? decoded.email : null;
      if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase();
      return null;
    } catch (_error) {
      return null;
    }
  }

  const headerUsername = req.headers['x-username'];
  if (typeof headerUsername === 'string') {
    if (!IS_PROD && ALLOW_LEGACY_USERNAME_AUTH) return headerUsername.trim().toLowerCase();
    return null;
  }

  return null;
};

const BOOTSTRAP_MASTER_EMAILS = new Set(
  [
    ...String(process.env.MASTER_USERS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    'arjun.s@avenirengineering.com',
  ],
);

function isBootstrapMaster(email) {
  return BOOTSTRAP_MASTER_EMAILS.has(String(email || '').trim().toLowerCase());
}

const verifyToken = async (req, res, next) => {
  try {
    const username = getUsernameFromRequest(req);
    if (!username) {
      return res.status(401).json({ error: 'Missing username authorization' });
    }

    // TempAccess users have TEMP-xxx email in the JWT
    if (/^temp-\d+$/i.test(username)) {
      const accessId = username.toUpperCase();
      const tempRecord = await TempAccess.findOne({ accessId }).lean();
      if (!tempRecord || !tempRecord.isActive) {
        return res.status(403).json({ error: 'Temporary access not valid' });
      }
      if (tempRecord.validUntil && new Date(tempRecord.validUntil).getTime() <= Date.now()) {
        return res.status(403).json({ error: 'Temporary access has expired' });
      }
      // Decode allowedPages from JWT (more reliable than DB since JWT is already validated)
      const authHeader = req.headers.authorization;
      let allowedPages = tempRecord.allowedPages || [];
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.substring(7), EFFECTIVE_JWT_SECRET);
          if (Array.isArray(decoded?.allowedPages)) allowedPages = decoded.allowedPages;
        } catch { /* use DB value */ }
      }
      req.user = {
        email: accessId,
        displayName: tempRecord.displayName || accessId,
        role: 'TempUser',
        status: 'approved',
        assignedGroup: null,
        userId: tempRecord._id,
        isTempAccess: true,
        allowedPages,
      };
      return next();
    }

    let user = getCachedUser(username);
    if (!user) {
      user = await AuthorizedUser.findOne({ email: username });
      if (user) setCachedUser(username, user);
    }
    if (!user) {
      return res.status(403).json({ error: 'User not authorized' });
    }

    if (user.status === 'rejected') {
      invalidateUserCache(username);
      return res.status(403).json({ error: 'User access has been rejected' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'User access pending approval' });
    }

    req.user = {
      email: user.email,
      displayName: user.displayName || user.email,
      role: user.role,
      status: user.status,
      assignedGroup: user.assignedGroup || null,
      userId: user._id,
    };

    next();
  } catch (error) {
    console.error('Username verification error:', error.message);
    res.status(401).json({ error: 'Username verification failed' });
  }
};

app.post('/api/auth/verify-token', authRateLimiter, async (req, res) => {
  const requestMeta = {
    endpoint: '/api/auth/verify-token',
    method: req.method,
    ip: req.ip,
    requestId: req.headers['x-request-id'] || null,
    timestamp: new Date().toISOString(),
  };

  try {
    const rawUsername = req.body?.username || req.body?.token;
    const username = rawUsername?.toString().trim().toLowerCase();
    if (!username) {
      console.warn('[auth.verify-token.invalid-request]', JSON.stringify({
        ...requestMeta,
        reason: 'missing_username',
      }));
      return res.status(400).json({ error: 'Username is required' });
    }

    let user = await AuthorizedUser.findOne({ email: username });

    if (!user) {
      console.warn('[auth.verify-token.user-not-found]', JSON.stringify({
        ...requestMeta,
        username,
      }));
      return res.status(403).json({ error: 'User not authorized' });
    }

    if (user.status === 'rejected') {
      console.warn('[auth.verify-token.user-rejected]', JSON.stringify({
        ...requestMeta,
        username,
      }));
      return res.status(403).json({ error: 'User access rejected', status: 'rejected' });
    }

    if (isBootstrapMaster(username) && (user.role !== 'Master' || user.status !== 'approved')) {
      user.role = 'Master';
      user.status = 'approved';
      await AuthorizedUser.updateOne(
        { _id: user._id },
        { $set: { role: 'Master', status: 'approved' } },
      );
    }

    // /verify-token is intentionally NOT a passwordless login endpoint.
    return res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
      },
      sessionToken: null,
      message: user.status === 'pending' ? 'User pending approval. Master will review your request.' : 'User recognized',
    });
  } catch (error) {
    console.error('[auth.verify-token.failure]', JSON.stringify({
      ...requestMeta,
      username: req.body?.username || req.body?.token || null,
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || null,
    }));
    res.status(500).json({ error: error.message });
  }
});

// ── Full System Audit (Master only) ──────────────────────────────────────────
app.get('/api/audit/run', verifyToken, async (req, res) => {
  try {
    if (req.user?.role !== 'Master' && req.user?.role !== 'MASTER') {
      return res.status(403).json({ error: 'Only Master users can run the system audit' });
    }

    const auditStart = Date.now();
    const dbReady = mongoose.connection.readyState === 1;
    const system = getSystemHealthSnapshot();

    let dbPingMs = null;
    let dbPingError = null;
    if (dbReady) {
      try {
        const t0 = Date.now();
        await mongoose.connection.db.command({ ping: 1 });
        dbPingMs = Date.now() - t0;
      } catch (e) {
        dbPingError = e?.message || 'ping failed';
      }
    }

    const collectionModels = [
      ['SyncedOpportunity', SyncedOpportunity],
      ['Client', Client],
      ['Vendor', Vendor],
      ['BidDecision', BidDecision],
      ['PotentialOpportunity', PotentialOpportunity],
      ['AuthorizedUser', AuthorizedUser],
      ['Approval', Approval],
      ['LoginLog', LoginLog],
      ['AuthDiagnosticLog', AuthDiagnosticLog],
      ['GraphSyncConfig', GraphSyncConfig],
    ];

    const collections = {};
    if (dbReady) {
      await Promise.all(
        collectionModels.map(async ([name, Model]) => {
          try {
            const count = await Model.estimatedDocumentCount();
            collections[name] = { count, ok: true };
          } catch (e) {
            collections[name] = { count: null, ok: false, error: e?.message };
          }
        })
      );
    } else {
      for (const [name] of collectionModels) {
        collections[name] = { count: null, ok: false, error: 'DB not connected' };
      }
    }

    let configSnapshot = null;
    if (dbReady) {
      try {
        const config = await getSystemConfig();
        configSnapshot = {
          hasPageRoleAccess: Boolean(config?.pageRoleAccess && Object.keys(config.pageRoleAccess).length > 0),
          hasActionPermissions: Boolean(config?.actionRoleAccess && Object.keys(config.actionRoleAccess).length > 0),
          hasPageViewAccess: Boolean(config?.pageViewAccess && Object.keys(config.pageViewAccess).length > 0),
          telecastEnabled: Boolean(config?.telecastEnabled),
          notificationsConfigured: Boolean(config?.notificationLastCheckedAt),
          postBidEmailCount: Array.isArray(config?.postBidAllowedEmails) ? config.postBidAllowedEmails.length : 0,
          cacheHit: Boolean(systemConfigCache.value),
          cacheAgeMs: systemConfigCache.ts ? Date.now() - systemConfigCache.ts : null,
        };
      } catch (e) {
        configSnapshot = { error: e?.message };
      }
    }

    const authCacheStats = { size: USER_AUTH_CACHE.size, ttlMs: USER_AUTH_CACHE_TTL_MS };
    const auditMs = Date.now() - auditStart;

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      auditMs,
      build: {
        gitSha: BUILD_INFO.gitSha,
        buildTime: BUILD_INFO.buildTime,
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
      },
      db: {
        readyState: mongoose.connection.readyState,
        readyStateLabel: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
        pingMs: dbPingMs,
        pingError: dbPingError,
        host: mongoose.connection.host || null,
        name: mongoose.connection.name || null,
      },
      system: { uptimeSec: Math.round(process.uptime()), ...system },
      collections,
      config: configSnapshot,
      authCache: authCacheStats,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        IS_PROD: Boolean(IS_PROD),
        MONGODB_URI_SET: Boolean(process.env.MONGODB_URI),
        JWT_SECRET_SET: Boolean(process.env.JWT_SECRET || process.env.SESSION_JWT_SECRET),
        AZURE_TENANT_ID_SET: Boolean(process.env.AZURE_TENANT_ID || process.env.TENANT_ID),
        AZURE_CLIENT_ID_SET: Boolean(process.env.AZURE_CLIENT_ID || process.env.CLIENT_ID),
        ROPC_USERNAME_SET: Boolean(process.env.ROPC_USERNAME),
      },
    });
  } catch (error) {
    return handleApiError(res, error, 'audit.run');
  }
});

app.get('/api/clients/duplicates', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!req.user || !['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const clients = await Client.find().lean();

    const normalize = (name) => {
      return String(name || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .replace(/\b(llc|ltd|pjsc|corp|inc|plc)\b/g, '')
        .trim();
    };

    const clusters = [];
    const processed = new Set();

    for (let i = 0; i < clients.length; i++) {
      const c1 = clients[i];
      if (processed.has(c1._id.toString())) continue;

      const cluster = [c1];
      const n1 = normalize(c1.companyName);
      if (!n1) continue;

      for (let j = i + 1; j < clients.length; j++) {
        const c2 = clients[j];
        if (processed.has(c2._id.toString())) continue;

        const n2 = normalize(c2.companyName);
        if (!n2) continue;

        // Simple similarity: exact match after normalization OR token overlap
        const tokens1 = new Set(n1.split(' '));
        const tokens2 = new Set(n2.split(' '));
        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));

        let isMatch = n1 === n2;
        if (!isMatch && n1.length > 3 && n2.length > 3) {
          const overlapRatio = intersection.size / Math.max(tokens1.size, tokens2.size);
          if (overlapRatio > 0.7) isMatch = true;
        }

        if (isMatch) {
          cluster.push(c2);
        }
      }

      if (cluster.length > 1) {
        cluster.forEach(c => processed.add(c._id.toString()));
        clusters.push({
          id: randomUUID(),
          members: cluster.map(mapIdField),
          suggestedName: cluster[0].companyName,
        });
      }
    }

    res.json({ success: true, clusters });
  } catch (error) {
    return handleApiError(res, error, 'clients.duplicates.get');
  }
});

app.post('/api/clients/merge', verifyToken, async (req, res) => {
  try {
    if (!req.user || !['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { targetId, memberIds, companyName } = req.body;
    if (!targetId || !memberIds || !memberIds.length) {
      return res.status(400).json({ error: 'targetId and memberIds are required' });
    }

    const members = await Client.find({ _id: { $in: memberIds } });
    const target = await Client.findById(targetId);
    if (!target) return res.status(404).json({ error: 'Target client not found' });

    let mergedContacts = [...target.contacts];
    let mergedGroup = target.group;

    for (const member of members) {
      if (member._id.toString() === targetId) continue;
      mergedContacts = mergeContacts(mergedContacts, member.contacts);
      if (!mergedGroup && member.group) mergedGroup = member.group;
    }

    // Update target
    target.companyName = companyName || target.companyName;
    target.companyKey = normalizeCompanyKey(target.companyName);
    target.contacts = mergedContacts;
    target.group = mergedGroup;
    await target.save();

    // Update references in SyncedOpportunity
    const memberNames = members.map(m => m.companyName);
    await SyncedOpportunity.updateMany(
      { clientName: { $in: memberNames } },
      { $set: { clientName: target.companyName } }
    );

    // Delete merged members
    const toDelete = memberIds.filter(id => id !== targetId);
    if (toDelete.length) {
      await Client.deleteMany({ _id: { $in: toDelete } });
    }

    res.json({ success: true, message: `Merged ${members.length} clients into ${target.companyName}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/refresh', authRateLimiter, verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (DISABLE_MONGODB) return res.status(403).json({ error: 'Session refresh not available in offline mode' });
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(403).json({ error: 'User not authorized' });
    if (user.status !== 'approved') return res.status(403).json({ error: 'User not approved' });
    return res.json({ success: true, sessionToken: createSessionToken(user) });
  } catch (_error) {
    return res.status(500).json({ error: 'Authentication service error' });
  }
});

app.post('/api/auth/login', authRateLimiter, verifyToken, async (req, res) => {
  try {
    const loginLog = new LoginLog({
      email: req.user.email,
      role: req.user.role,
      ipAddress: req.ip,
    });

    try {
      await loginLog.save();
    } catch (logError) {
      console.error('[auth.login.loginlog-failed]', logError?.message || String(logError));
    }

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (user) {
      user.lastLogin = new Date();
      await AuthorizedUser.updateOne(
        { _id: user._id },
        { $set: { lastLogin: user.lastLogin } },
      );
    }

    res.json({ success: true, message: 'Login recorded' });
  } catch (error) {
    console.error('Login record error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/user', verifyToken, async (req, res) => {
  const resp = {
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role,
    status: req.user.status,
    assignedGroup: req.user.assignedGroup,
  };
  if (req.user.isTempAccess) {
    resp.isTempAccess = true;
    resp.allowedPages = Array.isArray(req.user.allowedPages) ? req.user.allowedPages : [];
  }
  res.json(resp);
});

// Simple role-based login (development mode)
app.post('/api/auth/simple-role-login', authRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    if (IS_PROD) {
      return res.status(404).json({ error: 'Not found' });
    }

    const role = String(req.body?.role || '').trim();
    const VALID_ROLES = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];
    
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    const email = rawEmail || `${role.toLowerCase()}@dev.local`;
    
    // Security: Validate email format if provided
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (DISABLE_MONGODB) {
      const localUser = upsertLocalAuthorizedUser(email, {
        displayName: `${role} (Dev)`,
        role,
        status: 'approved',
      });
      return res.json({
        success: true,
        user: {
          email: localUser.email,
          displayName: localUser.displayName || localUser.email,
          role: localUser.role,
          status: localUser.status,
          assignedGroup: localUser.assignedGroup,
        },
        sessionToken: createSessionToken(localUser),
      });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        $setOnInsert: { email, createdAt: new Date() },
        $set: {
          displayName: `${role} (Dev)`,
          role,
          status: 'approved',
          approvedBy: 'role-login',
          approvedAt: new Date(),
          lastLogin: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Log successful login (ISO/IEC 27001 - A.12.4.1)
    const loginLog = new LoginLog({
      email: user.email,
      role: user.role,
      ipAddress: req.ip,
      success: true,
      authMethod: 'role-login',
    });
    try {
      await loginLog.save();
    } catch (logError) {
      console.error('[auth.role-password-login.loginlog-failed]', logError?.message || String(logError));
    }


    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
      },
      sessionToken: createSessionToken(user),
    });
  } catch (error) {
    console.error('[auth.role-login.error]', error.message);
    res.status(500).json({ error: 'Authentication service error' });
  }
});

// Simple role + password login (temporary; enabled in both dev and prod by request)
// userId is treated as a role identifier (e.g., Master, Basic). Password must equal "123".
app.post('/api/auth/role-password-login', authRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (IS_PROD || String(process.env.ENABLE_ROLE_PASSWORD_LOGIN || '').toLowerCase() !== 'true') {
      return res.status(404).json({ error: 'Not found' });
    }

    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '');
    if (!userId || !password) {
      return res.status(400).json({ error: 'userId and password are required' });
    }

    const roleLoginPassword = String(process.env.ROLE_PASSWORD_LOGIN_PASSWORD || '123');
    if (password !== roleLoginPassword) {
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    const roleKey = userId.replace(/\s+/g, '');
    const ROLE_MAP = {
      master: 'Master',
      admin: 'Admin',
      proposalhead: 'ProposalHead',
      svp: 'SVP',
      bdteam: 'BDTeam',
      basic: 'Basic',
      tempuser: 'TempUser',
    };
    const role = ROLE_MAP[String(roleKey).toLowerCase()];
    if (!role) {
      return res.status(400).json({ error: 'Invalid role userId' });
    }

    const email = `${role.toLowerCase()}@role.local`;
    const displayName = `${role} (RoleLogin)`;

    if (DISABLE_MONGODB) {
      const localUser = upsertLocalAuthorizedUser(email, {
        displayName,
        role,
        status: 'approved',
      });
      return res.json({
        success: true,
        user: {
          email: localUser.email,
          displayName: localUser.displayName || localUser.email,
          role: localUser.role,
          status: localUser.status,
          assignedGroup: localUser.assignedGroup,
        },
        sessionToken: createSessionToken(localUser),
      });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        $setOnInsert: { email, createdAt: new Date() },
        $set: {
          displayName,
          role,
          status: 'approved',
          approvedBy: 'role-password-login',
          approvedAt: new Date(),
          lastLogin: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const loginLog = new LoginLog({
      email: user.email,
      role: user.role,
      ipAddress: req.ip,
      success: true,
      authMethod: 'role-password',
    });
    try {
      await loginLog.save();
    } catch (logError) {
      console.error('[auth.role-login.loginlog-failed]', logError?.message || String(logError));
    }


    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
      },
      sessionToken: createSessionToken(user),
    });
  } catch (error) {
    console.error('[auth.role-password-login.error]', error.message);
    res.status(500).json({ error: 'Authentication service error' });
  }
});

// One-time production bootstrap for an initial Master password login.
// Guarded by `BOOTSTRAP_ADMIN_SECRET` to avoid exposing a permanent backdoor.
app.post('/api/auth/bootstrap-master', authRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (DISABLE_MONGODB) return res.status(403).json({ error: 'Bootstrap not available in offline mode' });
    if (!IS_PROD) return res.status(400).json({ error: 'Bootstrap is only intended for production environments' });

    if (!BOOTSTRAP_ADMIN_SECRET) {
      return res.status(503).json({ error: 'Bootstrap is not configured' });
    }

    const provided = String(req.headers['x-bootstrap-secret'] || '').trim();
    if (!provided || provided !== BOOTSTRAP_ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const existingMaster = await AuthorizedUser.findOne({ role: { $in: ['Master', 'MASTER'] }, status: 'approved' }).lean();
    if (existingMaster) {
      return res.status(409).json({ error: 'Master already exists' });
    }

    const email = 'master@dev.local';
    const passwordHash = await hashPassword('123');
    const user = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        $setOnInsert: { email, createdAt: new Date() },
        $set: {
          displayName: 'Master',
          role: 'Master',
          status: 'approved',
          approvedBy: 'bootstrap-master',
          approvedAt: new Date(),
          passwordHash,
          passwordChangedAt: null,
          requiresPasswordChange: true,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
          lastFailedLoginAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
        requiresPasswordChange: Boolean(user.requiresPasswordChange),
      },
    });
  } catch (error) {
    console.error('[auth.bootstrap-master.error]', error?.message || String(error));
    res.status(500).json({ error: 'Authentication service error' });
  }
});

// Password-based login (for TempUser and configured accounts)
app.post('/api/auth/login-password', authRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) {
      return respondDatabaseUnavailable(res);
    }

    const requestedLogin = String(req.body?.email || '').trim().toLowerCase();
    let email = requestedLogin;
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return sendAuthFailure(res, req, 400, 'Email and password are required', 'missing_credentials', { requestedLogin: requestedLogin || '' });
    }

    // TempAccess login — TEMP-001 style IDs bypass the regular AuthorizedUser flow
    if (/^temp-\d+$/i.test(requestedLogin)) {
      const accessId = requestedLogin.toUpperCase();
      const tempRecord = await TempAccess.findOne({ accessId }).lean();
      if (!tempRecord) {
        return sendAuthFailure(res, req, 403, 'Invalid credentials', 'user_not_found', { requestedLogin });
      }
      if (!tempRecord.isActive) {
        return sendAuthFailure(res, req, 403, 'Temporary access ID is inactive', 'temp_access_inactive', { accessId });
      }
      const now = Date.now();
      if (tempRecord.validUntil && new Date(tempRecord.validUntil).getTime() <= now) {
        return sendAuthFailure(res, req, 403, 'Temporary access has expired', 'temp_access_expired', { accessId, validUntil: tempRecord.validUntil });
      }
      if (tempRecord.validFrom && new Date(tempRecord.validFrom).getTime() > now) {
        return sendAuthFailure(res, req, 403, 'Temporary access is not yet valid', 'temp_access_not_yet_valid', { accessId, validFrom: tempRecord.validFrom });
      }
      const passwordMatches = await verifyPassword(password, tempRecord.passwordHash);
      if (!passwordMatches) {
        return sendAuthFailure(res, req, 403, 'Invalid credentials', 'invalid_password', { accessId });
      }
      await TempAccess.updateOne({ _id: tempRecord._id }, { $set: { lastLoginAt: new Date() } });
      const tempUser = { email: accessId, role: 'TempUser' };
      const token = createSessionToken(tempUser, {
        isTempAccess: true,
        allowedPages: tempRecord.allowedPages || [],
        validUntil: tempRecord.validUntil ? new Date(tempRecord.validUntil).getTime() : null,
      });
      return res.json({
        success: true,
        user: {
          email: accessId,
          displayName: tempRecord.displayName || accessId,
          role: 'TempUser',
          status: 'approved',
          assignedGroup: null,
          isTempAccess: true,
          allowedPages: tempRecord.allowedPages || [],
          validUntil: tempRecord.validUntil,
          requiresPasswordChange: false,
        },
        sessionToken: token,
      });
    }

    const adminBypassEnabled = Boolean(DEFAULT_ADMIN_PASSWORD) && DEFAULT_ADMIN_PASSWORD.length >= 12;
    const adminBypassLogin = adminBypassEnabled && isConfiguredAdminUsername(email) && password === DEFAULT_ADMIN_PASSWORD;

    if (email && !email.includes('@')) {
      if (!IS_PROD) {
        email = `${email}@dev.local`;
      } else if (ALLOW_PROD_USERNAME_ALIASES && email === 'master') {
        email = 'master@dev.local';
      }
    }

    // Security: Validate email format (ISO/IEC 27001 - A.14.1.1)
    if (!adminBypassLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendAuthFailure(res, req, 400, 'Invalid email format', 'invalid_email_format', { email, requestedLogin });
    }

    if (DISABLE_MONGODB) {
      return sendAuthFailure(res, req, 403, 'Password login not available in offline mode', 'offline_mode', { email });
    }

    let user = await findAuthorizedUserByEmail(email);
    if (!user && adminBypassLogin) {
      if (!email.includes('@')) email = `${email}@dev.local`;
      user = await AuthorizedUser.findOneAndUpdate(
        { email },
        {
          $setOnInsert: { email, createdAt: new Date() },
          $set: {
            displayName: email,
            role: 'Admin',
            status: 'approved',
            approvedBy: 'env-admin-users',
            approvedAt: new Date(),
            failedLoginAttempts: 0,
            accountLockedUntil: null,
            lastFailedLoginAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    if (!user) {
      console.warn(`[auth.login.invalid-user] email=${email}`);
      return sendAuthFailure(res, req, 403, 'Invalid credentials', 'user_not_found', { email, requestedLogin });
    }

    // Security: Check if account is locked (ISO/IEC 27001 - A.9.4.3)
    if (user.accountLockedUntil && new Date(user.accountLockedUntil).getTime() > Date.now()) {
      console.warn(`[auth.login.account-locked] email=${email} lockedUntil=${user.accountLockedUntil}`);
      return sendAuthFailure(res, req, 403, 'Account locked due to multiple failed attempts. Please try again later.', 'account_locked', {
        email,
        lockedUntil: user.accountLockedUntil,
        failedLoginAttempts: user.failedLoginAttempts || 0,
      });
    }

    // Reset lock if expired
    if (user.accountLockedUntil && new Date(user.accountLockedUntil).getTime() <= Date.now()) {
      await AuthorizedUser.updateOne(
        { _id: user._id },
        { $set: { accountLockedUntil: null, failedLoginAttempts: 0 } },
      );
      user.accountLockedUntil = null;
      user.failedLoginAttempts = 0;
    }

    const tempAccessEndsAt = user.tempAccessExpiresAt ? new Date(user.tempAccessExpiresAt).getTime() : 0;
    const hasValidTempAccess = String(user.role || '').trim() === 'TempUser' && tempAccessEndsAt > Date.now();

    if (!hasValidTempAccess) {
      if (user.status === 'rejected') return sendAuthFailure(res, req, 403, 'User access rejected', 'status_rejected', { email, status: user.status });
      if (user.status === 'pending') return sendAuthFailure(res, req, 403, 'User access pending approval', 'status_pending', { email, status: user.status });
      if (user.status !== 'approved') return sendAuthFailure(res, req, 403, 'Account not approved for login', 'status_not_approved', { email, status: user.status });
    }

    if (!user.passwordHash && !adminBypassLogin) {
      return sendAuthFailure(res, req, 403, 'Password login not configured', 'password_not_configured', { email, role: user.role, status: user.status });
    }

    // Only enforce temp-access expiry for TempUser role.
    // Non-TempUser accounts may have a stale tempAccessExpiresAt from a previous role
    // change — blocking them here would lock out users with a valid permanent password.
    const isTempUserRole = String(user.role || '').trim() === 'TempUser';
    if (isTempUserRole && user.tempAccessExpiresAt && new Date(user.tempAccessExpiresAt).getTime() <= Date.now()) {
      console.warn(`[auth.login.access-expired] email=${email}`);
      return sendAuthFailure(res, req, 403, 'Temporary access has expired', 'temp_access_expired', {
        email,
        tempAccessExpiresAt: user.tempAccessExpiresAt,
      });
    }

    // Verify password
    const passwordMatches = adminBypassLogin ? true : await verifyPassword(password, user.passwordHash);
    const isTempCredentialLogin = String(user.role || '').trim() === 'TempUser'
      && Boolean(user.tempAccessExpiresAt)
      && new Date(user.tempAccessExpiresAt).getTime() > Date.now();
    const tempCredentialMatches = !passwordMatches && isTempCredentialLogin && user.resetPasswordTokenHash
      ? await (async () => {
          const candidates = Array.from(new Set([
            String(password || ''),
            String(password || '').trim(),
            normalizeTempCredentialInput(password),
          ]));

          for (const candidate of candidates) {
            if (!candidate) continue;
            if (await verifyPassword(candidate, user.passwordHash)) return true;
          }

          return false;
        })()
      : false;

    if (!passwordMatches && !tempCredentialMatches) {
      // Security: Track failed login attempt (ISO/IEC 27001 - A.12.4.1)
      const maxAttempts = 5;
      const lockoutDurationMs = 15 * 60 * 1000; // 15 minutes

      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      user.lastFailedLoginAt = new Date();

      if (user.failedLoginAttempts >= maxAttempts) {
        user.accountLockedUntil = new Date(Date.now() + lockoutDurationMs);
        console.warn(`[auth.login.account-locked-after-attempts] email=${email} attempts=${user.failedLoginAttempts}`);
      } else {
        console.warn(`[auth.login.failed-attempt] email=${email} attempts=${user.failedLoginAttempts}`);
      }

      await AuthorizedUser.updateOne(
        { _id: user._id },
        {
          $set: {
            failedLoginAttempts: user.failedLoginAttempts,
            lastFailedLoginAt: user.lastFailedLoginAt,
            accountLockedUntil: user.accountLockedUntil,
          },
        },
      );
      return sendAuthFailure(res, req, 403, 'Invalid credentials', 'password_mismatch', {
        email,
        failedLoginAttempts: user.failedLoginAttempts,
        tempAccessExpiresAt: user.tempAccessExpiresAt || null,
      });
    }

    // Success: Reset failed attempts counter
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = null;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    await AuthorizedUser.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          accountLockedUntil: null,
          lastLogin: user.lastLogin,
        },
      },
    );

    // Log successful login (ISO/IEC 27001 - A.12.4.1)
    const loginLog = new LoginLog({
      email: user.email,
      role: user.role,
      ipAddress: req.ip,
      success: true,
      authMethod: 'password',
    });
    try {
      await loginLog.save();
    } catch (logError) {
      console.error('[auth.password-login.loginlog-failed]', logError?.message || String(logError));
    }


    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName || user.email,
        role: user.role,
        status: user.status,
        assignedGroup: user.assignedGroup,
        requiresPasswordChange: Boolean(user.requiresPasswordChange),
      },
      sessionToken: createSessionToken(user),
    });
  } catch (error) {
    console.error('[auth.password-login.error]', error.message);
    res.status(500).json({ error: 'Authentication service error' });
  }
});

const buildPasswordResetEmailHtml = ({ code, displayName = '', styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const safeName = escapeHtml(displayName || '');
  const safeCode = escapeHtml(code || '');

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Telecast</div>
          <h1 style="margin:0;font-size:22px;line-height:1.2;">Password Reset Code</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">Use the code below to reset your Opportunity Dashboard password. This code expires in 15 minutes.</p>
        </div>
        <div style="padding:24px 28px;">
          ${safeName ? `<p style="margin:0 0 14px;font-size:14px;color:#334155;">Hello ${safeName},</p>` : ''}
          <div style="margin:16px 0;padding:18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};text-align:center;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${colors.summaryText};opacity:0.9;margin-bottom:10px;">Reset Code</div>
            <div style="font-size:28px;letter-spacing:0.22em;font-weight:700;color:#0f172a;">${safeCode}</div>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">
            If you did not request this, you can ignore this email. For security, do not share this code with anyone.
          </p>
        </div>
      </div>
    </div>
  `;
};

const buildTempCredentialEmailHtml = ({ code, displayName = '', expiresAt, styleKey = 'avenir_blue' }) => {
  const style = getTelecastTemplateStyle(styleKey);
  const colors = style.colors;
  const safeName = escapeHtml(displayName || '');
  const safeCode = escapeHtml(code || '');
  const safeExpiry = escapeHtml(expiresAt || '');

  return `
    <div style="margin:0;padding:24px;background:${colors.pageBg};font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid ${colors.cardBorder};border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="padding:24px 28px;background-color:${colors.headerBg};background:${colors.headerGradient};color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;margin-bottom:8px;">Avenir Access</div>
          <h1 style="margin:0;font-size:22px;line-height:1.2;">Temporary Password</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.92;">Use this code to sign in directly, or as your reset code if you need to change it later. It expires in 24 hours.</p>
        </div>
        <div style="padding:24px 28px;">
          ${safeName ? `<p style="margin:0 0 14px;font-size:14px;color:#334155;">Hello ${safeName},</p>` : ''}
          <div style="margin:16px 0;padding:18px;border-radius:14px;background:${colors.summaryBg};border:1px solid ${colors.summaryBorder};text-align:center;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${colors.summaryText};opacity:0.9;margin-bottom:10px;">Temporary Password</div>
            <div style="font-size:28px;letter-spacing:0.18em;font-weight:700;color:#0f172a;">${safeCode}</div>
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#475569;">
            Expires at: <strong>${safeExpiry}</strong>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">
            You can use the same code on the sign-in screen and in the forgot-password flow.
          </p>
        </div>
      </div>
    </div>
  `;
};

app.post('/api/auth/password-reset/request', passwordResetRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (DISABLE_MONGODB) return res.json({ success: true });

    const email = normalizeLoginEmail(req.body?.email);
    if (!email) return res.json({ success: true });

    const user = await findAuthorizedUserByEmail(email);
    // Always respond success to avoid user enumeration.
    if (!user || user.status !== 'approved') return res.json({ success: true });

    const code = randomBytes(16).toString('hex').toUpperCase();
    user.resetPasswordTokenHash = hashResetToken(code);
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await AuthorizedUser.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordTokenHash: user.resetPasswordTokenHash,
          resetPasswordExpiresAt: user.resetPasswordExpiresAt,
        },
      },
    );

    const telecastSender = getTelecastSender();
    const { accessToken } = await getTelecastSendMailAccessToken();
    const html = buildPasswordResetEmailHtml({ code, displayName: user.displayName || user.email, styleKey: 'avenir_blue' });

    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${telecastSender}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: 'Opportunity Dashboard · Password Reset Code',
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: user.email } }],
        },
        saveToSentItems: 'true',
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      console.error('[auth.password-reset.request.sendMail-failed]', payload?.error?.message || graphResponse.status);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[auth.password-reset.request.error]', error?.message || String(error));
    return res.json({ success: true });
  }
});

// ── TempAccess Management ─────────────────────────────────────────────────────

const isMasterOrAdmin = (req) => ['Master', 'MASTER', 'Admin', 'ADMIN'].includes(req.user?.role);

const generateTempAccessPassword = () => randomBytes(5).toString('hex').toUpperCase();

const generateNextTempAccessId = async () => {
  const last = await TempAccess.findOne({}, { accessId: 1 }).sort({ accessId: -1 }).lean();
  if (!last?.accessId) return 'TEMP-001';
  const num = parseInt(String(last.accessId).replace(/^TEMP-/i, ''), 10) || 0;
  return `TEMP-${String(num + 1).padStart(3, '0')}`;
};

app.get('/api/admin/temp-access', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const records = await TempAccess.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, records: records.map(r => ({ ...mapIdField(r), passwordHash: undefined })) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to load temp access records' });
  }
});

app.post('/api/admin/temp-access', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const { displayName, allowedPages, validFrom, validUntil, notes } = req.body || {};
    if (!validUntil) return res.status(400).json({ error: 'validUntil is required' });

    const accessId = await generateNextTempAccessId();
    const plainPassword = generateTempAccessPassword();
    const passwordHash = await hashPassword(plainPassword);

    const record = await TempAccess.create({
      accessId,
      displayName: String(displayName || '').trim(),
      passwordHash,
      allowedPages: Array.isArray(allowedPages) ? allowedPages : [],
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: new Date(validUntil),
      isActive: true,
      createdBy: String(req.user?.email || ''),
      notes: String(notes || '').trim(),
    });

    res.json({ success: true, accessId, password: plainPassword, record: { ...mapIdField(record.toObject()), passwordHash: undefined } });
  } catch (error) {
    console.error('[temp-access.create.error]', error?.message);
    res.status(500).json({ error: error?.message || 'Failed to create temp access' });
  }
});

app.put('/api/admin/temp-access/:id', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const { displayName, allowedPages, validFrom, validUntil, isActive, notes } = req.body || {};
    const update = {};
    if (displayName !== undefined) update.displayName = String(displayName || '').trim();
    if (Array.isArray(allowedPages)) update.allowedPages = allowedPages;
    if (validFrom !== undefined) update.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) update.validUntil = new Date(validUntil);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (notes !== undefined) update.notes = String(notes || '').trim();
    const record = await TempAccess.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, record: { ...mapIdField(record), passwordHash: undefined } });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to update temp access' });
  }
});

app.delete('/api/admin/temp-access/:id', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'MASTER'].includes(req.user?.role)) return res.status(403).json({ error: 'Master only' });
    await TempAccess.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to delete temp access' });
  }
});

app.post('/api/admin/temp-access/:id/reset-password', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const plainPassword = generateTempAccessPassword();
    const passwordHash = await hashPassword(plainPassword);
    const record = await TempAccess.findByIdAndUpdate(req.params.id, { $set: { passwordHash } }, { new: true }).lean();
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, accessId: record.accessId, password: plainPassword });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to reset password' });
  }
});

// ── Feature 22: Award Value Report ───────────────────────────────────────────

app.post('/api/admin/award-value-report', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);

    const awarded = await SyncedOpportunity.find(
      { canonicalStage: 'AWARDED' },
      { opportunityRefNo: 1, tenderName: 1, clientName: 1, groupClassification: 1, internalLead: 1, awardedDate: 1, opportunityValue: 1, frameworkTotalValue: 1, callOffActualValue: 1 }
    ).lean();

    const missing = awarded.filter(o => {
      const hasValue = (Number(o.opportunityValue) > 0) || (o.frameworkTotalValue != null && Number(o.frameworkTotalValue) > 0) || (o.callOffActualValue != null && Number(o.callOffActualValue) > 0);
      return !hasValue;
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const headers = ['Ref No', 'Tender Name', 'Client', 'Group', 'Lead', 'Awarded Date', 'Opportunity Value', 'Framework Value', 'Call-Off Value'];
    const dataRows = missing.length
      ? missing.map(o => [o.opportunityRefNo || '', o.tenderName || '', o.clientName || '', o.groupClassification || '', o.internalLead || '', o.awardedDate || '', o.opportunityValue || '', o.frameworkTotalValue ?? '', o.callOffActualValue ?? ''])
      : [['No awarded tenders with missing values as of ' + dateStr, '', '', '', '', '', '', '', '']];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Missing Value Report');
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const contentBytes = excelBuffer.toString('base64');

    const masters = await AuthorizedUser.find({ role: { $in: ['Master', 'MASTER', 'Admin', 'ADMIN'] }, status: 'approved' }).lean();
    const masterEmails = masters.map(u => String(u.email || '').trim().toLowerCase()).filter(Boolean);
    if (!masterEmails.length) return res.status(400).json({ error: 'No master/admin users found to send to' });

    const { accessToken } = await getTelecastSendMailAccessToken();
    const toRecipients = masterEmails.map(e => ({ emailAddress: { address: e } }));
    const subject = `Award Value Report — ${dateStr} (${missing.length} tender${missing.length !== 1 ? 's' : ''} missing value)`;

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: buildAwardValueReportEmailHtml({ missing, dateStr }) },
          toRecipients,
          hasAttachments: true,
          attachments: [{
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: `award-value-report-${dateStr}.xlsx`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBytes,
          }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const p = await graphResponse.json().catch(() => ({}));
      throw new Error(p?.error?.message || `Graph sendMail failed ${graphResponse.status}`);
    }

    res.json({ success: true, recipientCount: masterEmails.length, missingCount: missing.length, awardedTotal: awarded.length });
  } catch (error) {
    console.error('[award-value-report.error]', error?.message);
    res.status(500).json({ error: error?.message || 'Failed to send award value report' });
  }
});

// ── Upcoming Features Roadmap ─────────────────────────────────────────────────

const UPCOMING_SEED = [
  { title: 'Feature #12 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 12 },
  { title: 'Feature #13 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 13 },
  { title: 'Feature #14 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 14 },
  { title: 'Feature #15 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 15 },
  { title: 'Feature #17 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 17 },
  { title: 'Feature #18 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 18 },
  { title: 'Feature #21 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 21 },
  { title: 'Feature #23 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 23 },
];

const ensureUpcomingSeed = async () => {
  const count = await UpcomingFeature.countDocuments({});
  if (count === 0) {
    await UpcomingFeature.insertMany(UPCOMING_SEED);
  }
};

app.get('/api/upcoming', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    await ensureUpcomingSeed();
    const items = await UpcomingFeature.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
    res.json({ success: true, items: items.map(mapIdField) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to fetch upcoming features' });
  }
});

app.post('/api/upcoming', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const { title, description = '', category = 'General', status = 'Planned', priority = 'Medium', sortOrder = 0 } = req.body || {};
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Title is required' });
    const item = await UpcomingFeature.create({ title: String(title).trim(), description, category, status, priority, sortOrder: Number(sortOrder) || 0, updatedBy: req.user.email });
    res.json({ success: true, item: mapIdField(item.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to create upcoming feature' });
  }
});

app.put('/api/upcoming/:id', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const { title, description, category, status, priority, sortOrder } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = description;
    if (category !== undefined) update.category = category;
    if (status !== undefined) update.status = status;
    if (priority !== undefined) update.priority = priority;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    update.updatedBy = req.user.email;
    const item = await UpcomingFeature.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, item: mapIdField(item.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to update upcoming feature' });
  }
});

app.delete('/api/upcoming/:id', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'MASTER'].includes(String(req.user?.role || ''))) return res.status(403).json({ error: 'Master only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    await UpcomingFeature.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to delete upcoming feature' });
  }
});

app.get('/api/auth/diagnostics', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'users_manage')) return;
    if (!(req.user?.role === 'Master' || req.user?.role === 'MASTER')) {
      return res.status(403).json({ error: 'Only Master users can view auth diagnostics' });
    }

    const logs = await AuthDiagnosticLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, logs: logs.map(mapIdField) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to load auth diagnostics' });
  }
});

app.post('/api/auth/password-reset/confirm', passwordResetRateLimiter, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (DISABLE_MONGODB) return res.status(403).json({ error: 'Password reset not available in offline mode' });

    const email = normalizeLoginEmail(req.body?.email);
    const code = String(req.body?.code || '').trim().toUpperCase();
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'email, code, and newPassword are required' });

    try { assertStrongPassword(newPassword); } catch (e) { return res.status(400).json({ error: e.message }); }
    const user = await findAuthorizedUserByEmail(email);
    if (!user || user.status !== 'approved') return res.status(403).json({ error: 'Invalid reset request' });

    const expiresAt = user.resetPasswordExpiresAt ? new Date(user.resetPasswordExpiresAt).getTime() : 0;
    if (!user.resetPasswordTokenHash || !expiresAt || Date.now() > expiresAt) {
      return res.status(403).json({ error: 'Reset code expired' });
    }

    const providedHash = hashResetToken(code);
    if (providedHash !== user.resetPasswordTokenHash) {
      return res.status(403).json({ error: 'Invalid reset code' });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    user.requiresPasswordChange = false;
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastFailedLoginAt = null;
    user.resetPasswordTokenHash = '';
    user.resetPasswordExpiresAt = null;
    await user.save();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Password reset failed' });
  }
});

app.post('/api/auth/change-password', authRateLimiter, verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const email = String(req.user?.email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });

    try { assertStrongPassword(newPassword); } catch (e) { return res.status(400).json({ error: e.message }); }
    const user = await AuthorizedUser.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.passwordHash) return res.status(400).json({ error: 'Password login not configured for this user' });

    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) return res.status(403).json({ error: 'Invalid current password' });

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    user.requiresPasswordChange = false;
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastFailedLoginAt = null;
    await user.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/authorized', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin users can view this' });
    }

    const users = await AuthorizedUser.find().sort({ createdAt: -1 }).lean();
    const safeUsers = users.map((u) => {
      const mapped = mapIdField(u);
      const { passwordHash: _ph, resetPasswordTokenHash: _rpth, ...rest } = mapped;
      return {
        ...rest,
        hasPassword: Boolean(u.passwordHash),
        isLocked: Boolean(u.accountLockedUntil && new Date(u.accountLockedUntil).getTime() > Date.now()),
        failedLoginAttempts: u.failedLoginAttempts || 0,
        accountLockedUntil: u.accountLockedUntil || null,
        requiresPasswordChange: Boolean(u.requiresPasswordChange),
      };
    });
    res.json(safeUsers);
  } catch (error) {
    return handleApiError(res, error, 'users.authorized.get');
  }
});

app.post('/api/users/set-password', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');
    const requireChange = req.body?.requireChange !== undefined ? Boolean(req.body.requireChange) : true;

    if (!email || !newPassword) return res.status(400).json({ error: 'email and newPassword are required' });
    try { assertStrongPassword(newPassword); } catch (e) { return res.status(400).json({ error: e.message }); }

    const existing = await AuthorizedUser.findOne({ email });
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const targetIsMaster = existing.role === 'Master' || existing.role === 'MASTER';
    const requesterIsMaster = req.user.role === 'Master' || req.user.role === 'MASTER';
    if (targetIsMaster && !requesterIsMaster) return res.status(403).json({ error: 'Only Master users can modify Master users' });

    existing.passwordHash = await hashPassword(newPassword);
    existing.passwordChangedAt = new Date();
    existing.requiresPasswordChange = requireChange;
    existing.failedLoginAttempts = 0;
    existing.accountLockedUntil = null;
    existing.lastFailedLoginAt = null;

    // Admin explicitly assigning a password implies the user should be able to log in.
    // Fix every gate the login flow checks so the user can actually authenticate.

    // 1. Approve pending users
    if (existing.status === 'pending') {
      existing.status = 'approved';
      existing.approvedBy = req.user.email;
      existing.approvedAt = new Date();
      console.info(`[set-password] auto-approved pending user ${existing.email}`);
    }

    // 2. Clear expired tempAccessExpiresAt — setting a permanent password means the
    //    admin wants this user to have normal (non-expiring) login access.
    //    Leaving an expired date here causes a 403 'temp_access_expired' on login.
    if (existing.tempAccessExpiresAt && new Date(existing.tempAccessExpiresAt).getTime() <= Date.now()) {
      existing.tempAccessExpiresAt = null;
      console.info(`[set-password] cleared expired tempAccessExpiresAt for ${existing.email}`);
    }

    // 3. If the user is still TempUser role and there is no valid temp window, upgrade
    //    to Basic so the hasValidTempAccess check in login does not gate them out.
    if (existing.role === 'TempUser') {
      const stillValidWindow = existing.tempAccessExpiresAt && new Date(existing.tempAccessExpiresAt).getTime() > Date.now();
      if (!stillValidWindow) {
        existing.role = 'Basic';
        console.info(`[set-password] promoted TempUser→Basic for ${existing.email} (no valid temp window)`);
      }
    }

    await existing.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/unlock-account', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'users_manage')) return;
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const existing = await AuthorizedUser.findOne({ email });
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const targetIsMaster = existing.role === 'Master' || existing.role === 'MASTER';
    const requesterIsMaster = req.user.role === 'Master' || req.user.role === 'MASTER';
    if (targetIsMaster && !requesterIsMaster) return res.status(403).json({ error: 'Only Master users can modify Master users' });
    await AuthorizedUser.updateOne({ _id: existing._id }, {
      $set: { failedLoginAttempts: 0, accountLockedUntil: null, lastFailedLoginAt: null },
    });
    console.info(`[users.unlock] email=${email} by=${req.user.email}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/add', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const role = String(req.body?.role || 'Basic');
    const assignedGroupRaw = req.body?.assignedGroup ? String(req.body?.assignedGroup).toUpperCase().trim() : null;
    const status = String(req.body?.status || 'approved');
    const rawPassword = req.body?.password !== undefined ? String(req.body.password) : '';
    const tempAccessExpiresAt = req.body?.tempAccessExpiresAt ? new Date(String(req.body.tempAccessExpiresAt)) : null;

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (role === 'Master') {
      return res.status(403).json({ error: 'Assigning Master is not allowed' });
    }

    if (role === 'SVP' && !assignedGroupRaw) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    if (assignedGroupRaw && !['GES', 'GDS', 'GTS'].includes(assignedGroupRaw)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
    }

    if (role === 'TempUser') {
      if (!rawPassword) return res.status(400).json({ error: 'Temp password is required for TempUser' });
      if (!tempAccessExpiresAt || Number.isNaN(tempAccessExpiresAt.getTime())) return res.status(400).json({ error: 'Valid tempAccessExpiresAt is required for TempUser' });
    }

    if (rawPassword) {
      try {
        assertStrongPassword(rawPassword);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const existing = await AuthorizedUser.findOne({ email });
    if (existing?.role === 'Master' || existing?.role === 'MASTER') {
      return res.status(403).json({ error: 'Modifying Master users is not allowed' });
    }

    const passwordPatch = {};
    if (rawPassword) {
      passwordPatch.passwordHash = await hashPassword(rawPassword);
      passwordPatch.passwordChangedAt = new Date();
      passwordPatch.requiresPasswordChange = role === 'TempUser' ? true : false;
      passwordPatch.failedLoginAttempts = 0;
      passwordPatch.accountLockedUntil = null;
      passwordPatch.lastFailedLoginAt = null;
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        email,
        displayName: displayName || email,
        role,
        assignedGroup: role === 'SVP' ? assignedGroupRaw : null,
        status: ['approved', 'pending', 'rejected'].includes(status) ? status : 'approved',
        tempAccessExpiresAt: role === 'TempUser' ? tempAccessExpiresAt : null,
        ...passwordPatch,
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, user: mapIdField(user.toObject ? user.toObject() : user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/approve', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        status: 'approved',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    return handleApiError(res, error, 'users.approve');
  }
});

app.post('/api/users/reject', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        status: 'rejected',
        approvedBy: req.user.email,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    invalidateUserCache(email.toLowerCase());
    res.json({ success: true, user });
  } catch (error) {
    return handleApiError(res, error, 'users.reject');
  }
});

app.post('/api/users/change-role', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const { email, newRole, assignedGroup } = req.body;
    if (!email || !newRole) {
      return res.status(400).json({ error: 'Email and newRole are required' });
    }

    const validRoles = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser', 'MASTER', 'PROPOSAL_HEAD'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (newRole === 'SVP' && !assignedGroup) {
      return res.status(400).json({ error: 'assignedGroup is required for SVP users' });
    }

    const normalizedGroup = assignedGroup ? String(assignedGroup).toUpperCase() : null;
    if (normalizedGroup && !['GES', 'GDS', 'GTS'].includes(normalizedGroup)) {
      return res.status(400).json({ error: 'assignedGroup must be one of GES, GDS, GTS' });
    }

    const existing = await AuthorizedUser.findOne({ email: email.toLowerCase() });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    const targetIsMaster = existing.role === 'Master' || existing.role === 'MASTER';
    const requesterIsMaster = req.user.role === 'Master' || req.user.role === 'MASTER';
    const nextRoleIsMaster = newRole === 'Master' || newRole === 'MASTER';

    if ((targetIsMaster || nextRoleIsMaster) && !requesterIsMaster) {
      return res.status(403).json({ error: 'Only Master users can assign or modify Master users' });
    }

    if (targetIsMaster && existing.email === req.user.email && !nextRoleIsMaster) {
      return res.status(403).json({ error: 'Master users cannot change their own role' });
    }

    const update = { role: newRole, assignedGroup: newRole === 'SVP' ? normalizedGroup : null };
    const user = await AuthorizedUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      update,
      { new: true }
    );

    invalidateUserCache(email.toLowerCase());
    res.json({ success: true, user });
  } catch (error) {
    return handleApiError(res, error, 'users.change-role');
  }
});

app.delete('/api/users/remove', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'users_manage')) return;

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const target = await AuthorizedUser.findOne({ email: email.toLowerCase() });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'Master' || target.role === 'MASTER') {
      return res.status(403).json({ error: 'Removing Master users is not allowed' });
    }

    const result = await AuthorizedUser.deleteOne({ email: email.toLowerCase() });

    invalidateUserCache(email.toLowerCase());
    res.json({ success: true, message: 'User removed' });
  } catch (error) {
    return handleApiError(res, error, 'users.remove');
  }
});

app.get('/api/opportunities/lead-email/suggestions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;

    const users = await AuthorizedUser.find().lean();
    const mappings = await LeadEmailMapping.find({}).lean();
    const mappingKeys = new Set(
      mappings.map((row) => normalizeLeadKey(row.leadNameKey || row.leadNameDisplay || ''))
    );

    const opportunities = await SyncedOpportunity.find(
      { internalLead: { $exists: true, $ne: '' } },
      { internalLead: 1, opportunityRefNo: 1, tenderName: 1, leadEmail: 1 }
    ).lean();

    const leadBuckets = new Map();
    opportunities.forEach((opportunity) => {
      const leadName = String(opportunity.internalLead || '').trim();
      if (!leadName) return;
      const key = normalizeLeadKey(leadName);
      if (!key) return;
      const bucket = leadBuckets.get(key) || {
        leadName,
        leadNameKey: key,
        count: 0,
        tenders: [],
        hasLeadEmail: false,
        nameCounts: new Map(),
      };
      bucket.count += 1;
      bucket.hasLeadEmail = bucket.hasLeadEmail || Boolean(String(opportunity.leadEmail || '').trim());
      bucket.nameCounts.set(leadName, (bucket.nameCounts.get(leadName) || 0) + 1);
      if (bucket.tenders.length < 8) {
        bucket.tenders.push({
          refNo: opportunity.opportunityRefNo || '',
          tenderName: opportunity.tenderName || '',
        });
      }
      leadBuckets.set(key, bucket);
    });

    const suggestions = [];
    leadBuckets.forEach((bucket, leadKey) => {
      if (mappingKeys.has(leadKey) || bucket.hasLeadEmail) return;
      let displayName = bucket.leadName || '';
      let maxCount = 0;
      bucket.nameCounts.forEach((count, name) => {
        if (count > maxCount) {
          maxCount = count;
          displayName = name;
        }
      });

      const { best, score } = findBestLeadEmailMatch(displayName, users);
      suggestions.push({
        leadName: displayName,
        leadNameKey: leadKey,
        tenderCount: bucket.count,
        tenders: bucket.tenders,
        suggestedEmail: best?.email || '',
        score: score || 0,
      });
    });

    suggestions.sort((a, b) => (b.tenderCount - a.tenderCount) || (b.score - a.score));
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/lead-email/approve', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;

    const leadNameKey = normalizeLeadKey(String(req.body?.leadNameKey || req.body?.leadName || '').trim());
    const leadNameDisplay = String(req.body?.leadName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!leadNameKey || !email) {
      return res.status(400).json({ error: 'leadName and email are required' });
    }

    const now = new Date();
    const mapping = await LeadEmailMapping.findOneAndUpdate(
      { leadNameKey },
      {
        leadNameKey,
        leadNameDisplay: leadNameDisplay || leadNameKey,
        leadEmail: email,
        approvedBy: req.user.email,
        approvedAt: now,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const leadPattern = buildLeadNameRegex(leadNameDisplay || leadNameKey);
    if (leadPattern) {
      await SyncedOpportunity.updateMany(
        { internalLead: leadPattern },
        {
          $set: {
            leadEmail: email,
            leadEmailSource: 'mapping',
            leadEmailAssignedBy: req.user.email,
            leadEmailAssignedAt: now,
          },
        }
      );
    }

    res.json({ success: true, mapping });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/lead-email/assigned', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'lead_email_manage')) return;
    const mappings = await LeadEmailMapping.find({}).lean();
    if (!mappings.length) return res.json({ leads: [] });

    const opportunities = await SyncedOpportunity.find(
      { internalLead: { $exists: true, $ne: '' } },
      { internalLead: 1, opportunityRefNo: 1, tenderName: 1 }
    ).lean();

    const leads = mappings.map((mapping) => {
      const leadKey = normalizeLeadKey(mapping.leadNameKey || mapping.leadNameDisplay || '');
      if (!leadKey) return null;
      const tenders = [];
      let count = 0;
      opportunities.forEach((opportunity) => {
        const leadName = String(opportunity.internalLead || '').trim();
        if (!leadName) return;
        const key = normalizeLeadKey(leadName);
        if (key !== leadKey) return;
        count += 1;
        if (tenders.length < 8) {
          tenders.push({
            refNo: opportunity.opportunityRefNo || '',
            tenderName: opportunity.tenderName || '',
          });
        }
      });
      return {

        leadName: mapping.leadNameDisplay || mapping.leadNameKey || '',
        leadNameKey: mapping.leadNameKey || '',
        leadEmail: mapping.leadEmail || '',
        count,
        tenders,
      };
    }).filter(Boolean);

    leads.sort((a, b) => b.count - a.count);
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logs/cleanup', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'logs_cleanup')) return;

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const result = await LoginLog.deleteMany({ loginTime: { $lt: fifteenDaysAgo } });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approvals', verifyToken, async (req, res) => {
  try {
    const approvals = await approvalDb.getApprovals();
    const approvalStates = await approvalDb.getApprovalStates();
    res.json({ approvals, approvalStates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve-proposal-head', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'approvals_proposal_head')) return;

    const { opportunityRefNo } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    const existingApproval = await Approval.findOne({ opportunityRefNo }).lean();
    const result = await approvalDb.approveAsProposalHead(opportunityRefNo, req.user.displayName, req.user.role);
    if (!existingApproval?.proposalHeadApproved) {
      try {
        const opportunity = await SyncedOpportunity.findOne({ opportunityRefNo }).lean();
        if (opportunity) {
          await sendApprovalAlertForOpportunity({ opportunity, approvedBy: req.user.displayName || req.user.email });
        }
      } catch (approvalAlertError) {
        console.error('[approval.alert.dispatch.error]', approvalAlertError?.message || approvalAlertError);
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/approve-svp', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'approvals_svp')) return;

    const { opportunityRefNo, group } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    if (req.user.role === 'SVP' && req.user.assignedGroup && group && req.user.assignedGroup !== group) {
      return res.status(403).json({ error: 'SVP can only approve assigned group tenders' });
    }

    const result = await approvalDb.approveAsSVP(opportunityRefNo, req.user.displayName, req.user.role, group || req.user.assignedGroup);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/bulk-approve', verifyToken, async (req, res) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const filters = req.body?.filters || {};

    if (action === 'proposal_head') {
      if (!await requireActionPermission(req, res, 'approvals_proposal_head')) return;
    } else if (action === 'svp') {
      if (!await requireActionPermission(req, res, 'approvals_svp')) return;
    } else {
      return res.status(400).json({ error: 'Invalid bulk approve action' });
    }

    const opportunities = await SyncedOpportunity.find().lean();
    let scoped = filterOpportunitiesForBulkApprove(opportunities, filters);

    if (action === 'svp' && req.user.role !== 'Master') {
      const assignedGroup = String(req.user.assignedGroup || '').toUpperCase();
      scoped = scoped.filter((opp) => String(opp.groupClassification || '').toUpperCase() === assignedGroup);
    }

    const refs = scoped.map((opp) => opp.opportunityRefNo).filter(Boolean);

    if (action === 'proposal_head') {
      const existingApprovals = await Approval.find({ opportunityRefNo: { $in: refs }, proposalHeadApproved: true }, { opportunityRefNo: 1 }).lean();
      const alreadyApprovedRefs = new Set(existingApprovals.map((item) => item.opportunityRefNo));
      const result = await approvalDb.bulkApproveAsProposalHead(refs, req.user.displayName, req.user.role);
      try {
        const newlyApproved = scoped.filter((opportunity) => !alreadyApprovedRefs.has(opportunity.opportunityRefNo));
        if (newlyApproved.length) {
          await sendBulkApprovalAlerts({ opportunities: newlyApproved, approvedBy: req.user.displayName || req.user.email, filters });
        }
      } catch (approvalAlertError) {
        console.error('[approval.alert.bulk-dispatch.error]', approvalAlertError?.message || approvalAlertError);
      }
      return res.json({ success: true, updated: result.updatedCount || 0, approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
    }

    const result = await approvalDb.bulkApproveAsSVP(refs, req.user.displayName, req.user.role, req.user.assignedGroup);
    return res.json({ success: true, updated: result.updatedCount || 0, skipped: result.skipped || [], approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/bulk-revert', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'approvals_bulk_revert')) return;

    const filters = req.body?.filters || {};
    const opportunities = await SyncedOpportunity.find().lean();
    const scoped = filterOpportunitiesForBulkApprove(opportunities, filters);
    const refs = scoped.map((opp) => opp.opportunityRefNo).filter(Boolean);

    const result = await approvalDb.bulkRevert(refs, req.user.displayName, req.user.role);
    return res.json({ success: true, updated: result.updatedCount || 0, approvals: result.approvals, approvalStates: result.approvalStates, approvalLogs: result.approvalLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/revert', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'approvals_revert')) return;

    const { opportunityRefNo } = req.body;
    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    const result = await approvalDb.revertApproval(opportunityRefNo, req.user.displayName, req.user.role);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approval-logs', verifyToken, async (req, res) => {
  try {
    const logs = await approvalDb.getApprovalLogs();
    res.json(logs.map((log) => ({
      id: log._id?.toString(),
      opportunityRefNo: log.opportunityRefNo,
      action: log.action,
      performedBy: log.performedBy,
      performedByRole: log.performedByRole,
      group: log.group,
      timestamp: log.createdAt,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/graph/config', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view graph config' });
    }

    const config = await getGraphConfig();
    res.json(mapIdField(config.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/graph/config', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'graph_config_write')) return;

    const config = await getGraphConfig();
    const { shareLink, driveId, fileId, worksheetName, dataRange, headerRowOffset, syncIntervalMinutes, fieldMapping } = req.body || {};

    if (shareLink !== undefined) config.shareLink = String(shareLink || '');
    if (driveId !== undefined) config.driveId = String(driveId || '');
    if (fileId !== undefined) config.fileId = String(fileId || '');
    if (worksheetName !== undefined) config.worksheetName = String(worksheetName || '');
    if (dataRange !== undefined) config.dataRange = String(dataRange || '');
    if (headerRowOffset !== undefined) config.headerRowOffset = Math.max(0, Number(headerRowOffset) || 0);
    if (syncIntervalMinutes !== undefined) config.syncIntervalMinutes = Number(syncIntervalMinutes) || 10;
    if (fieldMapping !== undefined && typeof fieldMapping === 'object') config.fieldMapping = fieldMapping;

    config.updatedBy = req.user.email;
    await config.save();
    await scheduleGraphAutoSync();

    res.json({ success: true, config: mapIdField(config.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/resolve-share-link', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can resolve links' });
    }

    const { shareLink } = req.body || {};
    if (!shareLink) {
      return res.status(400).json({ error: 'shareLink is required' });
    }

    const config = await getGraphConfig();
    const resolved = await resolveShareLink(shareLink, config);

    config.shareLink = shareLink;
    config.driveId = resolved.driveId;
    config.fileId = resolved.fileId;
    config.lastResolvedAt = new Date();
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, ...resolved, config: mapIdField(config.toObject()) });
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      troubleshooting: [
        ...((error.details && Array.isArray(error.details.troubleshooting)) ? error.details.troubleshooting : []),
        'Microsoft blocks resolution for personal OneDrives. Please paste Drive ID and File ID manually from the Python diagnostic tool.',
      ],
    };
    res.status(500).json(toApiError(error, 'GRAPH_RESOLVE_FAILED'));
  }
});

app.post('/api/graph/worksheets', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can list worksheets' });
    }

    const { driveId, fileId } = req.body || {};
    if (!driveId || !fileId) {
      return res.status(400).json({ error: 'driveId and fileId are required' });
    }

    const config = await getGraphConfig();
    const sheets = await getWorksheets({ driveId, fileId, config });
    res.json({ success: true, sheets });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_WORKSHEETS_FAILED'));
  }
});

app.post('/api/graph/preview-rows', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can preview worksheet rows' });
    }

    const { driveId, fileId, worksheetName, dataRange } = req.body || {};
    if (!driveId || !fileId || !worksheetName) {
      return res.status(400).json({ error: 'driveId, fileId and worksheetName are required' });
    }

    const config = await getGraphConfig();
    const rows = await getWorksheetRangeValues({
      driveId,
      fileId,
      worksheetName,
      rangeAddress: dataRange || 'B4:Z60',
      config,
    });

    res.json({
      success: true,
      rowCount: rows.length,
      previewRows: rows.slice(0, 20),
    });
  } catch (error) {
    res.status(500).json(toApiError(error, 'GRAPH_PREVIEW_FAILED'));
  }
});

app.get('/api/graph/auth/consent-url', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view consent URL' });
    }

    const loginHint = req.query?.loginHint ? String(req.query.loginHint) : '';
    const consentUrl = buildDelegatedConsentUrl({ loginHint });
    res.json({ success: true, consentUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/graph/auth/status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view auth status' });
    }

    const config = await getGraphConfig();
    res.json({
      success: true,
      authMode: config.graphAuthMode || 'application',
      accountUsername: config.graphAccountUsername || '',
      hasRefreshToken: !!config.graphRefreshTokenEnc,
      tokenUpdatedAt: config.graphTokenUpdatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/auth/bootstrap', verifyToken, async (req, res) => {
  const username = req.body?.username || '';
  try {
    if (!await requireActionPermission(req, res, 'graph_auth_write')) return;

    const { password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const tokenResult = await bootstrapDelegatedToken({ username, password });
    if (!tokenResult.refreshToken) {
      return res.status(500).json({ error: 'No refresh token returned. Check Azure app delegated permissions and token settings.' });
    }

    const config = await getGraphConfig();
    config.graphAuthMode = 'delegated';
    config.graphAccountUsername = String(username).toLowerCase();
    config.graphRefreshTokenEnc = protectRefreshToken(tokenResult.refreshToken);
    config.graphTokenUpdatedAt = new Date();
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Bootstrap complete. Delegated token cached securely.', scope: tokenResult.scope, mode: 'delegated' });
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('AADSTS50076') || msg.toLowerCase().includes('mfa')) {
      return res.status(400).json({ error: 'MFA_REQUIRED', message: 'MFA is enabled. Use a non-MFA service account for bootstrap.' });
    }
    if (msg.includes('AADSTS50126')) {
      return res.status(400).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }
    if (msg.includes('AADSTS50034')) {
      return res.status(400).json({ error: 'USER_NOT_FOUND', message: 'User not found in this tenant.' });
    }
    if (msg.includes('AADSTS65001')) {
      const consentUrl = buildDelegatedConsentUrl({ loginHint: username });
      return res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'This account has not granted consent to the app yet. Open consent URL and accept once, then retry bootstrap.',
        consentUrl,
      });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/api/graph/auth/clear', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'graph_auth_write')) return;

    const config = await getGraphConfig();
    config.graphAuthMode = 'application';
    config.graphAccountUsername = '';
    config.graphRefreshTokenEnc = '';
    config.graphTokenUpdatedAt = null;
    config.updatedBy = req.user.email;
    await config.save();

    res.json({ success: true, message: 'Delegated token cleared. Falling back to application auth.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PAGE_KEYS = [
  'dashboard',
  'opportunities',
  'bid_decision',
  'tender_updates',
  'pq_activities',
  'vendor_directory',
  'clients',
  'analytics',
  'bd_engagements',
  'master',
  'master_general',
  'master_users',
  'master_data_sync',
  'master_telecast',
  'master_update',
  'master_export',
];
const ROLE_KEYS = ['Master', 'Admin', 'ProposalHead', 'SVP', 'Basic', 'BDTeam', 'TempUser'];
const ACTION_KEYS = [
  'opportunities_view',
  'opportunities_write',
  'opportunities_sync',
  'opportunities_sheet_upload',
  'manual_opportunity_updates_write',
  'bd_engagements_write',
  'pq_activities_view',
  'pq_activities_manage',
  'approvals_proposal_head',
  'approvals_svp',
  'approvals_bulk_revert',
  'approvals_revert',
  'vendors_write',
  'vendors_import',
  'clients_write',
  'clients_import',
  'clients_seed',
  'users_manage',
  'navigation_permissions_write',
  'graph_config_write',
  'graph_auth_write',
  'telecast_config_write',
  'telecast_auth_write',
  'export_template_write',
  'notification_alert_flags_write',
  'lead_email_manage',
  'logs_cleanup',
];
const DEFAULT_PAGE_ROLE_ACCESS = {
  dashboard: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'],
  opportunities: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bid_decision: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'],
  tender_updates: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  pq_activities: ['Master', 'Admin', 'Basic'],
  vendor_directory: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  clients: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  analytics: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  bd_engagements: ['Master', 'Admin', 'BDTeam'],
  master: ['Master', 'Admin'],
  master_general: ['Master', 'Admin'],
  master_users: ['Master', 'Admin'],
  master_data_sync: ['Master', 'Admin'],
  master_telecast: ['Master', 'Admin'],
  master_update: ['Master', 'Admin'],
  master_export: ['Master', 'Admin'],
};
const DEFAULT_ACTION_ROLE_ACCESS = {
  opportunities_view: ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic'],
  opportunities_write: ['Master', 'Admin', 'ProposalHead', 'SVP'],
  opportunities_sync: ['Master', 'Admin'],
  opportunities_sheet_upload: ['Master', 'Admin'],
  manual_opportunity_updates_write: ['Master', 'Admin'],
  bd_engagements_write: ['Master', 'Admin', 'BDTeam'],
  pq_activities_view: ['Master', 'Admin', 'Basic'],
  pq_activities_manage: ['Master'],
  approvals_proposal_head: ['Master', 'ProposalHead'],
  approvals_svp: ['Master', 'SVP'],
  approvals_bulk_revert: ['Master', 'ProposalHead'],
  approvals_revert: ['Master'],
  vendors_write: ['Master', 'Admin'],
  vendors_import: ['Master', 'Admin'],
  clients_write: ['Master', 'Admin', 'ProposalHead'],
  clients_import: ['Master', 'Admin'],
  clients_seed: ['Master', 'Admin'],
  users_manage: ['Master'],
  navigation_permissions_write: ['Master'],
  graph_config_write: ['Master'],
  graph_auth_write: ['Master'],
  telecast_config_write: ['Master'],
  telecast_auth_write: ['Master'],
  export_template_write: ['Master'],
  notification_alert_flags_write: ['Master', 'Admin'],
  lead_email_manage: ['Master', 'Admin'],
  logs_cleanup: ['Master'],
};

(() => {
  const pageKeySet = new Set(PAGE_KEYS);
  const defaultPages = Object.keys(DEFAULT_PAGE_ROLE_ACCESS);
  const unknownDefaultPages = defaultPages.filter((key) => !pageKeySet.has(key));
  if (unknownDefaultPages.length) {
    console.warn('[boot] DEFAULT_PAGE_ROLE_ACCESS contains unknown keys:', unknownDefaultPages);
  }

  const actionKeySet = new Set(ACTION_KEYS);
  const defaultActions = Object.keys(DEFAULT_ACTION_ROLE_ACCESS);
  const unknownDefaultActions = defaultActions.filter((key) => !actionKeySet.has(key));
  if (unknownDefaultActions.length) {
    console.warn('[boot] DEFAULT_ACTION_ROLE_ACCESS contains unknown keys:', unknownDefaultActions);
  }
})();

const sanitizePageRoleAccess = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    const list = Array.isArray(input?.[page]) ? input[page] : DEFAULT_PAGE_ROLE_ACCESS[page];
    normalized[page] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
    if (!normalized[page].length) normalized[page] = [...DEFAULT_PAGE_ROLE_ACCESS[page]];
  }
  return normalized;
};

const sanitizePageEmailAccess = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    normalized[page] = normalizeEmailList(input?.[page] || []);
  }
  return normalized;
};

const sanitizePageExcludeRoleAccess = (input = {}) => {
  const normalized = {};
  for (const page of PAGE_KEYS) {
    const list = Array.isArray(input?.[page]) ? input[page] : [];
    normalized[page] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
  }
  return normalized;
};

const sanitizeActionRoleAccess = (input = {}) => {
  const normalized = {};
  for (const action of ACTION_KEYS) {
    const list = Array.isArray(input?.[action]) ? input[action] : DEFAULT_ACTION_ROLE_ACCESS[action];
    normalized[action] = [...new Set(list.filter((role) => ROLE_KEYS.includes(role)))];
    if (!normalized[action].length) normalized[action] = [...DEFAULT_ACTION_ROLE_ACCESS[action]];
  }
  return normalized;
};

const sanitizeActionEmailAccess = (input = {}) => {
  const normalized = {};
  for (const action of ACTION_KEYS) {
    normalized[action] = normalizeEmailList(input?.[action] || []);
  }
  return normalized;
};

const systemConfigCache = {
  value: null,
  expiresAt: 0,
  inFlight: null,
};

const hashJson = (value) => {
  try {
    const json = JSON.stringify(value ?? null);
    return createHash('sha256').update(json).digest('hex').slice(0, 12);
  } catch {
    return 'hash_error';
  }
};

const getSystemConfigFingerprint = (config) => {
  if (!config) return 'missing-config';
  const source = typeof config.toObject === 'function' ? config.toObject() : config;
  const {
    _id,
    __v,
    createdAt,
    updatedAt,
    lastUpdatedBy,
    updatedBy,
    ...rest
  } = source || {};
  return hashJson(rest);
};

const getSystemConfigMeta = (config) => {
  const source = typeof config?.toObject === 'function' ? config.toObject() : (config || {});
  return {
    systemConfigUpdatedAt: source.updatedAt || null,
    systemConfigUpdatedBy: source.updatedBy || source.lastUpdatedBy || null,
    systemConfigFingerprint: getSystemConfigFingerprint(source),
  };
};

const addConfigMetaHeaders = (res, config) => {
  const meta = getSystemConfigMeta(config);
  res.setHeader('X-System-Config-Fingerprint', meta.systemConfigFingerprint);
  if (meta.systemConfigUpdatedAt) res.setHeader('X-System-Config-Updated-At', new Date(meta.systemConfigUpdatedAt).toISOString());
  if (meta.systemConfigUpdatedBy) res.setHeader('X-System-Config-Updated-By', String(meta.systemConfigUpdatedBy));
  return meta;
};

const getUnknownPermissionKeys = (input = {}, allowedKeys = []) => Object.keys(input || {}).filter((key) => !allowedKeys.includes(key));

const persistSystemConfigFields = async (config, updates, updatedBy, reason = 'system_config_update') => {
  const targetId = config?._id;
  if (!targetId) {
    throw new Error('System config is missing');
  }
  const patch = { ...updates };
  if (updatedBy !== undefined) {
    patch.updatedBy = updatedBy;
    patch.lastUpdatedBy = updatedBy;
  }
  await SystemConfig.updateOne({ _id: targetId }, { $set: patch });
  invalidateSystemConfigCache(reason);
  return SystemConfig.findById(targetId);
};

const invalidateSystemConfigCache = (reason = 'unknown') => {
  systemConfigCache.value = null;
  systemConfigCache.expiresAt = 0;
  systemConfigCache.inFlight = null;
  if (DIAG_LOGS) {
    console.log(`[diag] ${clampLog({ tag: 'DIAG_CONFIG_CACHE_INVALIDATE', ts: new Date().toISOString(), reason })}`);
  }
};

const getSystemConfig = async (options = {}) => {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && systemConfigCache.value && systemConfigCache.expiresAt > now) {
    return systemConfigCache.value;
  }
  if (!force && systemConfigCache.inFlight) {
    return systemConfigCache.inFlight;
  }
  systemConfigCache.inFlight = (async () => {
    let config = await SystemConfig.findOne();
    if (!config) config = await SystemConfig.create({});
    systemConfigCache.value = config;
    systemConfigCache.expiresAt = Date.now() + CONFIG_CACHE_TTL_MS;
    return config;
  })().finally(() => {
    systemConfigCache.inFlight = null;
  });
  return systemConfigCache.inFlight;
};

const BUILD_INFO = (() => {
  const buildTime = process.env.BUILD_TIME || new Date().toISOString();
  const envSha = process.env.GIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || '';
  let gitSha = String(envSha || '').trim();
  if (!gitSha) {
    try {
      gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      gitSha = 'unknown';
    }
  }
  return { gitSha, buildTime };
})();

const bytesToPercent = (usedBytes, totalBytes) => {
  const total = Number(totalBytes || 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const used = Number(usedBytes || 0);
  return Math.max(0, Math.min(100, Math.round((used / total) * 1000) / 10));
};

const detectDeploymentPlatform = () => {
  if (process.env.RENDER) return 'Render';
  if (process.env.LIGHTSAIL_HOME || process.env.LIGHTSAIL_REGION) return 'AWS Lightsail';
  if (process.env.AWS_EXECUTION_ENV || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) return 'AWS';
  if (process.env.VERCEL) return 'Vercel';
  if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PROJECT_ID) return 'Railway';
  return 'Unknown';
};

const readSystemTemperature = () => {
  const candidates = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/hwmon/hwmon0/temp1_input',
    '/sys/class/hwmon/hwmon1/temp1_input',
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = String(fs.readFileSync(candidate, 'utf8')).trim();
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) continue;
      const celsius = numeric > 1000 ? numeric / 1000 : numeric;
      return {
        celsius: Math.round(celsius * 10) / 10,
        source: path.basename(candidate),
      };
    } catch {
      // ignore and try next source
    }
  }

  return { celsius: null, source: null };
};

const getSystemHealthSnapshot = () => {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
  const processMemory = process.memoryUsage();

  let disk = null;
  try {
    const stat = fs.statfsSync(process.cwd());
    const blockSize = Number(stat.bsize || stat.blksize || 0);
    const totalBlocks = Number(stat.blocks || 0);
    const availableBlocks = Number(stat.bavail ?? stat.bfree ?? 0);
    const totalBytes = blockSize * totalBlocks;
    const freeBytes = blockSize * availableBlocks;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    disk = {
      path: process.cwd(),
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: bytesToPercent(usedBytes, totalBytes),
    };
  } catch {
    disk = null;
  }

  const temperature = readSystemTemperature();
  const loadAverage = os.loadavg().map((value) => Math.round(value * 100) / 100);
  const memoryUsedPercent = bytesToPercent(usedMemoryBytes, totalMemoryBytes);
  const processHeapPercent = bytesToPercent(processMemory.heapUsed, processMemory.heapTotal);
  const status = (
    (disk?.usedPercent !== null && disk?.usedPercent !== undefined && disk.usedPercent >= 90)
    || (temperature.celsius !== null && temperature.celsius >= 80)
    || (memoryUsedPercent !== null && memoryUsedPercent >= 90)
  ) ? 'warning' : 'ok';

  return {
    status,
    platform: detectDeploymentPlatform(),
    hostname: os.hostname(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    uptimeHuman: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    loadAverage,
    memory: {
      totalBytes: totalMemoryBytes,
      freeBytes: freeMemoryBytes,
      usedBytes: usedMemoryBytes,
      usedPercent: memoryUsedPercent,
      processRssBytes: processMemory.rss,
      processHeapUsedBytes: processMemory.heapUsed,
      processHeapTotalBytes: processMemory.heapTotal,
      processExternalBytes: processMemory.external,
      processArrayBuffersBytes: processMemory.arrayBuffers,
      processHeapPercent,
    },
    disk,
    temperature,
  };
};

const getActionPermissions = async () => {
  const config = await getSystemConfig();
  const permissions = sanitizeActionRoleAccess(config.actionRoleAccess || {});
  const emailPermissions = sanitizeActionEmailAccess(config.actionEmailAccess || {});
  const missingRoleKeys = ACTION_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.actionRoleAccess || {}, key));
  const missingEmailKeys = ACTION_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.actionEmailAccess || {}, key));
  if (missingRoleKeys.length || missingEmailKeys.length) {
    const nextActionRoleAccess = { ...(config.actionRoleAccess || {}), ...permissions };
    const nextActionEmailAccess = { ...(config.actionEmailAccess || {}), ...emailPermissions };
    const refreshed = await persistSystemConfigFields(config, {
      actionRoleAccess: nextActionRoleAccess,
      actionEmailAccess: nextActionEmailAccess,
    }, config.updatedBy || config.lastUpdatedBy || '', 'action_permissions_backfill');
    return { config: refreshed, permissions: sanitizeActionRoleAccess(refreshed.actionRoleAccess || {}), emailPermissions: sanitizeActionEmailAccess(refreshed.actionEmailAccess || {}) };
  }
  return { config, permissions, emailPermissions };
};

const buildPagePermissionsPayload = async (config) => {
  const permissions = sanitizePageRoleAccess(config.pageRoleAccess || {});
  const excludePermissions = sanitizePageExcludeRoleAccess(config.pageRoleExcludeAccess || {});
  const emailPermissions = sanitizePageEmailAccess(config.pageEmailAccess || {});
  const missingRoleKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageRoleAccess || {}, key));
  const missingExcludeKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageRoleExcludeAccess || {}, key));
  const missingEmailKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageEmailAccess || {}, key));

  if (missingRoleKeys.length || missingExcludeKeys.length || missingEmailKeys.length) {
    const refreshed = await persistSystemConfigFields(config, {
      pageRoleAccess: { ...(config.pageRoleAccess || {}), ...permissions },
      pageRoleExcludeAccess: { ...(config.pageRoleExcludeAccess || {}), ...excludePermissions },
      pageEmailAccess: { ...(config.pageEmailAccess || {}), ...emailPermissions },
    }, config.updatedBy || config.lastUpdatedBy || '', 'navigation_permissions_backfill');
    return {
      config: refreshed,
      permissions: sanitizePageRoleAccess(refreshed.pageRoleAccess || {}),
      excludePermissions: sanitizePageExcludeRoleAccess(refreshed.pageRoleExcludeAccess || {}),
      emailPermissions: sanitizePageEmailAccess(refreshed.pageEmailAccess || {}),
    };
  }

  return { config, permissions, excludePermissions, emailPermissions };
};

const buildActionPermissionsPayload = async (config) => {
  const permissions = sanitizeActionRoleAccess(config.actionRoleAccess || {});
  const emailPermissions = sanitizeActionEmailAccess(config.actionEmailAccess || {});
  const missingRoleKeys = ACTION_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.actionRoleAccess || {}, key));
  const missingEmailKeys = ACTION_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.actionEmailAccess || {}, key));

  if (missingRoleKeys.length || missingEmailKeys.length) {
    const refreshed = await persistSystemConfigFields(config, {
      actionRoleAccess: { ...(config.actionRoleAccess || {}), ...permissions },
      actionEmailAccess: { ...(config.actionEmailAccess || {}), ...emailPermissions },
    }, config.updatedBy || config.lastUpdatedBy || '', 'action_permissions_backfill');
    return {
      config: refreshed,
      permissions: sanitizeActionRoleAccess(refreshed.actionRoleAccess || {}),
      emailPermissions: sanitizeActionEmailAccess(refreshed.actionEmailAccess || {}),
    };
  }

  return { config, permissions, emailPermissions };
};

const buildGraphConfigPayload = (config) => ({
  success: true,
  shareLink: config.shareLink || '',
  driveId: config.driveId || '',
  fileId: config.fileId || '',
  worksheetName: config.worksheetName || '',
  dataRange: config.dataRange || '',
  headerRowOffset: Number(config.headerRowOffset || 0),
  syncIntervalMinutes: config.syncIntervalMinutes || 10,
  fieldMapping: config.fieldMapping || {},
  lastResolvedAt: config.lastResolvedAt || null,
  lastSyncAt: config.lastSyncAt || null,
});

const buildGraphAuthStatusPayload = (config) => ({
  success: true,
  authMode: config.graphAuthMode || 'application',
  accountUsername: config.graphAccountUsername || '',
  hasRefreshToken: Boolean(config.graphRefreshTokenEnc),
  tokenUpdatedAt: config.graphTokenUpdatedAt || null,
});

const buildTelecastConfigPayload = (config) => {
  const groupRecipients = {
    GES: normalizeEmailList(config?.telecastGroupRecipients?.GES || []),
    GDS: normalizeEmailList(config?.telecastGroupRecipients?.GDS || []),
    GTS: normalizeEmailList(config?.telecastGroupRecipients?.GTS || []),
  };
  return {
    success: true,
    templateSubject: config.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}',
    templateBody: config.telecastTemplateBody || '',
    templateStyle: getTelecastTemplateStyle(config.telecastTemplateStyle).key,
    approvalAlertEnabled: Boolean(config.approvalAlertEnabled),
    approvalTemplateSubject: config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}',
    approvalTemplateBody: config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.',
    approvalTemplateStyle: getTelecastTemplateStyle(config.approvalAlertTemplateStyle).key,
    deadlineAlertEnabled: Boolean(config.deadlineAlertEnabled),
    deadlineTemplateSubject: config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}',
    deadlineTemplateBody: config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.',
    deadlineTemplateStyle: getTelecastTemplateStyle(config.deadlineAlertTemplateStyle).key,
    deadlineAlertClients: Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [],
    telecastSendDelayMinutes: Number.isFinite(Number(config.telecastSendDelayMinutes))
      ? Number(config.telecastSendDelayMinutes)
      : 10,
    templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
      key: style.key,
      label: style.label,
      description: style.description,
      colors: style.colors,
    })),
    groupRecipients,
    keywords: TELECAST_TEMPLATE_KEYWORDS,
    weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
  };
};

const buildReportingConfigPayload = (config) => ({
  success: true,
  templateStyle: getTelecastTemplateStyle(config.issueReportTemplateStyle).key,
  templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
    key: style.key,
    label: style.label,
    description: style.description,
    colors: style.colors,
  })),
});

const buildExportTemplatePayload = (config) => {
  const payload = {
    sheetName: config.exportTemplateSheetName,
    title: config.exportTemplateTitle,
    introText: config.exportTemplateIntroText,
    showLogo: config.exportTemplateShowLogo,
    logoDataUrl: config.exportTemplateLogoDataUrl,
    logoRow: config.exportTemplateLogoRow,
    logoColumn: config.exportTemplateLogoColumn,
    logoWidth: config.exportTemplateLogoWidth,
    logoHeight: config.exportTemplateLogoHeight,
    titleRow: config.exportTemplateTitleRow,
    titleColumn: config.exportTemplateTitleColumn,
    titleRowSpan: config.exportTemplateTitleRowSpan,
    titleColumnSpan: config.exportTemplateTitleColumnSpan,
    titleHorizontalAlign: config.exportTemplateTitleHorizontalAlign,
    titleVerticalAlign: config.exportTemplateTitleVerticalAlign,
    introRow: config.exportTemplateIntroRow,
    introColumn: config.exportTemplateIntroColumn,
    introRowSpan: config.exportTemplateIntroRowSpan,
    introColumnSpan: config.exportTemplateIntroColumnSpan,
    introHorizontalAlign: config.exportTemplateIntroHorizontalAlign,
    introVerticalAlign: config.exportTemplateIntroVerticalAlign,
    headerRow: config.exportTemplateHeaderRow,
    headerColumn: config.exportTemplateHeaderColumn,
    headerHorizontalAlign: config.exportTemplateHeaderHorizontalAlign,
    headerVerticalAlign: config.exportTemplateHeaderVerticalAlign,
    headerBackgroundColor: config.exportTemplateHeaderBackgroundColor,
    headerTextColor: config.exportTemplateHeaderTextColor,
    titleColor: config.exportTemplateTitleColor,
    introColor: config.exportTemplateIntroColor,
    columnWidths: config.exportTemplateColumnWidths,
    rowHeights: config.exportTemplateRowHeights,
  };
  return {
    success: true,
    ...payload,
    exportTemplateSheetName: payload.sheetName,
    exportTemplateTitle: payload.title,
    exportTemplateIntroText: payload.introText,
    exportTemplateShowLogo: payload.showLogo,
    exportTemplateLogoDataUrl: payload.logoDataUrl,
    exportTemplateLogoRow: payload.logoRow,
    exportTemplateLogoColumn: payload.logoColumn,
    exportTemplateLogoWidth: payload.logoWidth,
    exportTemplateLogoHeight: payload.logoHeight,
    exportTemplateTitleRow: payload.titleRow,
    exportTemplateTitleColumn: payload.titleColumn,
    exportTemplateTitleRowSpan: payload.titleRowSpan,
    exportTemplateTitleColumnSpan: payload.titleColumnSpan,
    exportTemplateTitleHorizontalAlign: payload.titleHorizontalAlign,
    exportTemplateTitleVerticalAlign: payload.titleVerticalAlign,
    exportTemplateIntroRow: payload.introRow,
    exportTemplateIntroColumn: payload.introColumn,
    exportTemplateIntroRowSpan: payload.introRowSpan,
    exportTemplateIntroColumnSpan: payload.introColumnSpan,
    exportTemplateIntroHorizontalAlign: payload.introHorizontalAlign,
    exportTemplateIntroVerticalAlign: payload.introVerticalAlign,
    exportTemplateHeaderRow: payload.headerRow,
    exportTemplateHeaderColumn: payload.headerColumn,
    exportTemplateHeaderHorizontalAlign: payload.headerHorizontalAlign,
    exportTemplateHeaderVerticalAlign: payload.headerVerticalAlign,
    exportTemplateHeaderBackgroundColor: payload.headerBackgroundColor,
    exportTemplateHeaderTextColor: payload.headerTextColor,
    exportTemplateTitleColor: payload.titleColor,
    exportTemplateIntroColor: payload.introColor,
    exportTemplateColumnWidths: payload.columnWidths,
    exportTemplateRowHeights: payload.rowHeights,
  };
};

const buildNotificationStatusPayload = async (config) => {
  const [alertedTracked, alertedKeysTracked, alertedPreviewRows] = await Promise.all([
    SyncedOpportunity.countDocuments({ telecastAlerted: true }),
    SyncedOpportunity.distinct('telecastAlertedKey', { telecastAlerted: true, telecastAlertedKey: { $ne: '' } }),
    SyncedOpportunity.find(
      { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } },
      { telecastAlertedRefNo: 1, telecastAlertedAt: 1 }
    ).sort({ telecastAlertedAt: -1 }).limit(50).lean(),
  ]);
  const alertedRefNosPreview = alertedPreviewRows
    .map((row) => normalizeRefNo(row?.telecastAlertedRefNo || ''))
    .filter(Boolean);

  return {
    success: true,
    lastCheckedAt: config.notificationLastCheckedAt || null,
    lastNewRowsCount: Number(config.notificationLastNewRowsCount || 0),
    lastNewRows: Array.isArray(config.notificationLastNewRows) ? config.notificationLastNewRows : [],
    lastNewRowsPreview: Array.isArray(config.notificationLastNewRowsPreview) ? config.notificationLastNewRowsPreview : [],
    trackedRows: Array.isArray(config.notificationRowSignatures) ? config.notificationRowSignatures.length : 0,
    alertWindowDays: TELECAST_RECENT_WINDOW_DAYS,
    alertSeededAt: config.telecastAlertSeededAt || null,
    alertSeededCount: Number(config.telecastAlertSeededCount || 0),
    alertedKeysTracked: alertedKeysTracked.length,
    alertedRefNosTracked: alertedTracked,
    alertedRefNosPreview,
    telecastEligibleRowsPreview: Array.isArray(config.telecastLastEligibleRowsPreview) ? config.telecastLastEligibleRowsPreview : [],
    weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
  };
};

const buildCollectionStats = async () => {
  const [result] = await SyncedOpportunity.aggregate([
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalTenders: { $sum: 1 },
              totalValue: { $sum: { $ifNull: ['$opportunityValue', 0] } },
              lastSync: { $max: '$syncedAt' },
            },
          },
        ],
        statusDistribution: [
          {
            $group: {
              _id: { $ifNull: ['$avenirStatus', 'UNKNOWN'] },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const summary = Array.isArray(result?.summary) && result.summary.length ? result.summary[0] : {};
  const statusDistribution = Array.isArray(result?.statusDistribution)
    ? result.statusDistribution.reduce((acc, entry) => {
        acc[String(entry?._id || 'UNKNOWN')] = Number(entry?.count || 0);
        return acc;
      }, {})
    : {};

  return {
    totalTenders: Number(summary?.totalTenders || 0),
    totalValue: Number(summary?.totalValue || 0),
    lastSync: summary?.lastSync || null,
    statusDistribution,
  };
};

const requireActionPermission = async (req, res, actionKey) => {
  // Master short-circuits before any DB call — they are always allowed.
  if (String(req.user?.role || '') === 'Master') {
    return systemConfigCache.value || await getSystemConfig();
  }
  const { config, permissions, emailPermissions } = await getActionPermissions();
  const allowedRoles = permissions[actionKey] || [];
  const allowedEmails = emailPermissions[actionKey] || [];
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  if (!allowedRoles.includes(req.user.role) && !allowedEmails.includes(userEmail)) {
    res.status(403).json({ error: `Role ${req.user.role} is not allowed to perform ${actionKey}` });
    return null;
  }
  return config;
};

const requirePagePermission = async (req, res, pageKey) => {
  // TempAccess users: check their personal allowedPages list
  if (req.user?.isTempAccess) {
    const allowed = Array.isArray(req.user.allowedPages) ? req.user.allowedPages : [];
    if (!allowed.includes(pageKey)) {
      res.status(403).json({ error: `Temporary access does not include page: ${pageKey}` });
      return null;
    }
    return {}; // allowed — return truthy config placeholder
  }

  const config = await getSystemConfig();
  const permissions = sanitizePageRoleAccess(config.pageRoleAccess || {});
  const excludePermissions = sanitizePageExcludeRoleAccess(config.pageRoleExcludeAccess || {});
  const emailPermissions = sanitizePageEmailAccess(config.pageEmailAccess || {});
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  const allowedRoles = permissions[pageKey] || [];
  const excludedRoles = excludePermissions[pageKey] || [];
  const allowedEmails = emailPermissions[pageKey] || [];

  if (String(req.user?.role || '') === 'Master') {
    return config;
  }

  if (allowedEmails.includes(userEmail)) {
    return config;
  }

  if (!allowedRoles.includes(req.user.role) || excludedRoles.includes(req.user.role)) {
    res.status(403).json({ error: `Role ${req.user.role} is not allowed to access ${pageKey}` });
    return null;
  }

  return config;
};

const PAGE_EDIT_ACTION_MAP = {
  opportunities: ['opportunities_write', 'opportunities_sync', 'opportunities_sheet_upload', 'manual_opportunity_updates_write'],
  bid_decision: ['bid_decision_manage'],
  pq_activities: ['pq_activities_manage'],
  vendor_directory: ['vendors_write', 'vendors_import'],
  clients: ['clients_write', 'clients_import', 'clients_seed'],
  bd_engagements: ['bd_engagements_write'],
  tender_updates: ['opportunities_write'],
  dashboard: [],
  analytics: [],
  master: ['users_manage', 'navigation_permissions_write', 'graph_config_write', 'graph_auth_write',
    'telecast_config_write', 'telecast_auth_write', 'export_template_write',
    'notification_alert_flags_write', 'lead_email_manage', 'logs_cleanup'],
  master_general: ['users_manage'],
  master_users: ['users_manage'],
  master_data_sync: ['graph_config_write', 'graph_auth_write'],
  master_telecast: ['telecast_config_write', 'telecast_auth_write'],
  master_update: ['export_template_write'],
  master_export: ['export_template_write'],
};

const migratePermissionsV2 = async (config) => {
  const existingView = config.pageViewAccess || {};
  if (Object.keys(existingView).length > 0) return;

  const pageView = sanitizePageRoleAccess(config.pageRoleAccess || {});
  const actionPerms = sanitizeActionRoleAccess(config.actionRoleAccess || {});

  const pageEdit = {};
  for (const pageKey of PAGE_KEYS) {
    const actionKeys = PAGE_EDIT_ACTION_MAP[pageKey] || [];
    if (!actionKeys.length) {
      pageEdit[pageKey] = [];
      continue;
    }
    const roleSets = actionKeys.map((ak) => new Set(actionPerms[ak] || []));
    if (!roleSets.length) { pageEdit[pageKey] = []; continue; }
    const intersection = ROLE_KEYS.filter((r) => roleSets.every((s) => s.has(r)));
    pageEdit[pageKey] = intersection;
  }

  await persistSystemConfigFields(config, {
    pageViewAccess: pageView,
    pageEditAccess: pageEdit,
    userPageOverrides: [],
  }, 'system_migration', 'permissions_v2_migration');
};

const getPermissionsV2 = async () => {
  const config = await getSystemConfig();
  if (!config.pageViewAccess || Object.keys(config.pageViewAccess).length === 0) {
    await migratePermissionsV2(config);
    return getSystemConfig({ force: true });
  }
  return config;
};

const requirePageView = async (req, res, pageKey) => {
  const config = await getPermissionsV2();
  if (String(req.user?.role || '') === 'Master') return config;
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  const viewRoles = (config.pageViewAccess || {})[pageKey] || [];
  const overrides = Array.isArray(config.userPageOverrides) ? config.userPageOverrides : [];
  const override = overrides.find((o) => String(o.email || '').trim().toLowerCase() === userEmail && o.pageKey === pageKey);
  if (override) return config;
  if (!viewRoles.includes(req.user?.role)) {
    res.status(403).json({ error: `Role ${req.user.role} is not allowed to view ${pageKey}` });
    return null;
  }
  return config;
};

const requirePageEdit = async (req, res, pageKey) => {
  const config = await getPermissionsV2();
  if (String(req.user?.role || '') === 'Master') return config;
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  const viewRoles = (config.pageViewAccess || {})[pageKey] || [];
  const editRoles = (config.pageEditAccess || {})[pageKey] || [];
  const overrides = Array.isArray(config.userPageOverrides) ? config.userPageOverrides : [];
  const override = overrides.find((o) => String(o.email || '').trim().toLowerCase() === userEmail && o.pageKey === pageKey);
  if (override?.access === 'edit') return config;
  if (!viewRoles.includes(req.user?.role)) {
    res.status(403).json({ error: `Role ${req.user.role} is not allowed to view ${pageKey}` });
    return null;
  }
  if (!editRoles.includes(req.user?.role)) {
    res.status(403).json({ error: `Role ${req.user.role} does not have edit access for ${pageKey}` });
    return null;
  }
  return config;
};


const refreshSystemConfigAlertTrackingFromSyncedOpportunities = async (config, updatedBy = '') => {
  const [keys, refs] = await Promise.all([
    SyncedOpportunity.distinct('telecastAlertedKey', { telecastAlerted: true, telecastAlertedKey: { $ne: '' } }),
    SyncedOpportunity.distinct('telecastAlertedRefNo', { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } }),
  ]);

  const updated = await persistSystemConfigFields(config, {
    telecastAlertedKeys: keys.slice(-MAX_ALERTED_TRACKED_KEYS),
    telecastAlertedRefNos: refs.map((ref) => normalizeRefNo(ref)).filter(Boolean).slice(-MAX_ALERTED_TRACKED_REFS),
  }, updatedBy || config.updatedBy || config.lastUpdatedBy || '', 'telecast_alert_tracking_refresh');
  return updated;
};


app.get('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getSystemConfig();
    const permissions = sanitizePageRoleAccess(config.pageRoleAccess || {});
    const excludePermissions = sanitizePageExcludeRoleAccess(config.pageRoleExcludeAccess || {});
    const emailPermissions = sanitizePageEmailAccess(config.pageEmailAccess || {});
    const missingRoleKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageRoleAccess || {}, key));
    const missingExcludeKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageRoleExcludeAccess || {}, key));
    const missingEmailKeys = PAGE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(config.pageEmailAccess || {}, key));
    if (missingRoleKeys.length || missingExcludeKeys.length || missingEmailKeys.length) {
      const refreshed = await persistSystemConfigFields(config, {
        pageRoleAccess: { ...(config.pageRoleAccess || {}), ...permissions },
        pageRoleExcludeAccess: { ...(config.pageRoleExcludeAccess || {}), ...excludePermissions },
        pageEmailAccess: { ...(config.pageEmailAccess || {}), ...emailPermissions },
      }, config.updatedBy || config.lastUpdatedBy || '', 'navigation_permissions_backfill');
      const meta = addConfigMetaHeaders(res, refreshed);
      return res.json({ success: true, permissions: sanitizePageRoleAccess(refreshed.pageRoleAccess || {}), excludePermissions: sanitizePageExcludeRoleAccess(refreshed.pageRoleExcludeAccess || {}), emailPermissions: sanitizePageEmailAccess(refreshed.pageEmailAccess || {}), ...meta });
    }
    const meta = addConfigMetaHeaders(res, config);
    res.json({ success: true, permissions, excludePermissions, emailPermissions, ...meta });
  } catch (error) {
    return handleApiError(res, error, 'navigation.permissions.get');
  }
});

app.post('/api/navigation/permissions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'navigation_permissions_write')) return;

    const unknownKeys = [
      ...getUnknownPermissionKeys(req.body?.permissions || {}, PAGE_KEYS),
      ...getUnknownPermissionKeys(req.body?.excludePermissions || {}, PAGE_KEYS),
      ...getUnknownPermissionKeys(req.body?.emailPermissions || {}, PAGE_KEYS),
    ];
    if (unknownKeys.length) {
      return res.status(400).json({ error: 'Unknown permission keys', unknownKeys, serverKeys: PAGE_KEYS });
    }
    const permissions = sanitizePageRoleAccess(req.body?.permissions || {});
    const excludePermissions = sanitizePageExcludeRoleAccess(req.body?.excludePermissions || {});
    const emailPermissions = sanitizePageEmailAccess(req.body?.emailPermissions || {});
    const config = await getSystemConfig({ force: true });
    const beforeHashes = {
      pageRoleAccess: hashJson(config.pageRoleAccess || {}),
      pageRoleExcludeAccess: hashJson(config.pageRoleExcludeAccess || {}),
      pageEmailAccess: hashJson(config.pageEmailAccess || {}),
    };

    const updated = await persistSystemConfigFields(config, {
      pageRoleAccess: permissions,
      pageRoleExcludeAccess: excludePermissions,
      pageEmailAccess: emailPermissions,
    }, req.user.email, 'navigation_permissions_write');

    console.log(JSON.stringify({
      tag: 'ADMIN_CONFIG_SAVE',
      ts: new Date().toISOString(),
      actor: req.user.email,
      endpoint: '/api/navigation/permissions',
      before: beforeHashes,
      after: {
        pageRoleAccess: hashJson(updated?.pageRoleAccess || {}),
        pageRoleExcludeAccess: hashJson(updated?.pageRoleExcludeAccess || {}),
        pageEmailAccess: hashJson(updated?.pageEmailAccess || {}),
      },
    }));

    const meta = addConfigMetaHeaders(res, updated);
    res.json({ success: true, permissions, excludePermissions, emailPermissions, ...meta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/permissions/bootstrap', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getSystemConfig();
    const [pagePermissionsResult, actionPermissionsResult] = await Promise.allSettled([
      buildPagePermissionsPayload(config),
      buildActionPermissionsPayload(config),
    ]);

    const response = {
      success: true,
      pagePermissions: pagePermissionsResult.status === 'fulfilled' ? pagePermissionsResult.value.permissions : null,
      pageExcludePermissions: pagePermissionsResult.status === 'fulfilled' ? pagePermissionsResult.value.excludePermissions : null,
      pageEmailPermissions: pagePermissionsResult.status === 'fulfilled' ? pagePermissionsResult.value.emailPermissions : null,
      actionPermissions: actionPermissionsResult.status === 'fulfilled' ? actionPermissionsResult.value.permissions : null,
      actionEmailPermissions: actionPermissionsResult.status === 'fulfilled' ? actionPermissionsResult.value.emailPermissions : null,
    };

    const errors = [
      ['pagePermissions', pagePermissionsResult],
      ['actionPermissions', actionPermissionsResult],
    ].flatMap(([key, result]) => (result.status === 'fulfilled'
      ? []
      : [{ key, message: result.reason?.message || String(result.reason || 'Unknown error') }]));

    res.json({
      ...response,
      errors,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load permissions bootstrap data' });
  }
});

app.get('/api/action-permissions', verifyToken, async (_req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const { permissions, emailPermissions } = await getActionPermissions();
    const config = await getSystemConfig();
    const meta = addConfigMetaHeaders(res, config);
    res.json({ success: true, permissions, emailPermissions, ...meta });
  } catch (error) {
    return handleApiError(res, error, 'action-permissions.get');
  }
});

app.post('/api/action-permissions', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'navigation_permissions_write')) return;

    const unknownKeys = [
      ...getUnknownPermissionKeys(req.body?.permissions || {}, ACTION_KEYS),
      ...getUnknownPermissionKeys(req.body?.emailPermissions || {}, ACTION_KEYS),
    ];
    if (unknownKeys.length) {
      return res.status(400).json({ error: 'Unknown permission keys', unknownKeys, serverKeys: ACTION_KEYS });
    }
    const permissions = sanitizeActionRoleAccess(req.body?.permissions || {});
    const emailPermissions = sanitizeActionEmailAccess(req.body?.emailPermissions || {});
    const config = await getSystemConfig({ force: true });
    const beforeHashes = {
      actionRoleAccess: hashJson(config.actionRoleAccess || {}),
      actionEmailAccess: hashJson(config.actionEmailAccess || {}),
    };

    const updated = await persistSystemConfigFields(config, {
      actionRoleAccess: permissions,
      actionEmailAccess: emailPermissions,
    }, req.user.email, 'action_permissions_write');

    console.log(JSON.stringify({
      tag: 'ADMIN_CONFIG_SAVE',
      ts: new Date().toISOString(),
      actor: req.user.email,
      endpoint: '/api/action-permissions',
      before: beforeHashes,
      after: {
        actionRoleAccess: hashJson(updated?.actionRoleAccess || {}),
        actionEmailAccess: hashJson(updated?.actionEmailAccess || {}),
      },
    }));

    const meta = addConfigMetaHeaders(res, updated);
    res.json({ success: true, permissions, emailPermissions, ...meta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/permissions/v2', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getPermissionsV2();
    const pageViewAccess = {};
    const pageEditAccess = {};
    for (const key of PAGE_KEYS) {
      pageViewAccess[key] = (config.pageViewAccess || {})[key] || [];
      pageEditAccess[key] = (config.pageEditAccess || {})[key] || [];
    }
    res.json({
      success: true,
      pageViewAccess,
      pageEditAccess,
      userPageOverrides: Array.isArray(config.userPageOverrides) ? config.userPageOverrides : [],
      pageEditActionMap: PAGE_EDIT_ACTION_MAP,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/permissions/v2', verifyToken, async (req, res) => {
  try {
    if (req.user?.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can update permissions' });
    }
    const { pageViewAccess, pageEditAccess, userPageOverrides } = req.body || {};

    const sanitizedView = {};
    const sanitizedEdit = {};
    for (const key of PAGE_KEYS) {
      const viewRoles = Array.isArray(pageViewAccess?.[key]) ? pageViewAccess[key].filter((r) => ROLE_KEYS.includes(r)) : [];
      const editRoles = Array.isArray(pageEditAccess?.[key]) ? pageEditAccess[key].filter((r) => ROLE_KEYS.includes(r) && viewRoles.includes(r)) : [];
      sanitizedView[key] = viewRoles;
      sanitizedEdit[key] = editRoles;
    }

    const sanitizedOverrides = Array.isArray(userPageOverrides)
      ? userPageOverrides.filter((o) => o?.email && o?.pageKey && PAGE_KEYS.includes(o.pageKey) && ['view', 'edit'].includes(o.access))
          .map((o) => ({ email: String(o.email).trim().toLowerCase(), pageKey: o.pageKey, access: o.access }))
      : [];

    const config = await getSystemConfig();
    const updated = await persistSystemConfigFields(config, {
      pageViewAccess: sanitizedView,
      pageEditAccess: sanitizedEdit,
      userPageOverrides: sanitizedOverrides,
      pageRoleAccess: sanitizedView,
    }, req.user.email, 'permissions_v2_save');

    res.json({
      success: true,
      pageViewAccess: updated.pageViewAccess || {},
      pageEditAccess: updated.pageEditAccess || {},
      userPageOverrides: updated.userPageOverrides || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/permissions/v2/override', verifyToken, async (req, res) => {
  try {
    if (req.user?.role !== 'Master') {
      return res.status(403).json({ error: 'Only Master users can manage overrides' });
    }
    const { email, pageKey, access, remove } = req.body || {};
    if (!email || !pageKey || !PAGE_KEYS.includes(pageKey)) {
      return res.status(400).json({ error: 'Invalid override payload' });
    }
    const config = await getPermissionsV2();
    const overrides = Array.isArray(config.userPageOverrides) ? [...config.userPageOverrides] : [];
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingIdx = overrides.findIndex((o) => String(o.email || '').trim().toLowerCase() === normalizedEmail && o.pageKey === pageKey);

    if (remove) {
      if (existingIdx !== -1) overrides.splice(existingIdx, 1);
    } else {
      if (!['view', 'edit'].includes(access)) return res.status(400).json({ error: 'access must be view or edit' });
      const viewRoles = (config.pageViewAccess || {})[pageKey] || [];
      const userRecord = await AuthorizedUser.findOne({ email: normalizedEmail }).lean();
      if (userRecord && !viewRoles.includes(userRecord.role) && userRecord.role !== 'Master') {
        return res.status(400).json({ error: 'User role does not have view access; grant role-level view first' });
      }
      if (existingIdx !== -1) overrides[existingIdx] = { email: normalizedEmail, pageKey, access };
      else overrides.push({ email: normalizedEmail, pageKey, access });
    }

    const updated = await persistSystemConfigFields(config, { userPageOverrides: overrides }, req.user.email, 'permissions_v2_override');
    res.json({ success: true, userPageOverrides: updated.userPageOverrides || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/bootstrap', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!(req.user?.role === 'Master' || req.user?.role === 'Admin')) {
      return res.status(403).json({ error: 'Only Master/Admin can load admin bootstrap data' });
    }

    const [systemConfig, graphConfig, users, collectionStats] = await Promise.all([
      getSystemConfig(),
      getGraphConfig(),
      AuthorizedUser.find().sort({ createdAt: -1 }).lean(),
      buildCollectionStats(),
    ]);

    const [pagePermissionsResult, actionPermissionsResult, worksheetsResult, notificationStatusResult] = await Promise.allSettled([
      buildPagePermissionsPayload(systemConfig),
      buildActionPermissionsPayload(systemConfig),
      (graphConfig.driveId && graphConfig.fileId)
        ? getWorksheets({ driveId: graphConfig.driveId, fileId: graphConfig.fileId, config: graphConfig })
        : Promise.resolve([]),
      buildNotificationStatusPayload(systemConfig),
    ]);

    const bootstrap = {
      success: true,
      backendHealth: {
        ok: mongoose.connection.readyState === 1,
        dbState: mongoose.connection.readyState,
        system: getSystemHealthSnapshot(),
        timestamp: new Date().toISOString(),
      },
      users: users.map(mapIdField),
      collectionStats,
      graphConfig: buildGraphConfigPayload(graphConfig),
      graphAuthStatus: buildGraphAuthStatusPayload(graphConfig),
      consentUrl: buildDelegatedConsentUrl({}),
      postBidConfig: {
        success: true,
        allowedEmails: Array.isArray(systemConfig.postBidAllowedEmails) ? systemConfig.postBidAllowedEmails : [],
        canEdit: ['Master', 'Admin'].includes(String(req.user?.role || '')) || (Array.isArray(systemConfig.postBidAllowedEmails)
          ? systemConfig.postBidAllowedEmails.map((email) => String(email || '').trim().toLowerCase()).includes(String(req.user?.email || '').trim().toLowerCase())
          : false),
      },
      telecastConfig: buildTelecastConfigPayload(systemConfig),
      eoiDuplicateConfig: {
        success: true,
        showConvertedEoiRowsDefault: Boolean(systemConfig.showConvertedEoiRowsDefault),
      },
      reportingConfig: buildReportingConfigPayload(systemConfig),
      exportTemplateConfig: buildExportTemplatePayload(systemConfig),
      navigationPermissions: pagePermissionsResult.status === 'fulfilled'
        ? {
            permissions: pagePermissionsResult.value.permissions,
            excludePermissions: pagePermissionsResult.value.excludePermissions,
            emailPermissions: pagePermissionsResult.value.emailPermissions,
          }
        : null,
      actionPermissions: actionPermissionsResult.status === 'fulfilled'
        ? {
            permissions: actionPermissionsResult.value.permissions,
            emailPermissions: actionPermissionsResult.value.emailPermissions,
          }
        : null,
      worksheets: worksheetsResult.status === 'fulfilled' ? worksheetsResult.value : [],
      notificationStatus: notificationStatusResult.status === 'fulfilled' ? notificationStatusResult.value : null,
    };

    const errors = [
      ['navigationPermissions', pagePermissionsResult],
      ['actionPermissions', actionPermissionsResult],
      ['worksheets', worksheetsResult],
      ['notificationStatus', notificationStatusResult],
    ].flatMap(([key, result]) => (result.status === 'fulfilled'
      ? []
      : [{ key, message: result.reason?.message || String(result.reason || 'Unknown error') }]));

    res.json({
      ...bootstrap,
      errors,
    });
  } catch (error) {
    return handleApiError(res, error, 'admin.bootstrap.get');
  }
});


// ── EOI Duplicate Config ─────────────────────────────────────────────────────

app.get('/api/eoi-duplicates/config', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getSystemConfig();
    res.set('x-system-config-version', String(config.updatedAt?.getTime?.() || Date.now()));
    res.json({ success: true, showConvertedEoiRowsDefault: Boolean(config.showConvertedEoiRowsDefault) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to load EOI config' });
  }
});

app.post('/api/eoi-duplicates/config', verifyToken, express.json(), async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getSystemConfig();
    await persistSystemConfigFields(config, {
      showConvertedEoiRowsDefault: Boolean(req.body?.showConvertedEoiRowsDefault),
      lastUpdatedBy: String(req.user?.email || ''),
    });
    res.json({ success: true, showConvertedEoiRowsDefault: Boolean(req.body?.showConvertedEoiRowsDefault) });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Failed to save EOI config' });
  }
});

app.get('/api/telecast/config', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view telecast config' });
    }
    const config = await getSystemConfig();
    const groupRecipients = {
      GES: normalizeEmailList(config?.telecastGroupRecipients?.GES || []),
      GDS: normalizeEmailList(config?.telecastGroupRecipients?.GDS || []),
      GTS: normalizeEmailList(config?.telecastGroupRecipients?.GTS || []),
    };
    const meta = addConfigMetaHeaders(res, config);
    res.json({
      success: true,
      templateSubject: config.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}',
      templateBody: config.telecastTemplateBody || '',
      templateStyle: getTelecastTemplateStyle(config.telecastTemplateStyle).key,
      approvalAlertEnabled: Boolean(config.approvalAlertEnabled),
      approvalTemplateSubject: config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}',
      approvalTemplateBody: config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.',
      approvalTemplateStyle: getTelecastTemplateStyle(config.approvalAlertTemplateStyle).key,
      deadlineAlertEnabled: Boolean(config.deadlineAlertEnabled),
      deadlineTemplateSubject: config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}',
      deadlineTemplateBody: config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.',
      deadlineTemplateStyle: getTelecastTemplateStyle(config.deadlineAlertTemplateStyle).key,
      deadlineAlertClients: Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [],
      telecastSendDelayMinutes: Number.isFinite(Number(config.telecastSendDelayMinutes))
        ? Number(config.telecastSendDelayMinutes)
        : 10,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
      groupRecipients,
      keywords: TELECAST_TEMPLATE_KEYWORDS,
      weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
      // Award alert fields
      tlAssignAlertEnabled: Boolean(config.tlAssignAlertEnabled),
      tlAssignAlertTemplateSubject: config.tlAssignAlertTemplateSubject || '',
      tlAssignAlertTemplateBody: config.tlAssignAlertTemplateBody || '',
      tlAssignAlertTemplateStyle: getTelecastTemplateStyle(config.tlAssignAlertTemplateStyle).key,
      tlAssignAlertSeededAt: config.tlAssignAlertSeededAt || null,
      pmAssignAlertEnabled: Boolean(config.pmAssignAlertEnabled),
      pmAssignAlertTemplateSubject: config.pmAssignAlertTemplateSubject || '',
      pmAssignAlertTemplateBody: config.pmAssignAlertTemplateBody || '',
      pmAssignAlertTemplateStyle: getTelecastTemplateStyle(config.pmAssignAlertTemplateStyle).key,
      pmAssignAlertSeededAt: config.pmAssignAlertSeededAt || null,
      // Lead notif fields
      leadNotifEnabled: Boolean(config.leadNotifEnabled),
      leadNotifTrigger: config.leadNotifTrigger || 'new_row',
      leadNotifRecipients: Array.isArray(config.leadNotifRecipients) ? config.leadNotifRecipients : [],
      leadNotifTemplateSubject: config.leadNotifTemplateSubject || '',
      leadNotifTemplateBody: config.leadNotifTemplateBody || '',
      leadNotifTemplateStyle: getTelecastTemplateStyle(config.leadNotifTemplateStyle).key,
      leadNotifSeededAt: config.leadNotifSeededAt || null,
      topPerformerCardVisible: Boolean(config.topPerformerCardVisible),
      ...meta,
    });
  } catch (error) {
    return handleApiError(res, error, 'telecast.config.get');
  }
});

app.post('/api/telecast/config', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'telecast_config_write')) return;

    const templateSubject = String(req.body?.templateSubject || '').trim();
    const templateBody = String(req.body?.templateBody || '').trim();
    const templateStyle = getTelecastTemplateStyle(req.body?.templateStyle);
    const approvalAlertEnabled = Boolean(req.body?.approvalAlertEnabled);
    const approvalTemplateSubject = String(req.body?.approvalTemplateSubject || '').trim();
    const approvalTemplateBody = String(req.body?.approvalTemplateBody || '').trim();
    const approvalTemplateStyle = getTelecastTemplateStyle(req.body?.approvalTemplateStyle);
    const deadlineAlertEnabled = Boolean(req.body?.deadlineAlertEnabled);
    const deadlineTemplateSubject = String(req.body?.deadlineTemplateSubject || '').trim();
    const deadlineTemplateBody = String(req.body?.deadlineTemplateBody || '').trim();
    const deadlineTemplateStyle = getTelecastTemplateStyle(req.body?.deadlineTemplateStyle);
    const deadlineAlertClients = Array.isArray(req.body?.deadlineAlertClients)
      ? req.body.deadlineAlertClients.map((client) => String(client || '').trim()).filter(Boolean)
      : [];
    const telecastSendDelayMinutes = Math.max(0, Number(req.body?.telecastSendDelayMinutes) || 0);
    const groupRecipientsInput = req.body?.groupRecipients || {};
    const groupRecipients = {
      GES: normalizeEmailList(groupRecipientsInput.GES || []),
      GDS: normalizeEmailList(groupRecipientsInput.GDS || []),
      GTS: normalizeEmailList(groupRecipientsInput.GTS || []),
    };

    // New feature fields
    const tlAssignAlertEnabled = Boolean(req.body?.tlAssignAlertEnabled);
    const tlAssignAlertTemplateSubject = String(req.body?.tlAssignAlertTemplateSubject || '').trim();
    const tlAssignAlertTemplateBody = String(req.body?.tlAssignAlertTemplateBody || '').trim();
    const tlAssignAlertTemplateStyle = getTelecastTemplateStyle(req.body?.tlAssignAlertTemplateStyle);
    const pmAssignAlertEnabled = Boolean(req.body?.pmAssignAlertEnabled);
    const pmAssignAlertTemplateSubject = String(req.body?.pmAssignAlertTemplateSubject || '').trim();
    const pmAssignAlertTemplateBody = String(req.body?.pmAssignAlertTemplateBody || '').trim();
    const pmAssignAlertTemplateStyle = getTelecastTemplateStyle(req.body?.pmAssignAlertTemplateStyle);
    const leadNotifEnabled = Boolean(req.body?.leadNotifEnabled);
    const leadNotifTrigger = ['new_row', 'awarded', 'any_stage'].includes(req.body?.leadNotifTrigger) ? req.body.leadNotifTrigger : 'new_row';
    const leadNotifRecipients = Array.isArray(req.body?.leadNotifRecipients) ? req.body.leadNotifRecipients.map(e => String(e || '').trim().toLowerCase()).filter(Boolean) : [];
    const leadNotifTemplateSubject = String(req.body?.leadNotifTemplateSubject || '').trim();
    const leadNotifTemplateBody = String(req.body?.leadNotifTemplateBody || '').trim();
    const leadNotifTemplateStyle = getTelecastTemplateStyle(req.body?.leadNotifTemplateStyle);
    const topPerformerCardVisible = req.body?.topPerformerCardVisible !== undefined ? Boolean(req.body.topPerformerCardVisible) : undefined;

    const config = await getSystemConfig({ force: true });
    const extraFields = {
      tlAssignAlertEnabled,
      tlAssignAlertTemplateSubject: tlAssignAlertTemplateSubject || 'Action Required: TL Assignment for Awarded Tenders — {{GROUP}}',
      tlAssignAlertTemplateBody: tlAssignAlertTemplateBody || 'Please assign a Team Lead for the following newly awarded tenders in your vertical.',
      tlAssignAlertTemplateStyle: tlAssignAlertTemplateStyle.key,
      pmAssignAlertEnabled,
      pmAssignAlertTemplateSubject: pmAssignAlertTemplateSubject || 'Action Required: PM Assignment for Awarded Tenders — {{GROUP}}',
      pmAssignAlertTemplateBody: pmAssignAlertTemplateBody || 'Please assign a Project Manager for the following newly awarded tenders in your vertical.',
      pmAssignAlertTemplateStyle: pmAssignAlertTemplateStyle.key,
      leadNotifEnabled,
      leadNotifTrigger,
      leadNotifRecipients,
      leadNotifTemplateSubject: leadNotifTemplateSubject || 'Notification: New Tender — {{TENDER_NO}}',
      leadNotifTemplateBody: leadNotifTemplateBody || 'This is an automated notification for the following opportunity.',
      leadNotifTemplateStyle: leadNotifTemplateStyle.key,
    };
    if (topPerformerCardVisible !== undefined) extraFields.topPerformerCardVisible = topPerformerCardVisible;

    const updated = await persistSystemConfigFields(config, {
      telecastTemplateSubject: templateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}',
      telecastTemplateBody: templateBody || 'New row detected for {{TENDER_NO}}',
      telecastTemplateStyle: templateStyle.key,
      approvalAlertEnabled,
      approvalAlertTemplateSubject: approvalTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}',
      approvalAlertTemplateBody: approvalTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.',
      approvalAlertTemplateStyle: approvalTemplateStyle.key,
      deadlineAlertEnabled,
      deadlineAlertTemplateSubject: deadlineTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}',
      deadlineAlertTemplateBody: deadlineTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.',
      deadlineAlertTemplateStyle: deadlineTemplateStyle.key,
      deadlineAlertClients,
      telecastSendDelayMinutes: telecastSendDelayMinutes || 0,
      telecastGroupRecipients: groupRecipients,
      telecastKeywordHelp: TELECAST_TEMPLATE_KEYWORDS,
      ...extraFields,
    }, req.user.email, 'telecast_config_write');
    const meta = addConfigMetaHeaders(res, updated);

    res.json({
      success: true,
      templateSubject: updated.telecastTemplateSubject,
      templateBody: updated.telecastTemplateBody,
      templateStyle: updated.telecastTemplateStyle,
      approvalAlertEnabled: updated.approvalAlertEnabled,
      approvalTemplateSubject: updated.approvalAlertTemplateSubject,
      approvalTemplateBody: updated.approvalAlertTemplateBody,
      approvalTemplateStyle: updated.approvalAlertTemplateStyle,
      deadlineAlertEnabled: updated.deadlineAlertEnabled,
      deadlineTemplateSubject: updated.deadlineAlertTemplateSubject,
      deadlineTemplateBody: updated.deadlineAlertTemplateBody,
      deadlineTemplateStyle: updated.deadlineAlertTemplateStyle,
      deadlineAlertClients: updated.deadlineAlertClients || [],
      telecastSendDelayMinutes: updated.telecastSendDelayMinutes || 0,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
      groupRecipients,
      keywords: TELECAST_TEMPLATE_KEYWORDS,
      ...meta,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reporting/config', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view reporting config' });
    }
    const config = await getSystemConfig();
    const meta = addConfigMetaHeaders(res, config);
    res.json({
      success: true,
      templateStyle: getTelecastTemplateStyle(config.issueReportTemplateStyle).key,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
      ...meta,
    });
  } catch (error) {
    return handleApiError(res, error, 'reporting.config.get');
  }
});

app.post('/api/reporting/config', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'telecast_config_write')) return;

    const templateStyle = getTelecastTemplateStyle(req.body?.templateStyle);
    const config = await getSystemConfig({ force: true });
    const updated = await persistSystemConfigFields(config, {
      issueReportTemplateStyle: templateStyle.key,
    }, req.user.email, 'reporting_config_write');
    const meta = addConfigMetaHeaders(res, updated);

    res.json({
      success: true,
      templateStyle: updated.issueReportTemplateStyle,
      templateStyles: Object.values(TELECAST_TEMPLATE_STYLES).map((style) => ({
        key: style.key,
        label: style.label,
        description: style.description,
        colors: style.colors,
      })),
      ...meta,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const TELECAST_DEBUG = String(process.env.TELECAST_DEBUG || '').trim().toLowerCase() === 'true';
const telecastDebug = (...args) => {
  if (!TELECAST_DEBUG) return;
  // Avoid logging secrets/tokens by convention.
};

const graphEnvValue = (name, fallback = '') => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
};

// Telecast auth: Public-client ROPC using env vars only (matches the working Python script).
// Required env vars:
// - AZURE_TENANT_ID
// - AZURE_CLIENT_ID
// - TELECAST_ROPC_USERNAME
// - TELECAST_ROPC_PASSWORD
let _telecastRopcTokenCache = null;
const telecastTenantId = () => graphEnvValue('AZURE_TENANT_ID');
const telecastClientId = () => graphEnvValue('AZURE_CLIENT_ID');
const telecastRopcUsername = () => graphEnvValue('TELECAST_ROPC_USERNAME');
const telecastRopcPassword = () => process.env.TELECAST_ROPC_PASSWORD || '';

const getTelecastSendMailAccessToken = async () => {
  const tenantId = telecastTenantId();
  const clientId = telecastClientId();
  const username = telecastRopcUsername();
  const password = telecastRopcPassword();

  if (!tenantId || !clientId || !username || !password) {
    throw new Error('Telecast ROPC env vars missing. Required: AZURE_TENANT_ID, AZURE_CLIENT_ID, TELECAST_ROPC_USERNAME, TELECAST_ROPC_PASSWORD');
  }

  const now = Date.now();
  const skewMs = 60 * 1000;
  if (_telecastRopcTokenCache?.accessToken && _telecastRopcTokenCache?.expiresAtMs && now + skewMs < _telecastRopcTokenCache.expiresAtMs) {
    telecastDebug('Reusing cached ROPC access token.');
    return { accessToken: _telecastRopcTokenCache.accessToken };
  }

  telecastDebug('Fetching ROPC access token.');
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    username,
    password,
    scope: 'https://graph.microsoft.com/Mail.Send',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    telecastDebug('ROPC token fetch failed.', { status: response.status, error: data?.error, error_description: data?.error_description });
    throw new Error(data?.error_description || `Telecast ROPC token fetch failed with status ${response.status}`);
  }

  const expiresInSec = Number(data?.expires_in || 0);
  _telecastRopcTokenCache = {
    accessToken: data.access_token,
    expiresAtMs: now + Math.max(0, expiresInSec) * 1000,
  };
  return { accessToken: data.access_token };
};

// Telecast mail auth is env-driven (public-client ROPC). No UI/API endpoints for token management.

app.get('/api/notifications/status', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view notification status' });
    }

    const config = await getSystemConfig();
    const meta = addConfigMetaHeaders(res, config);
    const alertedTracked = await SyncedOpportunity.countDocuments({ telecastAlerted: true });
    const alertedKeysTracked = await SyncedOpportunity.distinct('telecastAlertedKey', { telecastAlerted: true, telecastAlertedKey: { $ne: '' } });
    const alertedPreviewRows = await SyncedOpportunity.find(
      { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } },
      { telecastAlertedRefNo: 1, telecastAlertedAt: 1 }
    ).sort({ telecastAlertedAt: -1 }).limit(50).lean();
    const alertedRefNosPreview = alertedPreviewRows
      .map((row) => normalizeRefNo(row?.telecastAlertedRefNo || ''))
      .filter(Boolean);

    res.json({
      success: true,
      lastCheckedAt: config.notificationLastCheckedAt || null,
      lastNewRowsCount: Number(config.notificationLastNewRowsCount || 0),
      lastNewRows: Array.isArray(config.notificationLastNewRows) ? config.notificationLastNewRows : [],
      lastNewRowsPreview: Array.isArray(config.notificationLastNewRowsPreview) ? config.notificationLastNewRowsPreview : [],
      trackedRows: Array.isArray(config.notificationRowSignatures) ? config.notificationRowSignatures.length : 0,
      alertWindowDays: TELECAST_RECENT_WINDOW_DAYS,
      alertSeededAt: config.telecastAlertSeededAt || null,
      alertSeededCount: Number(config.telecastAlertSeededCount || 0),
      alertedKeysTracked: alertedKeysTracked.length,
      alertedRefNosTracked: alertedTracked,
      alertedRefNosPreview,
      telecastEligibleRowsPreview: Array.isArray(config.telecastLastEligibleRowsPreview) ? config.telecastLastEligibleRowsPreview : [],
      weeklyStats: Array.isArray(config.telecastWeeklyStats) ? config.telecastWeeklyStats.slice(-12) : [],
    });
  } catch (error) {
    return handleApiError(res, error, 'notifications.status.get');
  }
});

app.get('/api/notifications/alerted', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view alerted tenders' });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 200));
    const q = normalizeRefNo(req.query?.q || '');
    const config = await getSystemConfig();
    const rows = await SyncedOpportunity.find(
      { telecastAlerted: true, telecastAlertedRefNo: { $ne: '' } },
      { telecastAlertedRefNo: 1, telecastAlertedAt: 1 }
    ).sort({ telecastAlertedAt: -1 }).lean();

    let refs = rows.map((row) => normalizeRefNo(row?.telecastAlertedRefNo || '')).filter(Boolean);
    refs = [...new Set(refs)];
    if (q) refs = refs.filter((ref) => ref.includes(q));

    res.json({
      success: true,
      total: refs.length,
      limit,
      alertSeededAt: config.telecastAlertSeededAt || null,
      refs: refs.slice(-limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seed endpoints — mark existing rows as already notified so no backfill emails fire when enabling

app.post('/api/telecast/seed-award-alerts', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const now = new Date();
    const result = await SyncedOpportunity.updateMany(
      { canonicalStage: 'AWARDED', awardEventNotified: { $ne: true } },
      { $set: { awardEventNotified: true, awardEventNotifiedAt: now, awardEventSource: 'manual_seed' } }
    );
    const config = await getSystemConfig({ force: true });
    await persistSystemConfigFields(config, { tlAssignAlertSeededAt: now, pmAssignAlertSeededAt: now }, req.user.email, 'telecast_config_write');
    res.json({ success: true, seeded: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Seed failed' });
  }
});

app.post('/api/telecast/seed-lead-notif', verifyToken, async (req, res) => {
  try {
    if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
    const config = await getSystemConfig({ force: true });
    const trigger = config.leadNotifTrigger || 'new_row';
    let query;
    if (trigger === 'awarded') query = { canonicalStage: 'AWARDED', leadNotifAlerted: { $ne: true } };
    else if (trigger === 'any_stage') query = { leadNotifAlerted: { $ne: true } };
    else query = { leadNotifAlerted: { $ne: true } };
    const now = new Date();
    const result = await SyncedOpportunity.updateMany(query, { $set: { leadNotifAlerted: true, leadNotifAlertedAt: now, leadNotifAlertedKey: 'manual_seed' } });
    await persistSystemConfigFields(config, { leadNotifSeededAt: now }, req.user.email, 'telecast_config_write');
    res.json({ success: true, seeded: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Seed failed' });
  }
});

app.post('/api/notifications/mark-all-alerted', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'notification_alert_flags_write')) return;

    const now = new Date();
    const result = await SyncedOpportunity.updateMany(
      {},
      {
        $set: {
          telecastAlerted: true,
          telecastAlertedAt: now,
          telecastAlertSource: 'manual_bulk_true',
        },
      }
    );

    const config = await getSystemConfig();
    config.telecastAlertSeededAt = config.telecastAlertSeededAt || now;
    config.telecastAlertSeededCount = Math.max(Number(config.telecastAlertSeededCount || 0), Number(result.modifiedCount || 0));
    await refreshSystemConfigAlertTrackingFromSyncedOpportunities(config, `mark_all_alerted:${req.user.email}`);

    res.json({
      success: true,
      matchedCount: Number(result.matchedCount || 0),
      modifiedCount: Number(result.modifiedCount || 0),
      message: 'All synced tenders marked as telecastAlerted=true',
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to mark all tenders as alerted' });
  }
});

app.post('/api/notifications/mark-unalerted', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'notification_alert_flags_write')) return;

    const inputRefNos = Array.isArray(req.body?.refNos) ? req.body.refNos : [];
    const refNos = [...new Set(inputRefNos.map((ref) => normalizeRefNo(ref)).filter(Boolean))];
    if (!refNos.length) {
      return res.status(400).json({ error: 'refNos array is required' });
    }

    const result = await SyncedOpportunity.updateMany(
      { telecastAlertedRefNo: { $in: refNos } },
      {
        $set: {
          telecastAlerted: false,
          telecastAlertedAt: null,
          telecastAlertSource: 'manual_selective_false',
        },
      }
    );

    const config = await getSystemConfig();
    await refreshSystemConfigAlertTrackingFromSyncedOpportunities(config, `mark_unalerted:${req.user.email}`);

    res.json({
      success: true,
      selectedRefNos: refNos.length,
      matchedCount: Number(result.matchedCount || 0),
      modifiedCount: Number(result.modifiedCount || 0),
      message: 'Selected tenders marked as telecastAlerted=false',
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to selectively mark tenders unalerted' });
  }
});

app.post('/api/notifications/force-refresh', verifyToken, async (req, res) => {
  res.json({ success: true, message: 'Graph sync is disabled. Data is managed via sheet uploads.', newRowsCount: 0, insertedCount: 0 });
});


app.get('/api/telecast/track/:id', async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);

    const rawId = String(req.params?.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'track id is required' });

    const normalizedId = rawId.toLowerCase();
    const query = {
      $or: [
        { opportunityRefNo: rawId },
        { telecastAlertedRefNo: rawId },
        { telecastAlertedKey: rawId },
      ],
    };

    if (mongoose.Types.ObjectId.isValid(rawId)) {
      query.$or.push({ _id: rawId });
    }

    const opportunity = await SyncedOpportunity.findOne(query).sort({ syncedAt: -1, updatedAt: -1 }).lean();
    if (!opportunity) {
      return res.status(404).json({ error: 'Tracking record not found' });
    }

    const summary = {
      refNo: String(opportunity.opportunityRefNo || opportunity.telecastAlertedRefNo || rawId).trim(),
      tenderName: String(opportunity.tenderName || '').trim(),
      client: String(opportunity.clientName || '').trim(),
      group: String(opportunity.groupClassification || '').trim(),
      submissionDate: String(opportunity.tenderPlannedSubmissionDate || '').trim(),
      dateReceived: String(opportunity.dateTenderReceived || '').trim(),
      status: String(opportunity.avenirStatus || '').trim(),
      tenderResult: String(opportunity.tenderResult || '').trim(),
      lastUpdatedAt: opportunity.updatedAt || opportunity.syncedAt || null,
      trackedByTelecast: Boolean(opportunity.telecastAlerted),
    };

    return res.json({ success: true, summary, access: 'public_read_only', keyType: normalizedId === String(opportunity.telecastAlertedKey || '').toLowerCase() ? 'telecastKey' : 'refNo' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch public tracking summary' });
  }
});

app.post('/api/telecast/test-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send test mail' });
    }

    const telecastSender = telecastRopcUsername();
    if (!telecastSender) {
      return res.json({ success: true, skipped: 'telecast_sender_not_configured' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    telecastDebug('Test mail requested.', {
      by: req.user?.email,
      sender: telecastSender,
      recipient: recipientEmail,
      authMode: config.telecastGraphAuthMode || 'application',
      hasRefreshToken: Boolean(config.telecastGraphRefreshTokenEnc),
      tokenUpdatedAt: config.telecastGraphTokenUpdatedAt || null,
    });

    const { accessToken } = await getTelecastSendMailAccessToken();
    const subjectTemplate = config.telecastTemplateSubject || 'New Tender Row: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.telecastTemplateBody || 'A new tender row was detected for {{CLIENT}} in {{GROUP}}.';
    const templateStyle = getTelecastTemplateStyle(config.telecastTemplateStyle);
    const testValues = {
      TENDER_NO: `AVR-TEST-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      SUBMISSION_DATE: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: req.user.displayName || req.user.email || 'Avenir',
      OPPORTUNITY_ID: `telecast-preview-${Date.now()}`,
      COMMENTS: 'Sample values inserted for template preview from Admin > Send Test Mail.',
    };
    const renderedSubject = renderTemplate(subjectTemplate, testValues);
    const renderedBody = renderTemplate(bodyTemplate, testValues);
    const testHtml = buildTelecastEmailHtml({
      values: testValues,
      renderedBody,
      styleKey: templateStyle.key,
    });

    telecastDebug('Test mail composed.', {
      subject: String(renderedSubject || '').slice(0, 160),
      styleKey: templateStyle.key,
    });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: renderedSubject,
          body: {
            contentType: 'HTML',
            content: testHtml,
          },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      telecastDebug('Test mail failed.', {
        status: graphResponse.status,
        graphError: payload?.error?.code,
        graphMessage: payload?.error?.message,
      });
      return res.status(500).json({ error: message });
    }

    telecastDebug('Test mail sent OK.', { status: graphResponse.status, recipient: recipientEmail });
    res.json({ success: true, message: `Template preview mail sent to ${recipientEmail}`, subject: renderedSubject });
  } catch (error) {
    telecastDebug('Test mail threw.', String(error?.message || error));
    res.status(500).json({ error: error.message || 'Failed to send test mail' });
  }
});

app.post('/api/telecast/test-deadline-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send test mail' });
    }

    const telecastSender = telecastRopcUsername();
    if (!telecastSender) {
      return res.json({ success: true, skipped: 'telecast_sender_not_configured' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    const { accessToken } = await getTelecastSendMailAccessToken();
    const subjectTemplate = config.deadlineAlertTemplateSubject || 'Tender Deadline Tomorrow: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.deadlineAlertTemplateBody || 'Reminder: {{TENDER_NAME}} is due on {{SUBMISSION_DATE}} for {{CLIENT}}.';
    const templateStyle = getTelecastTemplateStyle(config.deadlineAlertTemplateStyle || 'sunset_alert');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const testValues = {
      TENDER_NO: `AVR-DEADLINE-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      SUBMISSION_DATE: tomorrow.toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: req.user.displayName || req.user.email || 'Avenir',
      OPPORTUNITY_ID: `deadline-preview-${Date.now()}`,
      COMMENTS: 'Sample values inserted for deadline template preview.',
    };
    const renderedSubject = renderTemplate(subjectTemplate, testValues);
    const renderedBody = renderTemplate(bodyTemplate, testValues);
    const testHtml = buildTelecastEmailHtml({
      values: testValues,
      renderedBody,
      styleKey: templateStyle.key,
    });
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: renderedSubject,
          body: {
            contentType: 'HTML',
            content: testHtml,
          },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      telecastDebug('Deadline test mail failed.', { status: graphResponse.status, message: payload?.error?.message });
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, message: `Deadline template preview sent to ${recipientEmail}`, subject: renderedSubject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send deadline test mail' });
  }
});

app.get('/api/telecast/deadline-status', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can view deadline status' });
    }

    const config = await getSystemConfig();
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowKey = getDateKeyLocal(tomorrow);
    const selectedClients = Array.isArray(config.deadlineAlertClients) ? config.deadlineAlertClients : [];
    const clientSet = new Set(selectedClients.map((client) => String(client || '').trim().toLowerCase()).filter(Boolean));

    const leadMappings = await LeadEmailMapping.find({}).lean();
    const leadDirectory = buildLeadEmailDirectory(leadMappings);
    const opportunities = await SyncedOpportunity.find(
      {},
      {
        opportunityRefNo: 1,
        tenderName: 1,
        clientName: 1,
        internalLead: 1,
        leadEmail: 1,
        tenderPlannedSubmissionDate: 1,
        tenderSubmittedDate: 1,
        deadlineAlertedDateKey: 1,
      }
    ).lean();

    const rows = opportunities
      .map((opp) => {
        const submissionDate = getSubmissionDate(opp);
        const submissionKey = getDateKeyLocal(submissionDate);
        if (!submissionKey || submissionKey !== tomorrowKey) return null;
        const clientName = String(opp.clientName || '').trim().toLowerCase();
        const resolvedLead = resolveLeadEmailForOpportunity(opp, leadDirectory);
        const leadEmail = String(resolvedLead.email || '').trim().toLowerCase();
        let reason = 'pending';
        if (String(opp.deadlineAlertedDateKey || '') === tomorrowKey) {
          reason = 'sent';
        } else if (!leadEmail) {
          reason = 'missing_lead_email';
        } else if (clientSet.size && !clientSet.has(clientName)) {
          reason = 'client_filtered';
        }
        return {
          refNo: opp.opportunityRefNo || '',
          tenderName: opp.tenderName || '',
          clientName: opp.clientName || '',
          leadName: opp.internalLead || '',
          leadEmail: resolvedLead.email || '',
          submissionDate: submissionDate || '',
          sent: String(opp.deadlineAlertedDateKey || '') === tomorrowKey,
          reason,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      tomorrow: tomorrowKey,
      enabled: Boolean(config.deadlineAlertEnabled),
      count: rows.length,
      rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load deadline status' });
  }
});

app.post('/api/telecast/test-approval-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send approval alert test mail' });
    }

    const telecastSender = telecastRopcUsername();
    if (!telecastSender) {
      return res.json({ success: true, skipped: 'telecast_sender_not_configured' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    const { accessToken } = await getTelecastSendMailAccessToken();
    const values = {
      TENDER_NO: `AVR-APR-${String(Math.floor(Math.random() * 900) + 100)}`,
      TENDER_NAME: 'District Cooling Plant Expansion',
      CLIENT: 'Avenir Demo Client',
      GROUP: 'GDS',
      TENDER_TYPE: 'Proposal',
      DATE_TENDER_RECD: new Date().toISOString().slice(0, 10),
      YEAR: String(new Date().getFullYear()),
      LEAD: 'tender.manager@avenirengineering.com',
      OPPORTUNITY_ID: `approval-preview-${Date.now()}`,
      COMMENTS: `Approved by Tender Manager: ${req.user.displayName || req.user.email || 'Avenir'}`,
    };
    const subjectTemplate = config.approvalAlertTemplateSubject || 'Tender Approved by Tender Manager: {{TENDER_NO}} - {{TENDER_NAME}}';
    const bodyTemplate = config.approvalAlertTemplateBody || 'A tender has been approved by the Tender Manager and is ready for SVP review.';
    const style = getTelecastTemplateStyle(config.approvalAlertTemplateStyle);
    const subject = renderTemplate(subjectTemplate, values);
    const renderedBody = renderTemplate(bodyTemplate, values);
    const html = buildApprovalAlertEmailHtml({ values, renderedBody, styleKey: style.key });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      telecastDebug('Approval test mail failed.', { status: graphResponse.status, message: payload?.error?.message });
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, message: `Approval alert preview mail sent to ${recipientEmail}`, subject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send approval alert test mail' });
  }
});

app.post('/api/reporting/test-mail', verifyToken, async (req, res) => {
  try {
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can send reporting test mail' });
    }

    const telecastSender = telecastRopcUsername();
    if (!telecastSender) {
      return res.json({ success: true, skipped: 'telecast_sender_not_configured' });
    }

    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const config = await getSystemConfig();
    const { accessToken } = await getTelecastSendMailAccessToken();
    const reportedAt = new Date().toISOString();
    const subject = 'Issue report preview: Dashboard · data mismatch';
    const html = buildIssueReportEmailHtml({
      styleKey: config.issueReportTemplateStyle,
      reporter: escapeHtml(req.user.displayName || req.user.email || 'Unknown'),
      role: escapeHtml(req.user.role || 'Unknown'),
      email: escapeHtml(req.user.email || 'Unknown'),
      page: '/dashboard',
      reportedAt: escapeHtml(reportedAt),
      issueTypes: 'data mismatch, not working properly',
      feature: 'Dashboard',
      summary: 'Sample preview of the configured issue reporting email style.',
      steps: '1. Open the dashboard\n2. Apply a filter\n3. Compare totals against the visible rows',
      comments: 'This is a style preview sent from Admin > Issue Reporting Template Style.',
    });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: html,
          },
          toRecipients: [{ emailAddress: { address: recipientEmail } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      telecastDebug('Reporting test mail failed.', { status: graphResponse.status, message: payload?.error?.message });
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, message: `Issue reporting preview mail sent to ${recipientEmail}`, subject });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send reporting test mail' });
  }
});

app.post('/api/issue-reports', verifyToken, async (req, res) => {
  try {
    const issueTypes = Array.isArray(req.body?.issueTypes) ? req.body.issueTypes.filter(Boolean) : [];
    const feature = String(req.body?.feature || '').trim();
    const featureOther = String(req.body?.featureOther || '').trim();
    const summary = String(req.body?.summary || '').trim();
    const steps = String(req.body?.steps || '').trim();
    const comments = String(req.body?.comments || '').trim();
    const page = String(req.body?.page || '').trim();

    if (!issueTypes.length) {
      return res.status(400).json({ error: 'At least one issue type is required' });
    }
    if (!feature) {
      return res.status(400).json({ error: 'Feature is required' });
    }
    if (feature.toLowerCase() === 'other' && !featureOther) {
      return res.status(400).json({ error: 'Feature (other) is required' });
    }
    if (!comments) {
      return res.status(400).json({ error: 'Comments are required' });
    }

    const masters = await AuthorizedUser.find({
      role: { $in: ['Master', 'MASTER'] },
      status: 'approved',
    }).lean();
    const recipients = masters.map((user) => String(user.email || '').trim()).filter(Boolean);
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No Master recipients configured' });
    }

    const telecastSender = telecastRopcUsername();
    if (!telecastSender) {
      return res.json({ success: true, skipped: 'telecast_sender_not_configured' });
    }

    const config = await getSystemConfig();
    const { accessToken } = await getTelecastSendMailAccessToken();
    const featureLabel = feature.toLowerCase() === 'other' ? featureOther : feature;
    const subject = `Issue report: ${featureLabel} · ${issueTypes.join(', ')}`;
    const reportedAt = new Date().toISOString();
    const safeReporter = escapeHtml(req.user.displayName || req.user.email || 'Unknown');
    const safeRole = escapeHtml(req.user.role || 'Unknown');
    const safeEmail = escapeHtml(req.user.email || 'Unknown');
    const safePage = escapeHtml(page || 'Unknown');
    const safeTime = escapeHtml(reportedAt);
    const safeIssueTypes = issueTypes.map((item) => escapeHtml(item)).join(', ');
    const safeFeature = escapeHtml(featureLabel);
    const safeSummary = escapeHtml(summary);
    const safeSteps = escapeHtml(steps);
    const safeComments = escapeHtml(comments);
    const html = buildIssueReportEmailHtml({
      styleKey: config.issueReportTemplateStyle,
      reporter: safeReporter,
      role: safeRole,
      email: safeEmail,
      page: safePage,
      reportedAt: safeTime,
      issueTypes: safeIssueTypes,
      feature: safeFeature,
      summary: safeSummary,
      steps: safeSteps,
      comments: safeComments,
    });

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const payload = await graphResponse.json().catch(() => ({}));
      const message = payload?.error?.message || `Graph sendMail failed with status ${graphResponse.status}`;
      telecastDebug('Issue report mail failed.', { status: graphResponse.status, message: payload?.error?.message });
      return res.status(500).json({ error: message });
    }

    res.json({ success: true, recipients: recipients.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send issue report' });
  }
});

app.post('/api/opportunities/sync-graph', verifyToken, async (req, res) => {
  // Graph sync removed: MongoDB is now updated only via Opportunities page uploads/manual entry.
  res.status(410).json({ error: 'Graph sync has been disabled. Use Opportunities upload as the source of truth.' });
});

app.post('/api/opportunities/sync-graph/auto', verifyToken, async (req, res) => {
  res.status(410).json({ error: 'Graph sync has been disabled. Use Opportunities upload as the source of truth.' });
});

// Backward-compatible aliases
app.post('/api/opportunities/sync-sheets', verifyToken, async (req, res) => {
  res.status(410).json({ error: 'Graph sync has been disabled. Use Opportunities upload as the source of truth.' });
});

app.post('/api/opportunities/sync-sheets/auto', verifyToken, async (req, res) => {
  res.status(410).json({ error: 'Graph sync has been disabled. Use Opportunities upload as the source of truth.' });
});

app.get('/api/opportunities', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'opportunities_view')) return;
    const start = Date.now();
    const view = String(req.query?.view || 'full').trim().toLowerCase();
    const projection = getOpportunityProjection(view);
    const opportunities = await SyncedOpportunity.find({}, projection)
      .sort({ createdAt: -1 })
      .lean();

    const mapped = opportunities.map(opp => mapIdField(opp));
    const snapshotAt = mapped.reduce((latest, opp) => {
      const syncedAt = opp?.syncedAt ? new Date(opp.syncedAt).getTime() : 0;
      const updatedAt = opp?.updatedAt ? new Date(opp.updatedAt).getTime() : 0;
      return Math.max(latest, syncedAt, updatedAt);
    }, 0);

    const totalMs = Date.now() - start;
    res.setHeader('X-Opps-Total-Ms', totalMs);
    res.setHeader('X-Opps-View', view === 'lite' ? 'lite' : 'full');
    if (snapshotAt > 0) {
      res.setHeader('X-Opps-Snapshot-At', new Date(snapshotAt).toISOString());
    }
    res.json(mapped);
  } catch (error) {
    console.error('[api.opportunities.get.error]', error);
    const isDbError = error?.name?.includes('Mongo') || /server selection|socket timeout|topology/i.test(error?.message || '');
    if (isDbError) return respondDatabaseUnavailable(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/opportunities/changes', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'opportunities_view')) return;
    const view = String(req.query?.view || 'lite').trim().toLowerCase();
    const sinceRaw = String(req.query?.since || '').trim();
    const since = sinceRaw ? new Date(sinceRaw) : null;
    if (!since || Number.isNaN(since.getTime())) {
      return res.status(400).json({ error: 'since is required and must be a valid ISO date or timestamp' });
    }

    const projection = getOpportunityProjection(view);
    const rows = await SyncedOpportunity.find({ syncedAt: { $gt: since } }, projection)
      .sort({ syncedAt: 1, updatedAt: 1, createdAt: 1 })
      .lean();
    const mapped = rows.map((opp) => mapIdField(opp));
    const snapshotAt = mapped.reduce((latest, opp) => {
      const syncedAt = opp?.syncedAt ? new Date(opp.syncedAt).getTime() : 0;
      const updatedAt = opp?.updatedAt ? new Date(opp.updatedAt).getTime() : 0;
      return Math.max(latest, syncedAt, updatedAt);
    }, since.getTime());
    const latestSnapshotAt = await getLatestOpportunitySnapshotAt();

    if (latestSnapshotAt) {
      res.setHeader('X-Opps-Snapshot-At', new Date(latestSnapshotAt).toISOString());
    }
    res.json({
      success: true,
      rows: mapped,
      snapshotAt: snapshotAt > 0 ? new Date(snapshotAt).toISOString() : null,
      latestSnapshotAt: latestSnapshotAt || null,
      view: view === 'full' ? 'full' : 'lite',
    });
  } catch (error) {
    console.error('[api.opportunities.changes.error]', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/opportunities/stream', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'opportunities_view')) return;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: opportunities\ndata: ${JSON.stringify({
      ts: new Date().toISOString(),
      type: 'ready',
    })}\n\n`);

    opportunityStreamClients.add(res);
    ensureOpportunityStreamHeartbeat();

    req.on('close', () => {
      opportunityStreamClients.delete(res);
      if (!opportunityStreamClients.size && opportunityStreamHeartbeat) {
        clearInterval(opportunityStreamHeartbeat);
        opportunityStreamHeartbeat = null;
      }
    });
  } catch (error) {
    console.error('[api.opportunities.stream.error]', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    } else {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }
});

// --- Potential Opportunities (separate extras store; does not modify SyncedOpportunity schema) ---
app.get('/api/potential-opportunities', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'opportunities_view')) return;
    const q = String(req.query?.q || '').trim().toLowerCase();
    const onlyPotential = String(req.query?.onlyPotential || 'true').toLowerCase() !== 'false';

    const marked = await PotentialOpportunity.find(
      onlyPotential ? { isPotential: true } : {},
      { opportunityRefNo: 1, isPotential: 1, extras: 1, updatedBy: 1, updatedAt: 1, createdAt: 1 }
    ).lean();

    const refNos = marked.map((m) => String(m.opportunityRefNo || '').trim()).filter(Boolean);
    const opps = refNos.length
      ? await SyncedOpportunity.find({ opportunityRefNo: { $in: refNos } }, { rawGoogleData: 0 }).lean()
      : [];
    const oppByRef = new Map(opps.map((o) => [String(o.opportunityRefNo || '').trim().toLowerCase(), mapIdField(o)]));

    const rows = marked
      .map((m) => {
        const ref = String(m.opportunityRefNo || '').trim();
        const opp = oppByRef.get(ref.toLowerCase()) || null;
        return {
          id: String(m._id),
          opportunityRefNo: ref,
          isPotential: Boolean(m.isPotential),
          extras: m.extras || {},
          updatedBy: String(m.updatedBy || ''),
          updatedAt: m.updatedAt,
          createdAt: m.createdAt,
          opportunity: opp,
        };
      })
      .filter((row) => {
        if (!q) return true;
        const blob = [
          row.opportunityRefNo,
          row.opportunity?.tenderName,
          row.opportunity?.clientName,
          row.opportunity?.internalLead,
        ].filter(Boolean).join(' ').toLowerCase();
        return blob.includes(q);
      });

    res.json({ success: true, rows });
  } catch (error) {
    return handleApiError(res, error, 'potential-opportunities.get');
  }
});

app.post('/api/potential-opportunities/mark', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_write')) return;
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const opportunityRefNo = String(payload?.opportunityRefNo || '').trim();
    const isPotential = payload?.isPotential === undefined ? true : Boolean(payload?.isPotential);
    if (!opportunityRefNo) return res.status(400).json({ error: 'opportunityRefNo is required' });
    const updatedBy = String(req.user?.email || req.user?.name || '').trim();
    const doc = await PotentialOpportunity.findOneAndUpdate(
      { opportunityRefNo },
      { $set: { opportunityRefNo, isPotential, updatedBy }, $setOnInsert: { extras: {} } },
      { upsert: true, new: true, collation: { locale: 'en', strength: 2 } }
    ).lean();
    res.json({ success: true, row: { id: String(doc._id), ...doc } });
  } catch (error) {
    console.error('[api.potential-opportunities.mark.error]', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/potential-opportunities/:id/extras', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_write')) return;
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const extras = payload?.extras && typeof payload.extras === 'object' ? payload.extras : {};
    const updatedBy = String(req.user?.email || req.user?.name || '').trim();
    const updated = await PotentialOpportunity.findByIdAndUpdate(
      id,
      { $set: { extras, updatedBy } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, row: { id: String(updated._id), ...updated } });
  } catch (error) {
    console.error('[api.potential-opportunities.extras.error]', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/potential-opportunities/import', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_write')) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows provided' });

    const updatedBy = String(req.user?.email || req.user?.name || '').trim();
    const ops = [];
    const normalizeRef = (value) => String(value || '').trim();
    rows.forEach((input) => {
      const opportunityRefNo = normalizeRef(input?.opportunityRefNo || input?.refNo || input?.tenderNo);
      if (!opportunityRefNo) return;
      const extras = input?.extras && typeof input.extras === 'object' ? input.extras : {};
      ops.push({
        updateOne: {
          filter: { opportunityRefNo },
          update: {
            $set: { opportunityRefNo, isPotential: true, extras, updatedBy },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
          collation: { locale: 'en', strength: 2 },
        },
      });
    });

    if (!ops.length) return res.json({ success: true, upserted: 0, modified: 0, touched: 0 });
    const result = await PotentialOpportunity.bulkWrite(ops, { ordered: false });
    res.json({
      success: true,
      upserted: Number(result?.upsertedCount || 0),
      modified: Number(result?.modifiedCount || 0),
      touched: ops.length,
    });
  } catch (error) {
    console.error('[api.potential-opportunities.import.error]', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/spreadsheet/workbook/opportunities', verifyToken, async (_req, res) => {
  try {
    const payload = await buildOpportunitiesWorkbookForSpreadsheet();
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// --- BD Engagements ---
app.get('/api/bd-engagements', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requirePageView(req, res, 'bd_engagements')) return;
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    const rows = await BDEngagement.find().sort({ createdAt: -1 }).lean();
    res.json(rows.map(mapIdField));
  } catch (error) {
    return handleApiError(res, error, 'bd-engagements.get');
  }
});

app.post('/api/bd-engagements', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'bd_engagements_write')) return;
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const ref = String(payload?.ref || '').trim();
    if (!ref) return res.status(400).json({ error: 'ref is required' });
    const created = await BDEngagement.create({
      ref,
      date: String(payload?.date || '').trim(),
      clientName: String(payload?.clientName || '').trim(),
      meetingType: String(payload?.meetingType || '').trim(),
      status: String(payload?.status || 'Open').trim() || 'Open',
      location: String(payload?.location || '').trim(),
      discussionPoints: String(payload?.discussionPoints || '').trim(),
      reportSubmitted: Boolean(payload?.reportSubmitted),
      leadGenerated: Boolean(payload?.leadGenerated),
      focalPerson: String(payload?.focalPerson || '').trim(),
      designation: String(payload?.designation || '').trim(),
      email: String(payload?.email || '').trim(),
      mobileNumber: String(payload?.mobileNumber || '').trim(),
      leadDescription: String(payload?.leadDescription || '').trim(),
      nextSteps: String(payload?.nextSteps || '').trim(),
      lastContact: String(payload?.lastContact || '').trim(),
    });
    res.json({ success: true, row: mapIdField(created.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/bd-engagements/bulk', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'bd_engagements_write')) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.json({ success: true, rows: [] });
    const docs = rows
      .map((payload) => ({
        ref: String(payload?.ref || '').trim(),
        date: String(payload?.date || '').trim(),
        clientName: String(payload?.clientName || '').trim(),
        meetingType: String(payload?.meetingType || '').trim(),
        status: String(payload?.status || 'Open').trim() || 'Open',
        location: String(payload?.location || '').trim(),
        discussionPoints: String(payload?.discussionPoints || '').trim(),
        reportSubmitted: Boolean(payload?.reportSubmitted),
        leadGenerated: Boolean(payload?.leadGenerated),
        focalPerson: String(payload?.focalPerson || '').trim(),
        designation: String(payload?.designation || '').trim(),
        email: String(payload?.email || '').trim(),
        mobileNumber: String(payload?.mobileNumber || '').trim(),
        leadDescription: String(payload?.leadDescription || '').trim(),
        nextSteps: String(payload?.nextSteps || '').trim(),
        lastContact: String(payload?.lastContact || '').trim(),
      }))
      .filter((row) => row.ref);
    const created = await BDEngagement.insertMany(docs, { ordered: false });
    res.json({ success: true, rows: created.map((d) => mapIdField(d.toObject())) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/bd-engagements/:id', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'bd_engagements_write')) return;
    const id = String(req.params.id || '').trim();
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const existing = await BDEngagement.findById(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const next = {
      ref: String(payload?.ref || existing.ref || '').trim(),
      date: String(payload?.date || existing.date || '').trim(),
      clientName: String(payload?.clientName || existing.clientName || '').trim(),
      meetingType: String(payload?.meetingType || existing.meetingType || '').trim(),
      status: String(payload?.status || existing.status || 'Open').trim() || 'Open',
      location: String(payload?.location || existing.location || '').trim(),
      discussionPoints: String(payload?.discussionPoints || existing.discussionPoints || '').trim(),
      reportSubmitted: Boolean(payload?.reportSubmitted),
      leadGenerated: Boolean(payload?.leadGenerated),
      focalPerson: String(payload?.focalPerson || existing.focalPerson || '').trim(),
      designation: String(payload?.designation || existing.designation || '').trim(),
      email: String(payload?.email || existing.email || '').trim(),
      mobileNumber: String(payload?.mobileNumber || existing.mobileNumber || '').trim(),
      leadDescription: String(payload?.leadDescription || existing.leadDescription || '').trim(),
      nextSteps: String(payload?.nextSteps || existing.nextSteps || '').trim(),
      lastContact: String(payload?.lastContact || existing.lastContact || '').trim(),
    };
    Object.assign(existing, next);
    await existing.save();
    res.json({ success: true, row: mapIdField(existing.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/bd-engagements/clear', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'bd_engagements_write')) return;
    await BDEngagement.deleteMany({});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.delete('/api/bd-engagements/:id', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'bd_engagements_write')) return;
    const id = String(req.params.id || '').trim();
    const deleted = await BDEngagement.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/opportunities/post-bid-config', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const config = await getSystemConfig();
    const allowedEmails = Array.isArray(config.postBidAllowedEmails) ? config.postBidAllowedEmails : [];
    const email = String(req.user?.email || '').trim().toLowerCase();
    const canEdit = ['Master', 'Admin'].includes(req.user.role) || allowedEmails.map((e) => String(e || '').trim().toLowerCase()).includes(email);
    const meta = addConfigMetaHeaders(res, config);
    res.json({ success: true, canEdit, allowedEmails, ...meta });
  } catch (error) {
    return handleApiError(res, error, 'opportunities.post-bid-config.get');
  }
});

app.post('/api/opportunities/post-bid-config', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!['Master', 'Admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Master/Admin can update post-bid config' });
    }
    // Frontend historically sends `{ emails: [...] }`; support both shapes.
    const nextEmails = normalizeEmailList(req.body?.allowedEmails || req.body?.emails || []);
    const config = await getSystemConfig();
    const beforeHashes = { postBidAllowedEmails: hashJson(config.postBidAllowedEmails || []) };
    const updated = await persistSystemConfigFields(config, {
      postBidAllowedEmails: nextEmails,
    }, req.user.email, 'post_bid_config_write');
    const meta = addConfigMetaHeaders(res, updated);

    console.log(JSON.stringify({
      tag: 'ADMIN_CONFIG_SAVE',
      ts: new Date().toISOString(),
      actor: req.user.email,
      endpoint: '/api/opportunities/post-bid-config',
      before: beforeHashes,
      after: { postBidAllowedEmails: hashJson(updated.postBidAllowedEmails || []) },
    }));

    res.json({ success: true, allowedEmails: updated.postBidAllowedEmails || [], ...meta });
  } catch (error) {
    return handleApiError(res, error, 'opportunities.post-bid-config.post');
  }
});

// --- PQ & Registration Activities ---
const PQ_STATUS_VALUES = ['Prequalified', 'Registered', 'Registration on Process'];
const PQ_TENANTS = ['avenir_abudhabi', 'avenir_india', 'bcts_dubai', 'bcts_abudhabi', 'avenir_energy', 'avenir_oilfield', 'lauren'];
const PQ_TENANT_ALIASES = {
  avenir_abudhabi: ['avenir_abudhabi', 'avenir', 'avenir_abudhabi ', 'avenir-abu-dhabi', 'avenir_abudhabi'],
  avenir_india: ['avenir_india', 'avenir india', 'avenir_ind', 'india', 'avenir_india '],
  bcts_dubai: ['bcts_dubai', 'bcts dubai', 'bcts', 'dubai', 'bcts_dubai '],
  bcts_abudhabi: ['bcts_abudhabi', 'bcts abu dhabi', 'bcts_abudhabi ', 'bcts-abu-dhabi'],
  avenir_energy: ['avenir_energy', 'avenir energy', 'energy', 'avenir_energy '],
  avenir_oilfield: ['avenir_oilfield', 'avenir oilfield', 'oilfield', 'avenir oil field', 'avenir_oilfield '],
  lauren: ['lauren', 'lauren ', 'lauren llc', 'lauren-llc'],
};

const normalizePqTenant = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'avenir_abudhabi';
  for (const canonical of PQ_TENANTS) {
    const aliases = PQ_TENANT_ALIASES[canonical] || [];
    if (aliases.some((a) => String(a).trim().toLowerCase() === raw)) return canonical;
  }
  return PQ_TENANTS.includes(raw) ? raw : 'avenir_abudhabi';
};

const pqTenantAliases = (canonicalTenant) => {
  const canonical = normalizePqTenant(canonicalTenant);
  const aliases = PQ_TENANT_ALIASES[canonical] || [canonical];
  return Array.from(new Set(aliases.map((a) => String(a).trim()).filter(Boolean)));
};

const normalizePqStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Registration on Process';
  if (raw.includes('preq') || raw === 'prequalified') return 'Prequalified';
  if (raw.includes('register') && !raw.includes('process') && !raw.includes('progress')) return 'Registered';
  if (raw.includes('process') || raw.includes('progress') || raw.includes('in process') || raw.includes('inprogress')) return 'Registration on Process';
  if (raw === 'registered') return 'Registered';
  if (raw === 'prequalified') return 'Prequalified';
  return 'Registration on Process';
};

const pqActivityCreateSchema = z.object({
  tenant: z.enum(['avenir_abudhabi', 'avenir_india', 'bcts_dubai', 'bcts_abudhabi', 'avenir_energy', 'avenir_oilfield', 'lauren']).optional(),
  sNo: z.number().int().nonnegative().optional(),
  company: z.string().trim().min(1).max(120),
  status: z.enum(['Prequalified', 'Registered', 'Registration on Process']).optional(),
  workgroup: z.string().trim().max(120).optional().default(''),
  registeredEmail: z.string().trim().max(200).optional().default(''),
  userId: z.string().trim().max(200).optional().default('-'),
  password: z.string().max(500).optional().default(''),
  link: z.string().trim().max(800).optional().default('-'),
  imageLink: z.string().trim().max(1200).optional().default(''),
  contactPerson: z.string().trim().max(120).optional().default(''),
  renewalDate: z.union([z.string(), z.date(), z.null()]).optional().default(null),
  lastUpdateDate: z.union([z.string(), z.date(), z.null()]).optional().default(null),
  notes: z.string().trim().max(1000).optional().default(''),
  enquiries: z.string().trim().max(2000).optional().default(''),
});

const pqActivityPatchSchema = pqActivityCreateSchema.partial().extend({
  status: z.enum(['Prequalified', 'Registered', 'Registration on Process']).optional(),
});

const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

app.post('/api/opportunities/sheet-upload/commit', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'opportunities_sheet_upload')) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows provided' });

    const now = new Date();
    const ops = [];
    const normalizeRef = (value) => String(value || '').trim();
    const isNumericDateEncodedRefNo = (value) => /^\d{6}$/.test(String(value || '').trim());

    const grouped = new Map();
    rows.forEach((input, idx) => {
      const opportunityRefNo = normalizeRef(input?.opportunityRefNo || input?.tenderNo || input?.refNo);
      if (!opportunityRefNo) return;
      const normalizedInput = {
        opportunityRefNo,
        adnocRftNo: String(input?.adnocRftNo || '').trim(),
        tenderName: String(input?.tenderName || '').trim(),
        clientName: String(input?.clientName || '').trim(),
        groupClassification: String(input?.groupClassification || '').trim(),
        internalLead: String(input?.internalLead || '').trim(),
        opportunityClassification: String(input?.opportunityClassification || '').trim(),
        dateTenderReceived: String(input?.dateTenderReceived || '').trim(),
        tenderPlannedSubmissionDate: String(input?.tenderPlannedSubmissionDate || '').trim(),
        tenderSubmittedDate: String(input?.tenderSubmittedDate || '').trim(),
        avenirStatus: String(input?.avenirStatus || '').trim(),
        tenderResult: String(input?.tenderResult || '').trim(),
        canonicalStage: String(input?.canonicalStage || '').trim(),
        remarksReason: String(input?.remarksReason || '').trim(),
        comments: String(input?.comments || '').trim(),
        tenderStatusRemark: String(input?.tenderStatusRemark || '').trim(),
        rawSheetYear: String(input?.rawSheetYear || input?.year || '').trim(),
        rawAvenirStatus: String(input?.rawAvenirStatus || '').trim(),
        rawTenderResult: String(input?.rawTenderResult || '').trim(),
        dateAudit: input?.dateAudit || null,
        opportunityValue: input?.opportunityValue,
        probability: input?.probability,
        rawGraphData: input?.rawGraphData || null,
      };
      const bucket = grouped.get(opportunityRefNo) || [];
      bucket.push({ input: normalizedInput, idx });
      grouped.set(opportunityRefNo, bucket);
    });

    for (const [opportunityRefNo, entries] of grouped.entries()) {
      const sorted = [...entries].sort((a, b) => {
        const aDate = String(a.input?.dateTenderReceived || '');
        const bDate = String(b.input?.dateTenderReceived || '');
        if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
        return b.idx - a.idx;
      });

      const primary = sorted[0]?.input || {};
      const rest = sorted.slice(1);
      const updateHistory = (!isNumericDateEncodedRefNo(opportunityRefNo) && rest.length > 0)
        ? rest.map(({ input, idx }) => ({
          rowIndex: idx,
          dateTenderReceived: input?.dateTenderReceived || null,
          tenderPlannedSubmissionDate: input?.tenderPlannedSubmissionDate || null,
          tenderSubmittedDate: input?.tenderSubmittedDate || null,
          rawAvenirStatus: String(input?.rawAvenirStatus || '').trim(),
          rawTenderResult: String(input?.rawTenderResult || '').trim(),
          avenirStatus: String(input?.avenirStatus || '').trim(),
          tenderResult: String(input?.tenderResult || '').trim(),
          canonicalStage: String(input?.canonicalStage || '').trim(),
          opportunityValue: input?.opportunityValue ?? null,
          probability: input?.probability ?? null,
          remarksReason: String(input?.remarksReason || '').trim(),
          comments: String(input?.comments || '').trim(),
          tenderStatusRemark: String(input?.tenderStatusRemark || '').trim(),
          syncedAt: now,
          rawGraphData: input?.rawGraphData || null,
          dateAudit: input?.dateAudit || null,
        }))
        : [];

      const payload = {
        opportunityRefNo,
        adnocRftNo: String(primary?.adnocRftNo || '').trim(),
        tenderName: String(primary?.tenderName || '').trim(),
        clientName: String(primary?.clientName || '').trim(),
        groupClassification: String(primary?.groupClassification || '').trim(),
        internalLead: String(primary?.internalLead || '').trim(),
        opportunityClassification: String(primary?.opportunityClassification || '').trim(),
        dateTenderReceived: String(primary?.dateTenderReceived || '').trim(),
        tenderPlannedSubmissionDate: String(primary?.tenderPlannedSubmissionDate || '').trim(),
        tenderSubmittedDate: String(primary?.tenderSubmittedDate || '').trim(),
        avenirStatus: String(primary?.avenirStatus || '').trim(),
        tenderResult: String(primary?.tenderResult || '').trim(),
        canonicalStage: String(primary?.canonicalStage || '').trim(),
        remarksReason: String(primary?.remarksReason || '').trim(),
        comments: String(primary?.comments || '').trim(),
        tenderStatusRemark: String(primary?.tenderStatusRemark || '').trim(),
        rawSheetYear: String(primary?.rawSheetYear || primary?.year || '').trim(),
        rawAvenirStatus: String(primary?.rawAvenirStatus || '').trim(),
        rawTenderResult: String(primary?.rawTenderResult || '').trim(),
        dateAudit: primary?.dateAudit || null,
        updateHistory,
        syncedAt: now,
      };

      const valueNumber = primary?.opportunityValue;
      if (valueNumber !== undefined && valueNumber !== null && String(valueNumber).trim() !== '') {
        const parsed = Number(String(valueNumber).replace(/,/g, ''));
        if (!Number.isNaN(parsed)) payload.opportunityValue = parsed;
      }

      ops.push({
        updateOne: {
          filter: { opportunityRefNo },
          update: { $set: payload },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) {
      return res.json({ success: true, created: 0, updated: 0, touched: 0, rows: [] });
    }

    let result;
    try {
      // Performance: replace individual save/create calls with bulkWrite for O(1) database round-trip.
      result = await SyncedOpportunity.bulkWrite(ops, { ordered: false });
    } catch (bulkError) {
      console.error('[opportunities.sheet-upload.commit.bulk-write-failed]', bulkError);

      // Fallback: one-by-one writes keep the upload usable if one row is malformed.
      let createdCount = 0;
      let updatedCount = 0;
      for (const op of ops) {
        const { filter, update, upsert } = op.updateOne;
        const existing = await SyncedOpportunity.findOne(filter).lean();
        if (existing) {
          await SyncedOpportunity.updateOne(filter, update, { runValidators: false });
          updatedCount += 1;
        } else if (upsert) {
          await SyncedOpportunity.updateOne(filter, update, { upsert: true, runValidators: false });
          createdCount += 1;
        }
      }
      result = { upsertedCount: createdCount, modifiedCount: updatedCount };
    }

    const touchedRefs = Array.from(grouped.keys());
    const updatedDocs = await SyncedOpportunity.find({ opportunityRefNo: { $in: touchedRefs } }).lean();
    const touchedRows = updatedDocs.map(opp => mapIdField(opp));
    publishOpportunityEvent({
      type: 'incremental',
      source: 'sheet-upload-commit',
      snapshotAt: now.toISOString(),
      refs: touchedRefs.slice(0, 100),
      rows: touchedRows,
    });

    res.json({
      success: true,
      created: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
      touched: touchedRows.length,
      rows: touchedRows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/value-conflicts', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;

    const pending = await OpportunityFieldConflict.find({ status: 'pending' }).sort({ detectedAt: -1 }).lean();
    const byRefKey = new Map();

    for (const conflict of pending) {
      const refKey = String(conflict.refKey || '').trim();
      if (!refKey) continue;

      if (!byRefKey.has(refKey)) {
        byRefKey.set(refKey, {
          refKey,
          opportunityRefNo: String(conflict.opportunityRefNo || '').trim(),
          tenderName: '',
          fields: [],
        });
      }

      const group = byRefKey.get(refKey);
      group.fields.push({
        id: String(conflict._id),
        fieldKey: String(conflict.fieldKey || '').trim(),
        fieldLabel: String(conflict.fieldLabel || '').trim(),
        sheetValue: conflict.sheetValue,
        existingValue: conflict.existingValue,
      });
    }

    const groups = Array.from(byRefKey.values());
    const opportunityRefNos = groups.map((g) => g.opportunityRefNo).filter(Boolean);
    const oppByRef = new Map();

    if (opportunityRefNos.length) {
      const opportunities = await SyncedOpportunity.find({ opportunityRefNo: { $in: opportunityRefNos } })
        .select({ opportunityRefNo: 1, tenderName: 1 })
        .lean();
      opportunities.forEach((opp) => {
        oppByRef.set(String(opp.opportunityRefNo || '').trim(), opp);
      });
    }

    groups.forEach((group) => {
      const match = oppByRef.get(group.opportunityRefNo);
      group.tenderName = String(match?.tenderName || '').trim();
    });

    res.json({ success: true, conflicts: groups });
  } catch (error) {
    return handleApiError(res, error, 'opportunities.value-conflicts.get');
  }
});

app.post('/api/opportunities/value-conflicts/resolve', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;
    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    if (!decisions.length) return res.status(400).json({ error: 'No decisions provided' });

    let resolved = 0;
    const touchedRefs = new Set();

    for (const decision of decisions) {
      const conflictId = String(decision?.conflictId || '').trim();
      const action = String(decision?.action || '').trim();
      if (!conflictId || !['use_sheet', 'keep_existing'].includes(action)) continue;

      const conflict = await OpportunityFieldConflict.findOne({ _id: conflictId, status: 'pending' });
      if (!conflict) continue;

      if (action === 'use_sheet') {
        const fieldKey = String(conflict.fieldKey || '').trim();
        const opportunityRefNo = String(conflict.opportunityRefNo || '').trim();
        if (fieldKey && opportunityRefNo) {
          await SyncedOpportunity.updateOne(
            { opportunityRefNo },
            { $set: { [fieldKey]: conflict.sheetValue, syncedAt: new Date() } },
          );
          touchedRefs.add(opportunityRefNo);
        }
      }

      conflict.status = 'resolved';
      conflict.resolvedAt = new Date();
      conflict.resolvedBy = String(req.user?.email || '');
      conflict.resolutionAction = action;
      await conflict.save();
      resolved += 1;
    }

    if (resolved > 0) {
      publishOpportunityEvent({
        type: 'incremental',
        source: 'value-conflicts-resolve',
        snapshotAt: new Date().toISOString(),
        refs: Array.from(touchedRefs).slice(0, 100),
      });
    }

    res.json({ success: true, resolved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/manual-entry/preview', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;

    const mode = String(req.body?.mode || 'update');
    const opportunityRefNo = String(req.body?.opportunityRefNo || '').trim();
    if (!opportunityRefNo) return res.status(400).json({ error: 'opportunityRefNo is required' });

    const existing = await SyncedOpportunity.findOne({ opportunityRefNo }).lean();
    if (mode === 'new' && existing) {
      return res.json({ success: true, overwrites: [], allChanges: [], warning: 'Opportunity already exists' });
    }
    if (mode === 'update' && !existing) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const LABELS = {
      opportunityRefNo: 'Avenir Ref',
      tenderName: 'Tender Name',
      opportunityClassification: 'Tender Type',
      clientName: 'Client',
      groupClassification: 'Group',
      dateTenderReceived: 'RFP Received',
      tenderPlannedSubmissionDate: 'Submission',
      tenderSubmittedDate: 'Tender Submitted',
      internalLead: 'Lead',
      opportunityValue: 'Value',
      avenirStatus: 'Status',
      adnocRftNo: 'CLIENT Ref',
      remarksReason: 'Remarks / Reason',
      tenderResult: 'Tender Result',
      tenderStatusRemark: 'Tender Status',
    };

    const FIELD_KEYS = Object.keys(LABELS);
    const toText = (value) => String(value ?? '').trim();

    const overwrites = [];
    const allChanges = [];

    for (const fieldKey of FIELD_KEYS) {
      if (fieldKey === 'opportunityRefNo') continue;
      const nextValue = req.body?.[fieldKey];
      const prevValue = existing?.[fieldKey];

      const nextText = toText(nextValue);
      const prevText = toText(prevValue);
      if (nextText === prevText) continue;

      const hasExistingValue = prevText !== '';
      const diff = {
        fieldKey,
        fieldLabel: LABELS[fieldKey],
        previousValue: prevValue ?? null,
        nextValue: nextValue ?? null,
        hasExistingValue,
      };

      allChanges.push(diff);
      if (hasExistingValue && nextText !== '') overwrites.push(diff);
    }

    res.json({ success: true, overwrites, allChanges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/opportunities/manual-entry/save', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'manual_opportunity_updates_write')) return;

    const mode = String(req.body?.mode || 'update');
    const confirmed = Boolean(req.body?.confirmed);
    const opportunityRefNo = String(req.body?.opportunityRefNo || '').trim();
    if (!opportunityRefNo) return res.status(400).json({ error: 'opportunityRefNo is required' });

    const ALLOWED_KEYS = new Set([
      'rawSheetYear',
      'adnocRftNo',
      'tenderName',
      'clientName',
      'groupClassification',
      'internalLead',
      'opportunityClassification',
      'dateTenderReceived',
      'tenderPlannedSubmissionDate',
      'tenderSubmittedDate',
      'tenderResult',
      'rawTenderResult',
      'tenderStatusRemark',
      'remarksReason',
      'opportunityValue',
      'avenirStatus',
    ]);

    const buildFullPayload = () => {
      const base = {
        opportunityRefNo,
        rawSheetYear: String(req.body?.rawSheetYear || '').trim(),
        adnocRftNo: String(req.body?.adnocRftNo || '').trim(),
        tenderName: String(req.body?.tenderName || '').trim(),
        clientName: String(req.body?.clientName || '').trim(),
        groupClassification: String(req.body?.groupClassification || '').trim(),
        internalLead: String(req.body?.internalLead || '').trim(),
        opportunityClassification: String(req.body?.opportunityClassification || '').trim(),
        dateTenderReceived: String(req.body?.dateTenderReceived || '').trim(),
        tenderPlannedSubmissionDate: String(req.body?.tenderPlannedSubmissionDate || '').trim(),
        tenderSubmittedDate: String(req.body?.tenderSubmittedDate || '').trim(),
        avenirStatus: String(req.body?.avenirStatus || '').trim(),
        tenderResult: String(req.body?.tenderResult || '').trim(),
        rawTenderResult: String(req.body?.rawTenderResult || req.body?.tenderResult || '').trim(),
        tenderStatusRemark: String(req.body?.tenderStatusRemark || '').trim(),
        remarksReason: String(req.body?.remarksReason || '').trim(),
      };

      const valueRaw = req.body?.opportunityValue;
      if (valueRaw !== undefined && valueRaw !== null && String(valueRaw).trim() !== '') {
        const parsed = Number(String(valueRaw).replace(/,/g, ''));
        if (!Number.isNaN(parsed)) base.opportunityValue = parsed;
      }
      return base;
    };

    const buildPatchPayload = () => {
      const patch = req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : null;
      if (!patch) return null;
      const payload = { opportunityRefNo };
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'snapshot' && value && typeof value === 'object') {
          const header = String(value.header || '').trim();
          if (!header) continue;
          const snapshotValue = value.value === null || value.value === undefined ? '' : String(value.value);
          payload.snapshot = { header, value: snapshotValue };
          continue;
        }
        if (!ALLOWED_KEYS.has(key)) continue;
        if (key === 'opportunityValue') {
          const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
          if (!Number.isNaN(parsed)) payload.opportunityValue = parsed;
          continue;
        }
        payload[key] = String(value ?? '').trim();
      }
      return payload;
    };

    const patchPayload = buildPatchPayload();
    const payload = patchPayload || buildFullPayload();

    if (Object.keys(payload).length <= 1) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    const existing = await SyncedOpportunity.findOne({ opportunityRefNo });
    if (mode === 'new' && existing) return res.status(409).json({ error: 'Opportunity already exists' });
    if (mode === 'update' && !existing) return res.status(404).json({ error: 'Opportunity not found' });

    const before = existing ? existing.toObject() : null;
    const doc = existing || new SyncedOpportunity({ opportunityRefNo });

    if (payload.snapshot) {
      const currentRaw = (doc.rawGraphData && typeof doc.rawGraphData === 'object') ? doc.rawGraphData : {};
      const currentSnapshot = (currentRaw.rowSnapshot && typeof currentRaw.rowSnapshot === 'object') ? currentRaw.rowSnapshot : {};
      const nextSnapshot = { ...currentSnapshot, [payload.snapshot.header]: payload.snapshot.value };
      doc.rawGraphData = { ...currentRaw, rowSnapshot: nextSnapshot };
      delete payload.snapshot;
    }

    Object.assign(doc, payload);
    doc.syncedAt = new Date();

    const toText = (v) => String(v ?? '').trim();
    let overwriteCount = 0;
    if (before) {
      overwriteCount = Object.keys(payload).filter((key) => {
        if (key === 'opportunityRefNo') return false;
        const prevText = toText(before?.[key]);
        const nextText = toText(payload[key]);
        return prevText !== '' && nextText !== '' && prevText !== nextText;
      }).length;
    }
    if (!confirmed && overwriteCount > 0) return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', overwriteCount });

    await doc.save();

    const updatedBy = String(req.user?.email || '');
    const refKey = String(opportunityRefNo).trim().toUpperCase();
    await OpportunityManualUpdate.updateOne(
      { refKey },
      { $set: { ...payload, refKey, updatedBy } },
      { upsert: true },
    );

    const after = doc.toObject();
    const changedFields = before
      ? Object.keys(payload).filter((key) => key !== 'opportunityRefNo' && toText(before?.[key]) !== toText(after?.[key])).length
      : Object.keys(payload).filter((key) => key !== 'opportunityRefNo' && toText(payload[key]) !== '').length;

    const updatedRow = mapIdField(after);
    publishOpportunityEvent({
      type: 'incremental',
      source: 'manual-entry-save',
      snapshotAt: new Date().toISOString(),
      refs: [opportunityRefNo],
      rows: [updatedRow],
    });

    res.json({ success: true, changedFields, overwriteCount, row: updatedRow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const normalizeBidDecisionState = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'BID') return 'BID';
  if (normalized === 'NO BID' || normalized === 'NOBID') return 'NO BID';
  return 'BLANK';
};

const normalizeBidDecisionSourceMode = (value) => (
  String(value ?? '').trim().toLowerCase() === 'dashboard' ? 'dashboard' : 'manual'
);

const normalizeBidDecisionCriteria = (criteriaValues) => (
  Array.isArray(criteriaValues)
    ? criteriaValues.map((criterion) => ({
        key: String(criterion?.key || '').trim(),
        label: String(criterion?.label || '').trim(),
        rating: Number.isFinite(Number(criterion?.rating)) ? Number(criterion.rating) : null,
        weight: Number.isFinite(Number(criterion?.weight)) ? Number(criterion.weight) : null,
        notes: String(criterion?.notes || '').trim(),
        included: criterion?.included !== false,
      }))
    : []
);

const buildBidDecisionRecord = (doc) => ({
  ...mapIdField(doc?.toObject ? doc.toObject() : doc),
  opportunityRefNo: String(doc?.opportunityRefNo || '').trim(),
  bidDecision: normalizeBidDecisionState(doc?.bidDecision),
  decisionScore: Number(doc?.decisionScore || 0),
  criteriaValues: normalizeBidDecisionCriteria(doc?.criteriaValues),
  sourceMode: normalizeBidDecisionSourceMode(doc?.sourceMode),
  projectName: String(doc?.projectName || ''),
  endUser: String(doc?.endUser || ''),
  receivedFrom: String(doc?.receivedFrom || ''),
  enquiryDate: String(doc?.enquiryDate || ''),
  scopeOfWork: String(doc?.scopeOfWork || ''),
  createdBy: String(doc?.createdBy || ''),
  updatedBy: String(doc?.updatedBy || ''),
  sourceOpportunitySyncedAt: doc?.sourceOpportunitySyncedAt ? new Date(doc.sourceOpportunitySyncedAt).toISOString() : null,
  sourceOpportunityId: String(doc?.sourceOpportunityId || ''),
  createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
});

app.get('/api/bid-decisions', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requirePagePermission(req, res, 'bid_decision')) return;
    const opportunityRefNo = String(req.query?.opportunityRefNo || '').trim();
    const query = opportunityRefNo
      ? { opportunityRefNo }
      : {};
    const records = await BidDecision.find(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
    const refs = records.map((record) => String(record.opportunityRefNo || '').trim()).filter(Boolean);
    const opportunities = refs.length
      ? await SyncedOpportunity.find({ opportunityRefNo: { $in: refs } }, {
          opportunityRefNo: 1,
          tenderName: 1,
          clientName: 1,
          groupClassification: 1,
          internalLead: 1,
          opportunityClassification: 1,
          dateTenderReceived: 1,
          tenderPlannedSubmissionDate: 1,
          tenderSubmittedDate: 1,
          opportunityValue: 1,
          avenirStatus: 1,
          tenderResult: 1,
          tenderStatusRemark: 1,
          remarksReason: 1,
          rawGraphData: 1,
          syncedAt: 1,
        }).lean()
      : [];
    const opportunitiesByRef = opportunities.reduce((acc, item) => {
      const ref = String(item.opportunityRefNo || '').trim();
      if (ref) acc[ref] = mapIdField(item);
      return acc;
    }, {});
    return res.json({
      records: records.map(buildBidDecisionRecord),
      opportunitiesByRef,
    });
  } catch (error) {
    return handleApiError(res, error, 'bid-decisions.get');
  }
});

app.get('/api/bid-decisions/:opportunityRefNo', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requirePagePermission(req, res, 'bid_decision')) return;
    const opportunityRefNo = String(req.params.opportunityRefNo || '').trim();
    if (!opportunityRefNo) return res.status(400).json({ error: 'opportunityRefNo is required' });

    const [record, opportunity] = await Promise.all([
      BidDecision.findOne({ opportunityRefNo }).lean(),
      SyncedOpportunity.findOne({ opportunityRefNo }).select({
        opportunityRefNo: 1,
        tenderName: 1,
        clientName: 1,
        groupClassification: 1,
        internalLead: 1,
        opportunityClassification: 1,
        dateTenderReceived: 1,
        tenderPlannedSubmissionDate: 1,
        tenderSubmittedDate: 1,
        opportunityValue: 1,
        avenirStatus: 1,
        tenderResult: 1,
        tenderStatusRemark: 1,
        remarksReason: 1,
        rawGraphData: 1,
        syncedAt: 1,
      }).lean(),
    ]);

    return res.json({
      record: record ? buildBidDecisionRecord(record) : null,
      opportunity: opportunity ? mapIdField(opportunity) : null,
      opportunityExists: Boolean(opportunity),
    });
  } catch (error) {
    return handleApiError(res, error, 'bid-decisions.byRef.get');
  }
});

app.post('/api/bid-decisions', verifyToken, async (req, res) => {
  try {
    if (!await requirePagePermission(req, res, 'bid_decision')) return;
    if (!await requireActionPermission(req, res, 'bid_decision_manage')) return;

    const opportunityRefNo = String(req.body?.opportunityRefNo || '').trim();
    const bidDecision = normalizeBidDecisionState(req.body?.bidDecision);
    const sourceMode = normalizeBidDecisionSourceMode(req.body?.sourceMode);
    const criteriaValues = normalizeBidDecisionCriteria(req.body?.criteriaValues);
    const decisionScore = Number.isFinite(Number(req.body?.decisionScore)) ? Number(req.body.decisionScore) : 0;
    const projectName = String(req.body?.projectName || '').trim();
    const endUser = String(req.body?.endUser || '').trim();
    const receivedFrom = String(req.body?.receivedFrom || '').trim();
    const enquiryDate = String(req.body?.enquiryDate || '').trim();
    const scopeOfWork = String(req.body?.scopeOfWork || '').trim();

    if (!opportunityRefNo) {
      return res.status(400).json({ error: 'opportunityRefNo is required' });
    }

    // For dashboard mode, enrich with synced opportunity metadata; manual mode skips this
    let sourceOpportunitySyncedAt = null;
    let sourceOpportunityId = '';
    if (sourceMode === 'dashboard') {
      const sourceOpportunity = await SyncedOpportunity.findOne({ opportunityRefNo }).lean();
      if (!sourceOpportunity) {
        return res.status(404).json({ error: `Opportunity "${opportunityRefNo}" not found in the database. Use manual entry mode instead.` });
      }
      sourceOpportunitySyncedAt = sourceOpportunity.syncedAt ? new Date(sourceOpportunity.syncedAt) : null;
      sourceOpportunityId = String(sourceOpportunity._id || '');
    }

    const updated = await BidDecision.findOneAndUpdate(
      { opportunityRefNo },
      {
        $set: {
          bidDecision,
          decisionScore,
          criteriaValues,
          sourceMode,
          projectName,
          endUser,
          receivedFrom,
          enquiryDate,
          scopeOfWork,
          updatedBy: String(req.user?.email || ''),
          sourceOpportunitySyncedAt,
          sourceOpportunityId,
        },
        $setOnInsert: {
          opportunityRefNo,
          createdBy: String(req.user?.email || ''),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({
      success: true,
      record: buildBidDecisionRecord(updated),
    });
  } catch (error) {
    if (String(error?.code || '') === '11000') {
      return res.status(409).json({ error: 'A bid decision already exists for this opportunityRefNo' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vendors', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requirePageView(req, res, 'vendor_directory')) return;
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    await cleanupDummyVendors();
    const vendors = await Vendor.find().sort({ updatedAt: -1, companyName: 1 }).lean();
    res.json(vendors.map((vendor) => mapIdField(vendor)));
  } catch (error) {
    return handleApiError(res, error, 'vendors.get');
  }
});

app.post('/api/vendors', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_write')) return;
    const payload = buildVendorPayload(req.body || {});
    if (!payload.companyName) return res.status(400).json({ error: 'Company name is required' });

    const existing = await Vendor.findOne({ companyKey: payload.companyKey });
    if (!existing) {
      const created = await Vendor.create(payload);
      return res.json(mapIdField(created.toObject()));
    }

    Object.assign(existing, payload);
    await existing.save();
    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vendors/:id', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_write')) return;
    const existing = await Vendor.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    const payload = buildVendorPayload({ ...existing.toObject(), ...(req.body || {}) });
    if (!payload.companyName) return res.status(400).json({ error: 'Company name is required' });
    const duplicate = await Vendor.findOne({ companyKey: payload.companyKey, _id: { $ne: existing._id } });
    if (duplicate) return res.status(409).json({ error: 'Another vendor already uses that company name' });

    Object.assign(existing, payload);
    await existing.save();
    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendors/import', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'vendors_import')) return;
    const inputs = Array.isArray(req.body?.vendors) ? req.body.vendors : [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const input of inputs) {
      const payload = buildVendorPayload(input || {});
      if (!payload.companyName) continue;
      const existing = await Vendor.findOne({ companyKey: payload.companyKey });
      if (!existing) {
        await Vendor.create(payload);
        createdCount += 1;
      } else {
        Object.assign(existing, payload);
        await existing.save();
        updatedCount += 1;
      }
    }

    res.json({ success: true, created: createdCount, updated: updatedCount, imported: createdCount + updatedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requirePageView(req, res, 'clients')) return;
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    const clients = await Client.find().sort({ updatedAt: -1 }).lean();
    res.json(clients.map((client) => mapIdField(client)));
  } catch (error) {
    return handleApiError(res, error, 'clients.get');
  }
});

app.post('/api/clients', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'clients_write')) return;
    const payload = req.body || {};
    const companyName = normalizeCompanyName(payload.companyName || '');
    if (!companyName) return res.status(400).json({ error: 'Company name is required' });
    const companyKey = normalizeCompanyKey(companyName);
    const incomingContacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const group = String(payload.group || payload.groupClassification || '').trim();

    const existing = await Client.findOne({ companyKey });
    if (!existing) {
      const created = await Client.create({
        companyName,
        companyKey,
        group,
        domain: String(payload.domain || '').trim(),
        location: {
          city: String(payload.city || payload.location?.city || '').trim(),
          country: String(payload.country || payload.location?.country || '').trim(),
        },
        contacts: mergeContacts([], incomingContacts),
      });
      return res.json(mapIdField(created.toObject()));
    }

    existing.companyName = companyName;
    if (group) existing.group = group;
    existing.domain = String(payload.domain || existing.domain || '').trim();
    existing.location = {
      city: String(payload.city || existing.location?.city || '').trim(),
      country: String(payload.country || existing.location?.country || '').trim(),
    };
    existing.contacts = mergeContacts(existing.contacts, incomingContacts);
    await existing.save();

    return res.json(mapIdField(existing.toObject()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients/import', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'clients_import')) return;
    const inputs = Array.isArray(req.body?.clients) ? req.body.clients : [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const input of inputs) {
      const companyName = normalizeCompanyName(input?.companyName || '');
      if (!companyName) continue;
      const companyKey = normalizeCompanyKey(companyName);
      const incomingContacts = Array.isArray(input?.contacts) ? input.contacts : [];
      const group = String(input?.group || input?.groupClassification || '').trim();
      const existing = await Client.findOne({ companyKey });
      if (!existing) {
        await Client.create({
          companyName,
          companyKey,
          group,
          domain: String(input?.domain || '').trim(),
          location: {
            city: String(input?.city || input?.location?.city || '').trim(),
            country: String(input?.country || input?.location?.country || '').trim(),
          },
          contacts: mergeContacts([], incomingContacts),
        });
        createdCount += 1;
      } else {
        existing.companyName = companyName;
        if (group) existing.group = group;
        existing.domain = String(input?.domain || existing.domain || '').trim();
        existing.location = {
          city: String(input?.city || existing.location?.city || '').trim(),
          country: String(input?.country || existing.location?.country || '').trim(),
        };
        existing.contacts = mergeContacts(existing.contacts, incomingContacts);
        await existing.save();
        updatedCount += 1;
      }
    }

    res.json({ success: true, created: createdCount, updated: updatedCount, imported: createdCount + updatedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clients/seed', verifyToken, async (req, res) => {
  try {
    if (!await requireActionPermission(req, res, 'clients_seed')) return;
    const opportunities = await SyncedOpportunity.find().lean();
    const result = await syncClientsFromOpportunities(opportunities);
    res.json({ success: true, created: result.created || 0, updated: result.updated || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/opportunities/stats', verifyToken, async (req, res) => {
  try {
    res.json(await buildCollectionStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Feature 25: Top Performer KPI ────────────────────────────────────────────

app.get('/api/opportunities/top-performer', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    const period = String(req.query.period || 'year');
    const cutoff = period === 'year' ? new Date(new Date().getFullYear(), 0, 1) : new Date(0);

    const query = { canonicalStage: 'AWARDED' };
    if (period === 'year') query.updatedAt = { $gte: cutoff };

    const awarded = await SyncedOpportunity.find(
      query,
      { internalLead: 1, opportunityRefNo: 1, tenderName: 1, clientName: 1, awardedDate: 1, opportunityValue: 1, frameworkTotalValue: 1, callOffActualValue: 1 }
    ).lean();

    if (!awarded.length) return res.json({ topPerformer: null, period });

    const byLead = {};
    for (const o of awarded) {
      const lead = o.internalLead || 'Unknown';
      if (!byLead[lead]) byLead[lead] = { name: lead, count: 0, totalValue: 0, tenders: [] };
      const val = Number(o.callOffActualValue ?? o.frameworkTotalValue ?? o.opportunityValue ?? 0);
      byLead[lead].count += 1;
      byLead[lead].totalValue += val;
      byLead[lead].tenders.push({ opportunityRefNo: o.opportunityRefNo, tenderName: o.tenderName, clientName: o.clientName, awardedDate: o.awardedDate, value: val });
    }

    const ranked = Object.values(byLead).sort((a, b) => b.count - a.count || b.totalValue - a.totalValue);
    const topPerformer = ranked[0] || null;

    res.json({ topPerformer, period, totalAwarded: awarded.length });
  } catch (error) {
    console.error('[top-performer.error]', error?.message);
    res.status(500).json({ error: error?.message || 'Failed to compute top performer' });
  }
});

app.post('/api/generate-report', verifyToken, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const body = req.body || {};
    const data = Array.isArray(body.data) ? body.data : [];
    const filters = body.filters || {};

    const summary = calculateSummaryStats(data);
    const recentTenders = getRecentTenderData(data);

    const totalOpportunities = data.length;
    const generatedAt = new Date().toLocaleString();

    const activeFilters = [
      filters.search ? `Search: ${filters.search}` : '',
      Array.isArray(filters.statuses) && filters.statuses.length ? `Statuses: ${filters.statuses.join(', ')}` : '',
      Array.isArray(filters.groups) && filters.groups.length ? `Verticals: ${filters.groups.join(', ')}` : '',
      Array.isArray(filters.leads) && filters.leads.length ? `Leads: ${filters.leads.join(', ')}` : '',
      Array.isArray(filters.clients) && filters.clients.length ? `Clients: ${filters.clients.join(', ')}` : '',
      filters.datePreset && filters.datePreset !== 'all' ? `Date preset: ${filters.datePreset}` : '',
      filters.showAtRisk ? 'At risk only' : '',
      filters.showMissDeadline ? 'Miss deadline only' : '',
    ].filter(Boolean);

    const children = [
      new Paragraph({
        text: 'SALES PIPELINE ANALYTICS REPORT',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        shading: { fill: REPORT_COLORS.navy, type: ShadingType.CLEAR },
        thematicBreak: true,
        spacing: { after: 200, before: 120 },
      }),
      new Paragraph({
        text: 'Comprehensive Sales Intelligence & Market Insights',
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: `Generated: ${generatedAt} | Total Opportunities: ${totalOpportunities}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: 'Report Filters',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        text: `Applied Filters: ${activeFilters.length ? activeFilters.join(' • ') : 'None (all data shown)'}`,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: 'Key Business Metrics',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Total Opportunities', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Won', REPORT_COLORS.greenSoft),
              createReportHeaderCell('Lost', REPORT_COLORS.redSoft),
              createReportHeaderCell('At Risk', REPORT_COLORS.amberSoft),
              createReportHeaderCell('Active Pipeline', REPORT_COLORS.blueSoft),
            ],
          }),
          new TableRow({
            children: [
              createReportValueCell(totalOpportunities, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.wonCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.lostCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.atRiskCount, REPORT_COLORS.slateSoft),
              createReportValueCell(summary.totalActive, REPORT_COLORS.slateSoft),
            ],
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({
        text: `Executive Summary: Currently tracking ${summary.totalActive} active opportunities. Successfully closed ${summary.wonCount} deals while ${summary.lostCount} opportunities were lost. ${summary.atRiskCount} opportunities require immediate attention due to approaching submission deadlines.`,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: 'Opportunity Status Breakdown',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Status', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Count', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Description', REPORT_COLORS.blueSoft),
            ],
          }),
          new TableRow({ children: [createReportValueCell('✅ Working', REPORT_COLORS.slateSoft), createReportValueCell(summary.workingCount, REPORT_COLORS.slateSoft), createReportValueCell('Working on bid submission', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('🏆 Awarded', REPORT_COLORS.slateSoft), createReportValueCell(summary.awardedCount, REPORT_COLORS.slateSoft), createReportValueCell('Won deals', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('❌ Lost', REPORT_COLORS.slateSoft), createReportValueCell(summary.lostCount, REPORT_COLORS.slateSoft), createReportValueCell('Lost opportunities', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('📋 Regretted', REPORT_COLORS.slateSoft), createReportValueCell(summary.regrettedCount, REPORT_COLORS.slateSoft), createReportValueCell('Declined bids', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('🚀 To Start', REPORT_COLORS.slateSoft), createReportValueCell(summary.toStartCount, REPORT_COLORS.slateSoft), createReportValueCell('To start working on the bid', REPORT_COLORS.slateSoft)] }),
          new TableRow({ children: [createReportValueCell('⏱️ At Risk', REPORT_COLORS.slateSoft), createReportValueCell(summary.atRiskCount, REPORT_COLORS.slateSoft), createReportValueCell('Urgent action required', REPORT_COLORS.slateSoft)] }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({ text: 'Recent 5 Tenders', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createReportHeaderCell('Ref No', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Tender Name', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Client', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Received', REPORT_COLORS.blueSoft),
              createReportHeaderCell('Status', REPORT_COLORS.blueSoft),
            ],
          }),
          ...recentTenders.map((row) => new TableRow({
            children: [
              createReportValueCell(row.refNo, REPORT_COLORS.slateSoft),
              createReportValueCell(row.tenderName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.clientName, REPORT_COLORS.slateSoft),
              createReportValueCell(row.receivedDate ? formatDateForReport(row.receivedDate) : '—', REPORT_COLORS.slateSoft),
              createReportValueCell(row.status, REPORT_COLORS.slateSoft),
            ],
          })),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 300 } }),
      new Paragraph({
        text: 'This report is generated automatically from your Sales Pipeline Management System.',
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
      }),
    ];

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="sales-analytics-report-${new Date().toISOString().slice(0, 10)}.docx"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

app.post('/api/tender-updates-report', verifyToken, async (req, res) => {
  try {
    const tenders = Array.isArray(req.body?.tenders) ? req.body.tenders : [];
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

    const updatesByTender = new Map();
    updates.forEach((update) => {
      const key = String(update?.opportunityId || '');
      if (!updatesByTender.has(key)) updatesByTender.set(key, []);
      updatesByTender.get(key).push(update);
    });

    const generatedAt = new Date().toLocaleString();
    const totalUpdates = updates.length;

    const children = [
      new Paragraph({
        text: 'TENDER UPDATES TRACKER REPORT',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Generated: ${generatedAt}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: `Total Tenders: ${tenders.length} • Total Updates: ${totalUpdates}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    tenders.forEach((tender) => {
      const tenderUpdates = updatesByTender.get(String(tender?.id || '')) || [];
      children.push(
        new Paragraph({
          text: `${tender?.opportunityRefNo || ''} • ${tender?.tenderName || 'Tender'}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        }),
        new Paragraph({
          text: `Client: ${tender?.clientName || '—'} | Lead: ${tender?.internalLead || '—'} | Group: ${tender?.groupClassification || '—'}`,
          spacing: { after: 200 },
        })
      );

      if (tenderUpdates.length === 0) {
        children.push(new Paragraph({ text: 'No updates recorded for this tender.', spacing: { after: 200 } }));
        return;
      }

      const rows = [
        new TableRow({
          children: [
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Type' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'SubType' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Actor' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Date' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Due Date' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Details' })] }),
            new TableCell({ borders, shading: { fill: 'f1f5f9', type: ShadingType.CLEAR }, children: [new Paragraph({ text: 'Created By' })] }),
          ],
        }),
        ...tenderUpdates.map((u) => new TableRow({
          children: [
            new TableCell({ borders, children: [new Paragraph(String(u.type || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.subType || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.actor || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.date || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.dueDate || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.details || ''))] }),
            new TableCell({ borders, children: [new Paragraph(String(u.createdBy || ''))] }),
          ],
        })),
      ];

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );
    });

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Disposition', 'attachment; filename=tender-updates-report.docx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate report' });
  }
});

// ── PQ Activities ─────────────────────────────────────────────────────────────
const PQ_TENANT_KEYS = ['avenir_abudhabi', 'avenir_india', 'bcts_dubai', 'bcts_abudhabi', 'avenir_energy', 'avenir_oilfield', 'lauren'];

app.get('/api/pq-activities', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_view')) return;
    const tenant = PQ_TENANT_KEYS.includes(req.query.tenant) ? req.query.tenant : 'avenir_abudhabi';
    const Model = getPqModel(tenant);
    const filter = { tenant };
    if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
    if (req.query.q) {
      const re = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ company: re }, { registeredEmail: re }, { workgroup: re }];
    }
    const rows = await Model.find(filter).sort({ status: 1, company: 1 }).lean();
    res.json({ rows: rows.map(r => ({ ...r, id: r._id.toString() })) });
  } catch (error) { return handleApiError(res, error, 'pq-activities.list'); }
});

app.get('/api/pq-activities/export', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_view')) return;
    const tenant = PQ_TENANT_KEYS.includes(req.query.tenant) ? req.query.tenant : 'avenir_abudhabi';
    const Model = getPqModel(tenant);
    const rows = await Model.find({ tenant }).sort({ status: 1, company: 1 }).lean();
    const headers = ['S.No', 'Company', 'Status', 'Workgroup', 'Registered Email', 'User ID (Portal)', 'Password(Portal)', 'Link(Portal)', 'Image Link', 'Enquiries', 'Renewal Date', 'Last Update', 'Notes'];
    const dataRows = rows.map(r => [
      r.sNo ?? '', r.company || '', r.status || '', r.workgroup || '',
      r.registeredEmail || '', r.userId || '', r.password || '', r.link || '',
      r.imageLink || '', r.enquiries || '',
      r.renewalDate ? new Date(r.renewalDate).toISOString().slice(0, 10) : '',
      r.lastUpdateDate ? new Date(r.lastUpdateDate).toISOString().slice(0, 10) : '',
      r.notes || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PQ Activities');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename=pq-activities-${tenant}-${dateStr}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) { return handleApiError(res, error, 'pq-activities.export'); }
});

app.post('/api/pq-activities/import', verifyToken, express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_manage')) return;
    const tenant = PQ_TENANT_KEYS.includes(req.query.tenant) ? req.query.tenant : 'avenir_abudhabi';
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'No file data received' });
    const wb = XLSX.read(req.body, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return res.status(400).json({ error: 'Empty workbook' });
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!raw.length) return res.status(400).json({ error: 'No rows found in file' });
    const Model = getPqModel(tenant);
    let added = 0, updated = 0;
    for (const row of raw) {
      const company = String(row['Company'] || row['company'] || '').trim();
      if (!company) continue;
      const doc = {
        tenant,
        company,
        sNo: Number(row['S.No'] || row['sNo'] || 0) || 0,
        status: normalizePqStatus(row['Status'] || row['status']),
        workgroup: String(row['Workgroup'] || row['workgroup'] || '').trim(),
        registeredEmail: String(row['Registered Email'] || row['registeredEmail'] || '').trim(),
        userId: String(row['User ID (Portal)'] || row['userId'] || '-').trim() || '-',
        password: String(row['Password(Portal)'] || row['password'] || '').trim(),
        link: String(row['Link(Portal)'] || row['link'] || '-').trim() || '-',
        imageLink: String(row['Image Link'] || row['imageLink'] || '').trim(),
        enquiries: String(row['Enquiries'] || row['enquiries'] || '').trim(),
        notes: String(row['Notes'] || row['notes'] || '').trim(),
        lastUpdateDate: parseOptionalDate(row['Last Update'] || row['lastUpdateDate'] || null),
        renewalDate: parseOptionalDate(row['Renewal Date'] || row['renewalDate'] || null),
      };
      const existing = await Model.findOne({ tenant, company: { $regex: new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      if (existing) {
        await Model.updateOne({ _id: existing._id }, { $set: doc });
        updated++;
      } else {
        await Model.create(doc);
        added++;
      }
    }
    res.json({ ok: true, added, updated });
  } catch (error) { return handleApiError(res, error, 'pq-activities.import'); }
});

app.post('/api/pq-activities', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_manage')) return;
    const parsed = pqActivityCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    const tenant = PQ_TENANT_KEYS.includes(parsed.data.tenant) ? parsed.data.tenant : 'avenir_abudhabi';
    const Model = getPqModel(tenant);
    const doc = await Model.create({ ...parsed.data, tenant });
    res.status(201).json({ ok: true, row: { ...doc.toObject(), id: doc._id.toString() } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'A company with this name already exists for this tenant' });
    return handleApiError(res, error, 'pq-activities.create');
  }
});

app.patch('/api/pq-activities/:id', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_manage')) return;
    const tenant = PQ_TENANT_KEYS.includes(req.query.tenant) ? req.query.tenant : 'avenir_abudhabi';
    const parsed = pqActivityPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    const Model = getPqModel(tenant);
    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, tenant },
      { $set: parsed.data },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true, row: { ...doc.toObject(), id: doc._id.toString() } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'A company with this name already exists for this tenant' });
    return handleApiError(res, error, 'pq-activities.update');
  }
});

app.delete('/api/pq-activities/:id', verifyToken, async (req, res) => {
  try {
    if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
    if (!await requireActionPermission(req, res, 'pq_activities_manage')) return;
    const tenant = PQ_TENANT_KEYS.includes(req.query.tenant) ? req.query.tenant : 'avenir_abudhabi';
    const Model = getPqModel(tenant);
    const doc = await Model.findOneAndDelete({ _id: req.params.id, tenant });
    if (!doc) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (error) { return handleApiError(res, error, 'pq-activities.delete'); }
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
